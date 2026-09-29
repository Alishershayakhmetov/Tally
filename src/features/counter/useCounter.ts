import { useRef, useState } from 'react';

import { addEntry, extendEntry, softDeleteEntry } from '@/db/repos/entries';
import type { TaskWithTotal } from '@/db/repos/tasks';
import { getGlobalDayStartMin } from '@/db/settings';
import type { EntrySource } from '@/db/schema';
import { deviceUtcOffsetMin, effectiveDayStart, logicalDate } from '@/domain/days';
import { nextBurst, planTap, type Burst } from '@/domain/entries';
import { crossedTarget } from '@/domain/progress';
import { goalReachedFeedback, tapFeedback } from '@/lib/haptics';

export type LastChange = { entryId: string; amount: number };

function stamp(task: TaskWithTotal, now: number) {
  const utcOffsetMin = deviceUtcOffsetMin(new Date(now));
  const dayStart = effectiveDayStart(task.dayStartMin, getGlobalDayStartMin());
  return { occurredAt: now, utcOffsetMin, localDate: logicalDate(now, utcOffsetMin, dayStart) };
}

export function useCounter(task: TaskWithTotal) {
  const burst = useRef<Burst | null>(null);
  const [lastChange, setLastChange] = useState<LastChange | null>(null);

  function afterChange(delta: number) {
    if (crossedTarget(task.total, task.total + delta, task.target)) goalReachedFeedback();
    else tapFeedback();
  }

  function insert(amount: number, source: EntrySource, now: number): string {
    return addEntry({ taskId: task.id, amount, source, ...stamp(task, now) }, now);
  }

  function logButton(delta: number) {
    const now = Date.now();
    const { localDate } = stamp(task, now);
    const plan = planTap(burst.current, delta, now, localDate);
    let entryId: string;
    let amount: number;
    if (plan.kind === 'extend') {
      entryId = plan.entryId;
      amount = extendEntry(entryId, delta, now);
    } else {
      entryId = insert(delta, 'button', now);
      amount = delta;
    }
    burst.current = nextBurst(entryId, delta, now, localDate);
    setLastChange({ entryId, amount });
    afterChange(delta);
  }

  function logManual(amount: number) {
    burst.current = null;
    const entryId = insert(amount, 'manual', Date.now());
    setLastChange({ entryId, amount });
    afterChange(amount);
  }

  function deleteEntry(entryId: string) {
    softDeleteEntry(entryId);
    if (burst.current?.entryId === entryId) burst.current = null;
    if (lastChange?.entryId === entryId) setLastChange(null);
  }

  function undo() {
    if (lastChange) deleteEntry(lastChange.entryId);
  }

  function dismissUndo() {
    setLastChange(null);
  }

  return { logButton, logManual, deleteEntry, undo, dismissUndo, lastChange };
}
