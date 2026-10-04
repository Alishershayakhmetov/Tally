import { getGlobalDayStartMin } from '@/db/settings';
import { deviceUtcOffsetMin, effectiveDayStart, logicalDate } from '@/domain/days';

/** When an entry logged at `at` happened, and the logical day it counts for under the task's cutoff. */
export function entryStamp(taskDayStartMin: number | null, at: number) {
  const utcOffsetMin = deviceUtcOffsetMin(new Date(at));
  const dayStart = effectiveDayStart(taskDayStartMin, getGlobalDayStartMin());
  return { occurredAt: at, utcOffsetMin, localDate: logicalDate(at, utcOffsetMin, dayStart) };
}
