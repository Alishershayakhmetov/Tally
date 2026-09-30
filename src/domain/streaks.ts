import { addDays } from './days';
import type { GoalTask } from './goal';
import { daysBetween, periodsBetween, type Period, type Weekday } from './periods';

// Streaks (SPEC §10, Phase 3). Repeating goals count consecutive met periods;
// rest days are not periods, so they never break a streak. Total goals count
// consecutive days with a positive net amount. The period in progress extends a
// streak once it's met but never breaks it.

export type StreakUnit = 'day' | 'week' | 'month';

export type Streak = { current: number; best: number; unit: StreakUnit };

function sumOver(period: Period, dailySums: ReadonlyMap<string, number>): number {
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
  const until = task.endDate !== null && task.endDate < today ? task.endDate : today;
  const from = firstEntryDate !== null && firstEntryDate < task.startDate ? firstEntryDate : task.startDate;
  if (from > until) return { current: 0, best: 0, unit };

  if (task.recurrence === 'none') {
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

  const periods = periodsBetween(task.recurrence, from, until, weekStart, task.weekdayMask);
  const met = periods.map((period) => sumOver(period, dailySums) >= task.target);
  const last = periods.length - 1;
  const inProgress = last >= 0 && periods[last].start <= today && today <= periods[last].end;
  let i = inProgress && !met[last] ? last - 1 : last;
  let current = 0;
  while (i >= 0 && met[i]) {
    current++;
    i--;
  }
  return { current, best: longestRun(met), unit };
}
