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
import type { Period, Weekday } from '@/domain/periods';
import type { Settings } from '@/domain/settings';

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
  const lifecycle = lifecycleOf(task, today);
  let summary: PeriodSummary | null = null;
  if (task.recurrence !== 'none' && lifecycle !== 'active') {
    const days = dailySums(task.id);
    summary = summarizePeriods(
      task,
      today,
      weekStart,
      new Map(days.map((d) => [d.date, d.total])),
      days[0]?.date ?? null,
    );
  }
  return {
    task,
    today,
    lifecycle,
    window,
    goal: goalView(task, today, window ? sumEntries(task.id, window) : task.total),
    summary,
  };
}

export function listTaskViews(nowMs: number, settings: Settings, weekStart: Weekday): TaskView[] {
  return listTasks().map((task) => buildTaskView(task, nowMs, settings, weekStart));
}
