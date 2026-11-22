import type { Task } from '@/db/schema';
import { restartEndDate } from '@/domain/goal';
import type { TaskFormValues } from '@/domain/input';
import { formatDuration } from '@/domain/measure';
import { ALL_WEEKDAYS_MASK } from '@/domain/periods';

/** The Edit form for a saved task. */
export function taskFormValues(task: Task): TaskFormValues {
  return {
    name: task.name,
    emoji: task.emoji,
    color: task.color,
    measure: task.measure,
    unitLabel: task.unitLabel ?? '',
    target: task.measure === 'duration' ? formatDuration(task.target) : String(task.target),
    targetUnit: 'format',
    increments: task.increments.join(', '),
    recurrence: task.recurrence,
    weekdayMask: task.weekdayMask ?? ALL_WEEKDAYS_MASK,
    endDate: task.endDate,
    dayStartMin: task.dayStartMin,
    reminderTime: task.reminderTime,
    description: task.description ?? '',
  };
}

/** The New task form for "Do it again": the same settings, starting `today`, as long as before. */
export function restartFormValues(task: Task, today: string): TaskFormValues {
  return { ...taskFormValues(task), endDate: restartEndDate(task.startDate, task.endDate, today) };
}
