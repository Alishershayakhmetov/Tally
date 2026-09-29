// A task counts either whole units ("count") or time in seconds ("duration").
// Duration tasks show amounts as m:ss / h:mm:ss, and their buttons are minutes.

export type Measure = 'count' | 'duration';

const MINUS = '−';

export function formatCount(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n);
}

/** 65 → "1:05", 3600 → "1:00:00", −180 → "−3:00". */
export function formatDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? MINUS : '';
  const s = Math.abs(Math.trunc(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = String(s % 60).padStart(2, '0');
  return hours > 0
    ? `${sign}${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${sign}${minutes}:${seconds}`;
}

export function formatAmount(measure: Measure, n: number): string {
  return measure === 'duration' ? formatDuration(n) : formatCount(n);
}

export function formatSignedAmount(measure: Measure, n: number): string {
  return n > 0 ? `+${formatAmount(measure, n)}` : formatAmount(measure, n);
}

/** Counter buttons are stored as typed: units for counts, minutes for durations. */
export function buttonAmount(measure: Measure, increment: number): number {
  return measure === 'duration' ? increment * 60 : increment;
}

const DURATION = /^([+\-−]?)(\d+)(?::(\d{2}))?(?::(\d{2}))?$/;

/**
 * "25" → 25 minutes, "1:30" → 1 min 30 s, "1:05:00" → 1 h 5 min, in seconds.
 * A leading sign is allowed. Returns null for anything else.
 */
export function parseDurationText(text: string): number | null {
  const match = DURATION.exec(text.trim().replace(/\s+/g, ''));
  if (!match) return null;
  const [, sign, first, second, third] = match;
  let seconds: number;
  if (second === undefined) {
    seconds = Number(first) * 60;
  } else if (third === undefined) {
    if (Number(second) >= 60) return null;
    seconds = Number(first) * 60 + Number(second);
  } else {
    if (Number(second) >= 60 || Number(third) >= 60) return null;
    seconds = Number(first) * 3600 + Number(second) * 60 + Number(third);
  }
  if (!Number.isSafeInteger(seconds)) return null;
  return sign === '-' || sign === '−' ? -seconds : seconds;
}
