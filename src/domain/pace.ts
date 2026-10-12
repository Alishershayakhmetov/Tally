import type { GoalTask } from './goal';
import type { Measure } from './measure';
import { daysBetween, periodContaining, type Period, type Weekday } from './periods';

// Pace (SPEC §10, Phase 3): how much per day finishes the goal on time, and how
// far the total is from an even spread over the window.

export type Pace = {
  /** Needed per day from today on, rounded up to whole units (seconds for time goals). */
  perDay: number;
  /** Days left in the window, including today. */
  daysLeft: number;
  /** Ahead (+) or behind (−) an even spread up to the start of today; 0 = on pace. */
  ahead: number;
};

export type PaceTask = GoalTask & { measure: Measure };

/**
 * A total goal with an end date spans start → end; a weekly or monthly quota
 * spans its current period, cut at the end date. Other goals have no pace.
 */
export function paceWindow(task: GoalTask, today: string, weekStart: Weekday): Period | null {
  if (task.endDate !== null && today > task.endDate) return null;
  switch (task.recurrence) {
    case 'none':
      return task.endDate === null ? null : { start: task.startDate, end: task.endDate };
    case 'weekly':
    case 'monthly': {
      const period = periodContaining(task.recurrence, today, weekStart);
      return {
        start: period.start,
        end: task.endDate !== null && task.endDate < period.end ? task.endDate : period.end,
      };
    }
    case 'daily':
      return null;
  }
}

/** `windowTotal` is the all-time total for total goals, or the current period's total. */
export function computePace(
  task: PaceTask,
  today: string,
  weekStart: Weekday,
  windowTotal: number,
): Pace | null {
  const window = paceWindow(task, today, weekStart);
  if (!window || today < window.start) return null;
  const remaining = task.target - windowTotal;
  if (remaining <= 0) return null;

  // Whole units: counts, or seconds for time goals (minutes until Phase 9).
  const daysLeft = daysBetween(today, window.end) + 1;
  const windowDays = daysBetween(window.start, window.end) + 1;
  const expectedByNow = (task.target * daysBetween(window.start, today)) / windowDays;
  return {
    perDay: Math.ceil(remaining / daysLeft),
    daysLeft,
    // Under one unit either way is "on pace"; `|| 0` turns -0 into 0.
    ahead: Math.trunc(windowTotal - expectedByNow) || 0,
  };
}
