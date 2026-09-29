import { addDays, logicalDate } from './days';
import { lifecycleOf, type GoalTask } from './goal';
import { isQuotaDay, periodContaining, type Weekday } from './periods';

// Local notifications can't run code when they fire, so "skip if done" is
// decided when planning: progress only changes inside the app, and the app
// re-plans after every change (SPEC §5).

export type ReminderTask = GoalTask & {
  id: string;
  /** 'HH:MM' on the phone's wall clock. */
  reminderTime: string;
  /** Effective cutoff in minutes after midnight. */
  dayStartMin: number;
  /** All-time net total. */
  total: number;
};

/** Converts between the phone's wall clock and epoch ms; injected so tests control the time zone. */
export type WallClock = {
  /** Epoch ms for a calendar date at `minutes` after local midnight. */
  toEpoch(date: string, minutes: number): number;
  /** Local UTC offset in minutes at an instant. */
  offsetAt(epochMs: number): number;
};

export type PlannedReminder = {
  taskId: string;
  fireAt: number;
  /** The logical day the reminder is about. */
  day: string;
  /** Still to do in that day's/period's goal when planned, or toward a total goal. */
  remaining: number;
};

export const REMINDER_HORIZON_DAYS = 14;

export function parseReminderTime(text: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/**
 * Upcoming reminder times for one task, skipping days that need none:
 * rest days, a day or period whose quota is already met, a total goal that
 * is reached or already logged today, and anything after the end date.
 * `dailySums` maps logical dates to that day's net amount.
 */
export function planReminders(
  task: ReminderTask,
  nowMs: number,
  weekStart: Weekday,
  clock: WallClock,
  dailySums: ReadonlyMap<string, number>,
  horizonDays = REMINDER_HORIZON_DAYS,
): PlannedReminder[] {
  const minutes = parseReminderTime(task.reminderTime);
  if (minutes === null) return [];
  const dayOf = (epochMs: number) => logicalDate(epochMs, clock.offsetAt(epochMs), task.dayStartMin);
  const today = dayOf(nowMs);
  if (lifecycleOf(task, today) !== 'active') return [];
  if (task.recurrence === 'none' && task.total >= task.target) return [];

  const sumBetween = (start: string, end: string) => {
    let sum = 0;
    for (const [date, amount] of dailySums) if (date >= start && date <= end) sum += amount;
    return sum;
  };

  const calendarToday = logicalDate(nowMs, clock.offsetAt(nowMs), 0);
  const planned: PlannedReminder[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const fireAt = clock.toEpoch(addDays(calendarToday, i), minutes);
    if (fireAt <= nowMs) continue;
    const day = dayOf(fireAt);
    if (task.endDate !== null && day > task.endDate) break;
    if (day < task.startDate) continue;

    let remaining: number;
    if (task.recurrence === 'none') {
      if (day === today && dailySums.has(today)) continue;
      remaining = task.target - task.total;
    } else if (task.recurrence === 'daily') {
      if (!isQuotaDay(task.weekdayMask, day)) continue;
      remaining = task.target - (dailySums.get(day) ?? 0);
    } else {
      const period = periodContaining(task.recurrence, day, weekStart);
      remaining = task.target - sumBetween(period.start, period.end);
    }
    if (remaining <= 0) continue;
    planned.push({ taskId: task.id, fireAt, day, remaining });
  }
  return planned;
}
