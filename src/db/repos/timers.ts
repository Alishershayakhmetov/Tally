import { eq } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { deviceUtcOffsetMin, effectiveDayStart, logicalDate } from '@/domain/days';
import { loggedSeconds, pauseTimer, resumeTimer, type TimerState } from '@/domain/timer';
import { now } from '@/lib/clock';

import { getDb } from '../client';
import { notifyDataChanged } from '../live';
import { activeTimer, entries } from '../schema';
import { getGlobalDayStartMin } from '../settings';

export function getActiveTimer(): TimerState | undefined {
  return getDb().select().from(activeTimer).get();
}

/**
 * Only one timer runs at a time; returns false if another one exists.
 * `countdownMs` makes it a countdown of that length (Phase 6).
 */
export function startTimer(taskId: string, countdownMs: number | null = null, at = now()): boolean {
  if (getActiveTimer()) return false;
  getDb()
    .insert(activeTimer)
    .values({
      taskId,
      firstStartedAt: at,
      utcOffsetMin: deviceUtcOffsetMin(new Date(at)),
      runningSince: at,
      accumulatedMs: 0,
      countdownMs,
    })
    .run();
  notifyDataChanged();
  return true;
}

function save(timer: TimerState) {
  getDb()
    .update(activeTimer)
    .set({ runningSince: timer.runningSince, accumulatedMs: timer.accumulatedMs })
    .where(eq(activeTimer.taskId, timer.taskId))
    .run();
  notifyDataChanged();
}

export function pauseActiveTimer(at = now()): void {
  const timer = getActiveTimer();
  if (timer) save(pauseTimer(timer, at));
}

export function resumeActiveTimer(at = now()): void {
  const timer = getActiveTimer();
  if (timer) save(resumeTimer(timer, at));
}

export function discardTimer(): void {
  getDb().delete(activeTimer).run();
  notifyDataChanged();
}

/**
 * Logs the elapsed time as one entry dated when the stopwatch first started,
 * so it counts toward that day (SPEC §4.1). Returns the entry, or null if
 * less than a second was timed.
 */
export function stopTimer(
  taskDayStartMin: number | null,
  at = now(),
): { entryId: string; seconds: number } | null {
  const timer = getActiveTimer();
  if (!timer) return null;
  const seconds = loggedSeconds(timer, at);
  const db = getDb();
  let entryId: string | null = null;
  db.transaction((tx) => {
    if (seconds > 0) {
      entryId = randomUUID();
      tx.insert(entries)
        .values({
          id: entryId,
          taskId: timer.taskId,
          amount: seconds,
          source: 'timer',
          occurredAt: timer.firstStartedAt,
          utcOffsetMin: timer.utcOffsetMin,
          localDate: logicalDate(
            timer.firstStartedAt,
            timer.utcOffsetMin,
            effectiveDayStart(taskDayStartMin, getGlobalDayStartMin()),
          ),
          createdAt: at,
          updatedAt: at,
        })
        .run();
    }
    tx.delete(activeTimer).run();
  });
  notifyDataChanged();
  return entryId ? { entryId, seconds } : null;
}
