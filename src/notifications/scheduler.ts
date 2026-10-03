import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { subscribeDataChanges } from '@/db/live';
import { dailySums } from '@/db/repos/entries';
import { getTask, listTasks, type TaskWithTotal } from '@/db/repos/tasks';
import { getActiveTimer } from '@/db/repos/timers';
import { getSettings } from '@/db/settings';
import { effectiveDayStart } from '@/domain/days';
import { formatAmount, formatDuration } from '@/domain/measure';
import { resolveWeekStart } from '@/domain/periods';
import { planReminders, type PlannedReminder, type WallClock } from '@/domain/reminders';
import { countdownEndsAt } from '@/domain/timer';
import i18n from '@/i18n';
import { getClockOffsetMs, now } from '@/lib/clock';
import { localeFirstWeekday } from '@/lib/weekStart';

// Reminders are re-planned from scratch after every data change and whenever
// the app comes to the foreground: cancel what this app scheduled, then
// schedule the next two weeks (SPEC §5), plus a running countdown's "time's up"
// alert. Planning uses the real clock, not the dev offset, because the OS fires
// notifications on the real clock.

const CHANNEL_ID = 'reminders';
/** A separate channel, so reminders can be muted in system settings without muting countdowns. */
const TIMER_CHANNEL_ID = 'timers';
/** At most one countdown runs, so its alert has a fixed identifier. */
const COUNTDOWN_ID = 'countdown';
/** Android caps pending alarms per app at 500. */
const MAX_SCHEDULED = 400;
const REFRESH_DEBOUNCE_MS = 800;

export const remindersSupported = Platform.OS !== 'web';

export type NotificationPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

const deviceClock: WallClock = {
  toEpoch(date, minutes) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60).getTime();
  },
  offsetAt: (epochMs) => -new Date(epochMs).getTimezoneOffset(),
};

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: i18n.t('reminder.channel'),
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync(TIMER_CHANNEL_ID, {
    name: i18n.t('countdown.channel'),
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (!remindersSupported) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/** Android 13+ only shows the system prompt once a channel exists. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!remindersSupported) return 'unavailable';
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) return current.status;
  const { status } = await Notifications.requestPermissionsAsync();
  refreshReminders();
  return status;
}

export function useNotificationPermission(): [NotificationPermission | null, () => Promise<void>] {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  useEffect(() => {
    let alive = true;
    const read = () => getNotificationPermission().then((p) => alive && setPermission(p));
    void read();
    const sub = AppState.addEventListener('change', (state) => state === 'active' && void read());
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  const request = async () => setPermission(await requestNotificationPermission());
  return [permission, request];
}

function bodyFor(task: TaskWithTotal, plan: PlannedReminder): string {
  const unit = task.unitLabel ? ` ${task.unitLabel}` : '';
  const remaining = `${formatAmount(task.measure, plan.remaining)}${unit}`;
  const key = {
    none: 'reminder.bodyTotal',
    daily: 'reminder.bodyDaily',
    weekly: 'reminder.bodyWeekly',
    monthly: 'reminder.bodyMonthly',
  }[task.recurrence];
  return i18n.t(key, { remaining });
}

async function replan(): Promise<void> {
  const permission = await Notifications.getPermissionsAsync();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!permission.granted) return;
  await ensureChannel();

  const settings = getSettings();
  const weekStart = resolveWeekStart(settings.weekStart, localeFirstWeekday());
  const nowMs = Date.now();
  const tasks = new Map(listTasks().map((task) => [task.id, task]));
  const planned: PlannedReminder[] = [];
  for (const task of tasks.values()) {
    if (!task.reminderTime) continue;
    const sums = new Map(dailySums(task.id).map((d) => [d.date, d.total]));
    planned.push(
      ...planReminders(
        {
          ...task,
          reminderTime: task.reminderTime,
          dayStartMin: effectiveDayStart(task.dayStartMin, settings.dayStartMin),
        },
        nowMs,
        weekStart,
        deviceClock,
        sums,
      ),
    );
  }
  planned.sort((a, b) => a.fireAt - b.fireAt);

  const countdown = countdownAlert();
  if (countdown) {
    await Notifications.scheduleNotificationAsync({
      identifier: COUNTDOWN_ID,
      content: countdown.content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: countdown.at,
        channelId: TIMER_CHANNEL_ID,
      },
    });
  }

  for (const plan of planned.slice(0, MAX_SCHEDULED)) {
    const task = tasks.get(plan.taskId)!;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: task.emoji ? `${task.emoji} ${task.name}` : task.name,
        body: bodyFor(task, plan),
        data: { taskId: task.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: plan.fireAt,
        channelId: CHANNEL_ID,
      },
    });
  }
}

/** Notification work runs one job at a time, so a plan and an alert never interleave. */
let queue: Promise<void> = Promise.resolve();

// Countdown alert (Phase 6). The scheduled notification above covers a closed
// app, but without the exact-alarm permission Android may deliver it minutes
// late. While the app runs, a JS timer posts the alert right at 0:00 instead.

type CountdownAlert = {
  /** Real-clock epoch ms (the timer's timestamps include the dev clock offset). */
  at: number;
  content: Notifications.NotificationContentInput;
};

/** A countdown alert this late is skipped: the app was asleep, and the scheduled one covers it. */
const RING_LATE_LIMIT_MS = 5_000;

function countdownAlert(): CountdownAlert | null {
  const active = getActiveTimer();
  const endsAt = active ? countdownEndsAt(active, now()) : null;
  const task = active && endsAt !== null ? getTask(active.taskId) : undefined;
  if (!active?.countdownMs || endsAt === null || !task) return null;
  return {
    at: endsAt - getClockOffsetMs(),
    content: {
      title: task.emoji ? `${task.emoji} ${task.name}` : task.name,
      body: i18n.t('countdown.doneBody', { time: formatDuration(Math.round(active.countdownMs / 1000)) }),
      data: { taskId: task.id },
    },
  };
}

async function ring(alert: CountdownAlert): Promise<void> {
  if (Date.now() - alert.at > RING_LATE_LIMIT_MS) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const presented = await Notifications.getPresentedNotificationsAsync();
  if (presented.some((n) => n.request.identifier === COUNTDOWN_ID)) return;
  await Notifications.cancelScheduledNotificationAsync(COUNTDOWN_ID);
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: COUNTDOWN_ID,
    content: alert.content,
    trigger: Platform.OS === 'android' ? { channelId: TIMER_CHANNEL_ID } : null,
  });
}

let alarm: ReturnType<typeof setTimeout> | null = null;
let hadCountdown = false;

/** Re-arms on every data change, so pausing, stopping or discarding cancels the alert. */
function armCountdown(): void {
  if (alarm) clearTimeout(alarm);
  alarm = null;
  const active = getActiveTimer();
  if (active?.countdownMs != null) hadCountdown = true;
  else if (hadCountdown) {
    // The countdown was stopped or discarded: its "time's up" alert is stale.
    hadCountdown = false;
    void Notifications.dismissNotificationAsync(COUNTDOWN_ID).catch(() => {});
  }
  const alert = countdownAlert();
  if (!alert) return;
  alarm = setTimeout(
    () => {
      alarm = null;
      queue = queue
        .then(() => ring(alert))
        .catch((error: unknown) => console.warn('Countdown alert failed', error));
    },
    Math.max(0, alert.at - Date.now()),
  );
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced; runs are serialised so two plans never interleave. */
export function refreshReminders(delayMs = REFRESH_DEBOUNCE_MS): void {
  if (!remindersSupported) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    queue = queue.then(replan).catch((error: unknown) => console.warn('Reminder planning failed', error));
  }, delayMs);
}

/** Call once the database is open. Returns a cleanup function. */
export function startReminders(openTask: (taskId: string) => void): () => void {
  if (!remindersSupported) return () => {};
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  const open = (response: Notifications.NotificationResponse | null) => {
    const taskId = response?.notification.request.content.data?.taskId;
    if (typeof taskId === 'string') openTask(taskId);
  };
  open(Notifications.getLastNotificationResponse());
  const responses = Notifications.addNotificationResponseReceivedListener(open);
  const unsubscribe = subscribeDataChanges(() => {
    armCountdown();
    refreshReminders();
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    armCountdown();
    refreshReminders(0);
  });
  armCountdown();
  refreshReminders(0);

  return () => {
    responses.remove();
    unsubscribe();
    appState.remove();
    if (alarm) clearTimeout(alarm);
  };
}
