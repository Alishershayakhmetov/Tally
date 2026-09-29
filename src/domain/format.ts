import { addDays } from './days';

const MINUS = '−';

export function formatCount(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n);
}

export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : formatCount(n);
}

/**
 * "640 / 1000 · push-ups". The unit is user-typed text that can't be pluralised
 * (e.g. Russian "отжимания"), so it sits after a separator (SPEC §7).
 */
export function formatProgressLine(total: number, target: number, unitLabel: string | null): string {
  return `${formatCount(total)} / ${target}${unitLabel ? ` · ${unitLabel}` : ''}`;
}

export function formatClock(occurredAtMs: number, utcOffsetMin: number): string {
  const wall = new Date(occurredAtMs + utcOffsetMin * 60_000);
  const hh = String(wall.getUTCHours()).padStart(2, '0');
  const mm = String(wall.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export type DayDescription =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  /** month is 0-based; year is null when it matches today's year. */
  | { kind: 'date'; day: number; month: number; year: number | null };

export function describeDay(localDate: string, today: string): DayDescription {
  if (localDate === today) return { kind: 'today' };
  if (localDate === addDays(today, -1)) return { kind: 'yesterday' };
  const [year, month, day] = localDate.split('-').map(Number);
  return { kind: 'date', day, month: month - 1, year: year === Number(today.slice(0, 4)) ? null : year };
}
