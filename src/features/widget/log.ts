import { addEntry, extendEntry } from '@/db/repos/entries';
import { getTask, type TaskWithTotal } from '@/db/repos/tasks';
import { nextBurst, planTap, type Burst } from '@/domain/entries';
import { lifecycleOf } from '@/domain/goal';
import { groupWidgetTaps, widgetStep, type WidgetTap } from '@/domain/widget';
import { entryStamp } from '@/features/counter/stamp';
import { now } from '@/lib/clock';

/** Presses merge like counter taps; kept per task while the app process lives. */
const bursts = new Map<string, Burst>();

/**
 * Android: one press of a task's + on the widget, logged right away. Returns
 * false when the task is gone, has ended, or has no + button any more.
 */
export function logWidgetPress(taskId: string, at = now()): boolean {
  const task = getTask(taskId);
  if (!task) return false;
  const stamp = entryStamp(task.dayStartMin, at);
  const step = widgetStep(task.measure, task.increments);
  if (step === null || lifecycleOf(task, stamp.localDate) !== 'active') return false;

  const plan = planTap(bursts.get(taskId) ?? null, step, at, stamp.localDate);
  let entryId: string | null = null;
  if (plan.kind === 'extend') {
    try {
      extendEntry(plan.entryId, step, at);
      entryId = plan.entryId;
    } catch {
      // The entry was undone or deleted in the app meanwhile: start a new one.
    }
  }
  entryId ??= addEntry({ taskId, amount: step, source: 'button', note: null, ...stamp }, at);
  bursts.set(taskId, nextBurst(entryId, step, at, stamp.localDate));
  return true;
}

/**
 * iOS: presses the widget kept while the app wasn't running, logged with the
 * time each was made. Presses for deleted tasks are dropped. Returns the
 * number of entries written.
 */
export function logWidgetTaps(taps: readonly WidgetTap[]): number {
  const tasks = new Map<string, TaskWithTotal | undefined>();
  const taskOf = (id: string) => {
    if (!tasks.has(id)) tasks.set(id, getTask(id));
    return tasks.get(id);
  };
  const known = taps.filter((tap) => taskOf(tap.taskId) !== undefined);
  const dayStart = (taskId: string) => taskOf(taskId)?.dayStartMin ?? null;
  const groups = groupWidgetTaps(known, (taskId, at) => entryStamp(dayStart(taskId), at).localDate);
  const at = now();
  for (const group of groups) {
    addEntry(
      {
        taskId: group.taskId,
        amount: group.amount,
        source: 'button',
        note: null,
        ...entryStamp(dayStart(group.taskId), group.at),
      },
      at,
    );
  }
  return groups.length;
}
