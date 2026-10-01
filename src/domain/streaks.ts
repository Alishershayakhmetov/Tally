import { addDays } from './days';
import type { GoalTask } from './goal';
import { daysBetween, periodsBetween, type Period, type Weekday } from './periods';

// Streaks (SPEC §10, Phase 3). Repeating goals count consecutive met periods;
// rest days are not periods, so they never break a streak. Total goals count
// consecutive days with a positive net amount. The period in progress extends a
// streak once it's met but never breaks it.

export type StreakUnit = 'day' | 'week' | 'month';

export type Streak = { current: number; best: number; unit: StreakUnit };

/** Net amount logged on the days of `period`. */
export function sumOver(period: Period, dailySums: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (let date = period.start; date <= period.end; date = addDays(date, 1)) {
    sum += dailySums.get(date) ?? 0;
  }
  return sum;
}

function longestRun(flags: readonly boolean[]): number {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** Days counted: from the start date (or an earlier first entry) to today or the end date. */
function span(task: GoalTask, today: string, firstEntryDate: string | null): { from: string; until: string } {
  return {
    from: firstEntryDate !== null && firstEntryDate < task.startDate ? firstEntryDate : task.startDate,
    until: task.endDate !== null && task.endDate < today ? task.endDate : today,
  };
}

export type PeriodResults = {
  /** Whether each quota period, oldest first, reached the target. Rest days are not periods. */
  met: boolean[];
  /** The last period contains today, so a miss there isn't final yet. */
  inProgress: boolean;
};

/** Met or missed for every period of a repeating goal; empty for total goals. */
export function periodResults(
  task: GoalTask,
  today: string,
  weekStart: Weekday,
  dailySums: ReadonlyMap<string, number>,
  firstEntryDate: string | null,
): PeriodResults {
  const { from, until } = span(task, today, firstEntryDate);
  if (task.recurrence === 'none' || from > until) return { met: [], inProgress: false };
  const periods = periodsBetween(task.recurrence, from, until, weekStart, task.weekdayMask);
  const last = periods[periods.length - 1];
  return {
    met: periods.map((period) => sumOver(period, dailySums) >= task.target),
    inProgress: last !== undefined && last.start <= today && today <= last.end,
  };
}

/**
 * `dailySums` maps logical dates to that day's net amount; `firstEntryDate` is
 * the earliest of them (entries may predate the start date after an edit).
 */
export function computeStreak(
  task: GoalTask,
  today: string,
  weekStart: Weekday,
  dailySums: ReadonlyMap<string, number>,
  firstEntryDate: string | null,
): Streak {
  const unit: StreakUnit =
    task.recurrence === 'weekly' ? 'week' : task.recurrence === 'monthly' ? 'month' : 'day';

  if (task.recurrence === 'none') {
    const { from, until } = span(task, today, firstEntryDate);
    if (from > until) return { current: 0, best: 0, unit };
    const logged = (date: string) => (dailySums.get(date) ?? 0) > 0;
    const days = Array.from({ length: daysBetween(from, until) + 1 }, (_, i) => logged(addDays(from, i)));
    let date = until === today && !logged(today) ? addDays(today, -1) : until;
    let current = 0;
    while (date >= from && logged(date)) {
      current++;
      date = addDays(date, -1);
    }
    return { current, best: longestRun(days), unit };
  }

  const { met, inProgress } = periodResults(task, today, weekStart, dailySums, firstEntryDate);
  const last = met.length - 1;
  let i = inProgress && !met[last] ? last - 1 : last;
  let current = 0;
  while (i >= 0 && met[i]) {
    current++;
    i--;
  }
  return { current, best: longestRun(met), unit };
}
