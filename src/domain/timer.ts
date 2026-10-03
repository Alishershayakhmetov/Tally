import type { Recurrence } from './periods';

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
  /** A countdown's length; null (or absent) for a plain stopwatch. */
  countdownMs?: number | null;
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

// Countdown (Phase 6): the same timer with a length. It keeps running past
// 0:00 as overtime, and stopping logs the full elapsed time, so holding a
// plank longer still counts.

/** What the countdown shows: time left, or overtime once it has passed 0:00. */
export type CountdownDisplay = { overtime: boolean; seconds: number };

export function countdownDisplay(timer: TimerState, now: number): CountdownDisplay | null {
  if (timer.countdownMs == null) return null;
  const overMs = elapsedMs(timer, now) - timer.countdownMs;
  // Time left rounds up, so 0:00 shows only at the moment the countdown ends.
  return overMs < 0
    ? { overtime: false, seconds: Math.ceil(-overMs / 1000) }
    : { overtime: true, seconds: Math.floor(overMs / 1000) };
}

/** When a running countdown reaches 0:00; null for a stopwatch, while paused, or once it's over. */
export function countdownEndsAt(timer: TimerState, now: number): number | null {
  if (timer.countdownMs == null || timer.runningSince === null) return null;
  const endsAt = timer.runningSince + timer.countdownMs - timer.accumulatedMs;
  return endsAt > now ? endsAt : null;
}

export const MAX_COUNTDOWN_SECONDS = 24 * 60 * 60;
const FALLBACK_COUNTDOWN_SECONDS = 10 * 60;

/**
 * The length a new countdown starts with: what's left today for a daily goal
 * (the whole target once it's met), the pace line's per-day need, or 10 minutes.
 */
export function defaultCountdownSeconds(goal: {
  recurrence: Recurrence;
  target: number;
  remaining: number;
  pacePerDay: number | null;
}): number {
  const seconds =
    goal.recurrence === 'daily'
      ? goal.remaining > 0
        ? goal.remaining
        : goal.target
      : (goal.pacePerDay ?? FALLBACK_COUNTDOWN_SECONDS);
  return Math.min(MAX_COUNTDOWN_SECONDS, Math.max(1, seconds));
}

/** The countdown length after a ± step, or null when the step would leave 1 s … 24 h. */
export function stepCountdown(seconds: number, deltaSeconds: number): number | null {
  const next = seconds + deltaSeconds;
  return next >= 1 && next <= MAX_COUNTDOWN_SECONDS ? next : null;
}
