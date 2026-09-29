export const COALESCE_WINDOW_MS = 2000;

/** The entry that rapid button taps are currently being merged into. */
export type Burst = {
  entryId: string;
  lastTapAt: number;
  localDate: string;
  direction: 1 | -1;
};

export type TapPlan = { kind: 'extend'; entryId: string } | { kind: 'new' };

/**
 * Taps merge into the previous entry when they come within the window, go in
 * the same direction and fall on the same logical day. A -1 after a run of +1
 * starts its own entry, so corrections stay visible in the history.
 */
export function planTap(burst: Burst | null, delta: number, now: number, localDate: string): TapPlan {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new RangeError(`delta must be a non-zero integer, got ${delta}`);
  }
  if (
    burst !== null &&
    now - burst.lastTapAt <= COALESCE_WINDOW_MS &&
    now >= burst.lastTapAt &&
    burst.localDate === localDate &&
    Math.sign(delta) === burst.direction
  ) {
    return { kind: 'extend', entryId: burst.entryId };
  }
  return { kind: 'new' };
}

export function nextBurst(entryId: string, delta: number, now: number, localDate: string): Burst {
  return { entryId, lastTapAt: now, localDate, direction: delta > 0 ? 1 : -1 };
}
