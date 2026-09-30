export const MAX_DAY_START_MIN = 720;

export function effectiveDayStart(taskDayStartMin: number | null, globalDayStartMin: number): number {
  return taskDayStartMin ?? globalDayStartMin;
}

export function deviceUtcOffsetMin(at: Date): number {
  return -at.getTimezoneOffset();
}

/** SQLite twin of logicalDate(); `dayStartMin` is an SQL expression for the cutoff in minutes. */
export function logicalDateSql(dayStartMin: string): string {
  return `date(occurred_at / 1000 + utc_offset_min * 60 - (${dayStartMin}) * 60, 'unixepoch')`;
}

/** For re-grouping entries when a cutoff changes. */
export const LOGICAL_DATE_SQL = logicalDateSql(':day_start_min');

/**
 * The day an entry belongs to. Works on the wall-clock time the user saw
 * (UTC + offset at log time), so DST nights need no special handling.
 * Must agree with LOGICAL_DATE_SQL (checked in days.test.ts).
 */
export function logicalDate(occurredAtMs: number, utcOffsetMin: number, dayStartMin: number): string {
  const wallClockMs = occurredAtMs + (utcOffsetMin - dayStartMin) * 60_000;
  return new Date(wallClockMs).toISOString().slice(0, 10);
}

export function currentLogicalDate(now: Date, dayStartMin: number): string {
  return logicalDate(now.getTime(), deviceUtcOffsetMin(now), dayStartMin);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
