import { addDays } from './days';

// All dates here are logical dates ('YYYY-MM-DD'), so there is no clock or
// time-zone arithmetic: a day is a day, even across DST changes.

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';
export type RepeatingRecurrence = Exclude<Recurrence, 'none'>;
/** 0 = Sunday … 6 = Saturday (JavaScript's getDay order). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WeekStartPref = 'auto' | Weekday;
export type Period = { start: string; end: string };

export const ALL_WEEKDAYS_MASK = 127;
const MS_PER_DAY = 86_400_000;

/** Bit for a weekday in tasks.weekday_mask: Mon = 1, Tue = 2 … Sun = 64 (SPEC §6.2). */
export function weekdayBit(weekday: Weekday): number {
  return 1 << ((weekday + 6) % 7);
}

export function weekdayOf(date: string): Weekday {
  return new Date(`${date}T00:00:00Z`).getUTCDay() as Weekday;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

export function startOfWeek(date: string, weekStart: Weekday): string {
  return addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
}

export function endOfMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

export function periodContaining(recurrence: RepeatingRecurrence, date: string, weekStart: Weekday): Period {
  switch (recurrence) {
    case 'daily':
      return { start: date, end: date };
    case 'weekly': {
      const start = startOfWeek(date, weekStart);
      return { start, end: addDays(start, 6) };
    }
    case 'monthly':
      return { start: `${date.slice(0, 7)}-01`, end: endOfMonth(date) };
  }
}

export function isQuotaDay(weekdayMask: number | null, date: string): boolean {
  return ((weekdayMask ?? ALL_WEEKDAYS_MASK) & weekdayBit(weekdayOf(date))) !== 0;
}

/** Weekdays in display order starting from weekStart. */
export function orderedWeekdays(weekStart: Weekday): Weekday[] {
  return Array.from({ length: 7 }, (_, i) => ((weekStart + i) % 7) as Weekday);
}

export function resolveWeekStart(pref: WeekStartPref, localeFirstWeekday: Weekday | null): Weekday {
  return pref === 'auto' ? (localeFirstWeekday ?? 1) : pref;
}

/** Every period that overlaps [from, to], in order. Daily periods skip non-quota days. */
export function periodsBetween(
  recurrence: RepeatingRecurrence,
  from: string,
  to: string,
  weekStart: Weekday,
  weekdayMask: number | null,
): Period[] {
  const periods: Period[] = [];
  let cursor = from;
  while (cursor <= to) {
    const period = periodContaining(recurrence, cursor, weekStart);
    if (recurrence !== 'daily' || isQuotaDay(weekdayMask, cursor)) periods.push(period);
    cursor = addDays(period.end, 1);
  }
  return periods;
}

/** Month grid for a date picker: whole weeks, null for days outside the month. */
export function monthGrid(month: string, weekStart: Weekday): (string | null)[][] {
  const first = `${month.slice(0, 7)}-01`;
  const last = endOfMonth(first);
  const weeks: (string | null)[][] = [];
  let cursor = startOfWeek(first, weekStart);
  while (cursor <= last) {
    const week: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor >= first && cursor <= last ? cursor : null);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
