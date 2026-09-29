// The stopwatch is stored as timestamps, never as a ticking number, so it
// survives backgrounding, screen lock and the app being killed (SPEC §4.1).

export type TimerState = {
  taskId: string;
  /** Becomes the entry's occurred_at, so the time counts toward the day it started. */
  firstStartedAt: number;
  utcOffsetMin: number;
  /** null while paused. */
  runningSince: number | null;
  accumulatedMs: number;
};

export function elapsedMs(timer: TimerState, now: number): number {
  const running = timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince);
  return timer.accumulatedMs + running;
}

export function pauseTimer(timer: TimerState, now: number): TimerState {
  if (timer.runningSince === null) return timer;
  return { ...timer, accumulatedMs: elapsedMs(timer, now), runningSince: null };
}

export function resumeTimer(timer: TimerState, now: number): TimerState {
  if (timer.runningSince !== null) return timer;
  return { ...timer, runningSince: now };
}

/** Whole seconds to log when the timer stops. */
export function loggedSeconds(timer: TimerState, now: number): number {
  return Math.floor(elapsedMs(timer, now) / 1000);
}
