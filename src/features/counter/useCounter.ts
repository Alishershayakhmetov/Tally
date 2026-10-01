import { useRef, useState } from 'react';

import { addEntry, extendEntry, softDeleteEntry } from '@/db/repos/entries';
import type { TaskWithTotal } from '@/db/repos/tasks';
import type { EntrySource } from '@/db/schema';
import { getGlobalDayStartMin } from '@/db/settings';
import { deviceUtcOffsetMin, effectiveDayStart, logicalDate } from '@/domain/days';
import { nextBurst, planTap, type Burst } from '@/domain/entries';
import { crossedTarget } from '@/domain/progress';
import { now } from '@/lib/clock';
import { goalReachedFeedback, tapFeedback } from '@/lib/haptics';

export type LastChange = { entryId: string; amount: number };

function stamp(task: TaskWithTotal, at: number) {
  const utcOffsetMin = deviceUtcOffsetMin(new Date(at));
  const dayStart = effectiveDayStart(task.dayStartMin, getGlobalDayStartMin());
  return { occurredAt: at, utcOffsetMin, localDate: logicalDate(at, utcOffsetMin, dayStart) };
}

/** `windowTotal` is what the screen shows: today's/this week's total, or the all-time total. */
export function useCounter(task: TaskWithTotal, windowTotal: number) {
  const burst = useRef<Burst | null>(null);
  const [lastChange, setLastChange] = useState<LastChange | null>(null);

  function afterChange(delta: number) {
    if (crossedTarget(windowTotal, windowTotal + delta, task.target)) goalReachedFeedback();
    else tapFeedback();
  }

  function insert(amount: number, source: EntrySource, at: number, note: string | null = null): string {
    return addEntry({ taskId: task.id, amount, source, note, ...stamp(task, at) }, at);
  }

  function logButton(delta: number) {
    const at = now();
    const { localDate } = stamp(task, at);
    const plan = planTap(burst.current, delta, at, localDate);
    let entryId: string;
    let amount: number;
    if (plan.kind === 'extend') {
      entryId = plan.entryId;
      amount = extendEntry(entryId, delta, at);
    } else {
      entryId = insert(delta, 'button', at);
      amount = delta;
    }
    burst.current = nextBurst(entryId, delta, at, localDate);
    setLastChange({ entryId, amount });
    afterChange(delta);
  }

  function logManual(amount: number, note: string | null = null) {
    burst.current = null;
    const entryId = insert(amount, 'manual', now(), note);
    setLastChange({ entryId, amount });
    afterChange(amount);
  }

  /** An entry written elsewhere (the stopwatch) gets the same Undo bar and feedback. */
  function recordLogged(entryId: string, amount: number) {
    burst.current = null;
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

  return { logButton, logManual, recordLogged, deleteEntry, undo, dismissUndo, lastChange };
}
