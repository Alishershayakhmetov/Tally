import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { subscribeDataChanges } from '@/db/live';
import { dailySums } from '@/db/repos/entries';
import { listTasks, type TaskWithTotal } from '@/db/repos/tasks';
import { getSettings } from '@/db/settings';
import { effectiveDayStart } from '@/domain/days';
import { formatAmount } from '@/domain/measure';
import { resolveWeekStart } from '@/domain/periods';
import { planReminders, type PlannedReminder, type WallClock } from '@/domain/reminders';
import i18n from '@/i18n';
import { localeFirstWeekday } from '@/lib/weekStart';

// Reminders are re-planned from scratch after every data change and whenever
// the app comes to the foreground: cancel what this app scheduled, then
// schedule the next two weeks (SPEC §5). Planning uses the real clock, not the
// dev offset, because the OS fires notifications on the real clock.

const CHANNEL_ID = 'reminders';
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

let timer: ReturnType<typeof setTimeout> | null = null;
let queue: Promise<void> = Promise.resolve();

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
  const unsubscribe = subscribeDataChanges(() => refreshReminders());
  const appState = AppState.addEventListener('change', (state) => state === 'active' && refreshReminders(0));
  refreshReminders(0);

  return () => {
    responses.remove();
    unsubscribe();
    appState.remove();
  };
}
