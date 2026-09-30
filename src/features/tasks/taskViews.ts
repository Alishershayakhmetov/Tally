import { dailySums, sumEntries } from '@/db/repos/entries';
import { listTasks, type TaskWithTotal } from '@/db/repos/tasks';
import { currentLogicalDate, effectiveDayStart } from '@/domain/days';
import {
  currentWindow,
  goalView,
  lifecycleOf,
  summarizePeriods,
  type GoalView,
  type Lifecycle,
  type PeriodSummary,
} from '@/domain/goal';
import { computePace, type Pace } from '@/domain/pace';
import type { Period, Weekday } from '@/domain/periods';
import type { Settings } from '@/domain/settings';
import { computeStreak, type Streak } from '@/domain/streaks';

export type TaskView = {
  task: TaskWithTotal;
  /** This task's logical today, under its effective cutoff. */
  today: string;
  lifecycle: Lifecycle;
  /** The current period for repeating goals; null for total goals. */
  window: Period | null;
  goal: GoalView;
  /** Periods met so far, for repeating goals that have ended or been archived. */
  summary: PeriodSummary | null;
  /** Needed per day and ahead/behind, for active goals with a bounded window. */
  pace: Pace | null;
  streak: Streak;
};

export function buildTaskView(
  task: TaskWithTotal,
  nowMs: number,
  settings: Settings,
  weekStart: Weekday,
): TaskView {
  const today = currentLogicalDate(
    new Date(nowMs),
    effectiveDayStart(task.dayStartMin, settings.dayStartMin),
  );
  const window = currentWindow(task, today, weekStart);
  const windowTotal = window ? sumEntries(task.id, window) : task.total;
  const lifecycle = lifecycleOf(task, today);
  const days = dailySums(task.id);
  const sums = new Map(days.map((d) => [d.date, d.total]));
  const firstEntryDate = days[0]?.date ?? null;
  return {
    task,
    today,
    lifecycle,
    window,
    goal: goalView(task, today, windowTotal),
    summary:
      task.recurrence !== 'none' && lifecycle !== 'active'
        ? summarizePeriods(task, today, weekStart, sums, firstEntryDate)
        : null,
    pace: lifecycle === 'active' ? computePace(task, today, weekStart, windowTotal) : null,
    streak: computeStreak(task, today, weekStart, sums, firstEntryDate),
  };
}

export function listTaskViews(nowMs: number, settings: Settings, weekStart: Weekday): TaskView[] {
  return listTasks().map((task) => buildTaskView(task, nowMs, settings, weekStart));
}
