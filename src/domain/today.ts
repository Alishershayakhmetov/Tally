import type { Lifecycle } from './goal';
import type { Recurrence } from './periods';

// The Today summary on Home (Phase 6). Tasks measure different things, so it
// counts goals met rather than adding amounts. Only daily goals have a fixed
// amount for today; weekly, monthly and total goals are left out, and so is a
// daily goal on its rest day.

/** The parts of a task view the summary reads (TaskView fits). */
export type DayGoal = {
  lifecycle: Lifecycle;
  task: { recurrence: Recurrence };
  goal: { restDay: boolean; progress: { done: boolean } };
};

/** With fewer goals than this, the summary would only repeat the card below it. */
export const MIN_TODAY_GOALS = 2;

export type TodaySummary<T> = { goals: T[]; done: number };

/** Today's daily goals in Home order, or null when there are too few to summarise. */
export function todaySummary<T extends DayGoal>(views: readonly T[]): TodaySummary<T> | null {
  const goals = views.filter(
    (view) => view.lifecycle === 'active' && view.task.recurrence === 'daily' && !view.goal.restDay,
  );
  if (goals.length < MIN_TODAY_GOALS) return null;
  return { goals, done: goals.filter((view) => view.goal.progress.done).length };
}
