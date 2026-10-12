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

// A typed time can also be a plain number in a unit the user picks (Phase 9):
// "1,5" hours, "90" seconds. 'format' is the text above (minutes, m:ss, h:mm:ss).

export type DurationUnit = 'format' | 'hours' | 'minutes' | 'seconds';
export const DURATION_UNITS: readonly DurationUnit[] = ['format', 'hours', 'minutes', 'seconds'];

const UNIT_SECONDS = { hours: 3600, minutes: 60, seconds: 1 } as const;
/** "45", "1.5", "1,5" (a comma for Russian keyboards), ".5", with an optional sign. */
const NUMBER = /^([+\-−]?)(\d+(?:[.,]\d+)?|[.,]\d+)$/;

/** Seconds, rounded to whole ones, or null when the text doesn't fit the unit. */
export function parseDurationIn(text: string, unit: DurationUnit): number | null {
  if (unit === 'format') return parseDurationText(text);
  const match = NUMBER.exec(text.trim().replace(/\s+/g, ''));
  if (!match) return null;
  const seconds = Math.round(Number(match[2].replace(',', '.')) * UNIT_SECONDS[unit]);
  if (!Number.isSafeInteger(seconds)) return null;
  return (match[1] === '-' || match[1] === '−') && seconds !== 0 ? -seconds : seconds;
}

/**
 * The text to keep when the user picks another unit. A plain number stays as
 * typed, so "45" then Seconds means 45 seconds. A time in m:ss or h:mm:ss (an
 * entry being edited) is converted when the new unit shows it exactly.
 */
export function switchDurationUnit(text: string, from: DurationUnit, to: DurationUnit): string {
  const trimmed = text.trim();
  if (to === 'format' || NUMBER.test(trimmed.replace(/\s+/g, ''))) return text;
  const seconds = parseDurationIn(trimmed, from);
  if (seconds === null) return text;
  const hundredths = (seconds / UNIT_SECONDS[to]) * 100;
  // Two decimals at most: 1:30:00 becomes 1.5 hours, 1:05:00 stays as typed.
  return Math.abs(hundredths - Math.round(hundredths)) < 1e-6 ? String(Math.round(hundredths) / 100) : text;
}
