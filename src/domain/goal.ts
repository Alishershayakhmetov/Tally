import { addDays } from './days';
import {
  daysBetween,
  isQuotaDay,
  periodContaining,
  periodsBetween,
  type Period,
  type Recurrence,
  type Weekday,
} from './periods';
import { computeProgress, type Progress } from './progress';

export type GoalTask = {
  target: number;
  recurrence: Recurrence;
  weekdayMask: number | null;
  startDate: string;
  endDate: string | null;
  archivedAt: number | null;
};

export type Lifecycle = 'active' | 'finished' | 'archived';

export function lifecycleOf(task: GoalTask, today: string): Lifecycle {
  if (task.archivedAt !== null) return 'archived';
  if (task.endDate !== null && today > task.endDate) return 'finished';
  return 'active';
}

/** Days left including today; 1 on the last day. Null without an end date or once it has passed. */
export function daysLeft(endDate: string | null, today: string): number | null {
  if (endDate === null || today > endDate) return null;
  return daysBetween(today, endDate) + 1;
}

/**
 * "Do it again" (Phase 6): a finished challenge copied to start on `today`
 * keeps its length, so "1000 squats in 30 days" again runs 30 days.
 */
export function restartEndDate(startDate: string, endDate: string | null, today: string): string | null {
  if (endDate === null) return null;
  return addDays(today, Math.max(0, daysBetween(startDate, endDate)));
}

/** The period the counter screen and card show, or the whole history for total goals. */
export function currentWindow(task: GoalTask, today: string, weekStart: Weekday): Period | null {
  return task.recurrence === 'none' ? null : periodContaining(task.recurrence, today, weekStart);
}

export type GoalView = {
  progress: Progress;
  /** Daily quota with a weekday mask, on a day without a quota. */
  restDay: boolean;
  daysLeft: number | null;
};

/** `windowTotal` is the all-time total for total goals, or the current period's total. */
export function goalView(task: GoalTask, today: string, windowTotal: number): GoalView {
  return {
    progress: computeProgress(windowTotal, task.target),
    restDay: task.recurrence === 'daily' && !isQuotaDay(task.weekdayMask, today),
    daysLeft: daysLeft(task.endDate, today),
  };
}

export type PeriodSummary = { met: number; total: number };

/**
 * How many periods between the start and min(today, end) reached the target.
 * `dailySums` maps logical dates to that day's net amount.
 */
export function summarizePeriods(
  task: GoalTask,
  until: string,
  weekStart: Weekday,
  dailySums: ReadonlyMap<string, number>,
  firstEntryDate: string | null,
): PeriodSummary {
  if (task.recurrence === 'none') return { met: 0, total: 0 };
  const from = firstEntryDate !== null && firstEntryDate < task.startDate ? firstEntryDate : task.startDate;
  const to = task.endDate !== null && task.endDate < until ? task.endDate : until;
  if (from > to) return { met: 0, total: 0 };
  const periods = periodsBetween(task.recurrence, from, to, weekStart, task.weekdayMask);
  let met = 0;
  for (const period of periods) {
    let sum = 0;
    for (const [date, amount] of dailySums) {
      if (date >= period.start && date <= period.end) sum += amount;
    }
    if (sum >= task.target) met++;
  }
  return { met, total: periods.length };
}
