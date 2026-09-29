import {
  addMonths,
  ALL_WEEKDAYS_MASK,
  daysBetween,
  endOfMonth,
  isQuotaDay,
  monthGrid,
  orderedWeekdays,
  periodContaining,
  periodsBetween,
  resolveWeekStart,
  startOfWeek,
  weekdayBit,
  weekdayOf,
} from '../periods';

const MON_WED_FRI = weekdayBit(1) | weekdayBit(3) | weekdayBit(5);

describe('weekdays', () => {
  it('reads the weekday of a date', () => {
    expect(weekdayOf('2026-09-27')).toBe(0); // Sunday
    expect(weekdayOf('2026-09-28')).toBe(1); // Monday
    expect(weekdayOf('2028-02-29')).toBe(2); // leap day, Tuesday
  });

  it('uses the SPEC mask layout: Mon = 1 … Sun = 64', () => {
    expect(weekdayBit(1)).toBe(1);
    expect(weekdayBit(6)).toBe(32);
    expect(weekdayBit(0)).toBe(64);
  });

  it('orders weekdays from the chosen start', () => {
    expect(orderedWeekdays(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(orderedWeekdays(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('resolves "auto" from the locale, defaulting to Monday', () => {
    expect(resolveWeekStart('auto', 0)).toBe(0);
    expect(resolveWeekStart('auto', null)).toBe(1);
    expect(resolveWeekStart(0, 1)).toBe(0);
  });
});

describe('isQuotaDay', () => {
  it('treats a missing mask as every day', () => {
    expect(isQuotaDay(null, '2026-09-27')).toBe(true);
    expect(isQuotaDay(ALL_WEEKDAYS_MASK, '2026-09-27')).toBe(true);
  });

  it('honours Mon/Wed/Fri', () => {
    expect(isQuotaDay(MON_WED_FRI, '2026-09-28')).toBe(true); // Mon
    expect(isQuotaDay(MON_WED_FRI, '2026-09-29')).toBe(false); // Tue
    expect(isQuotaDay(MON_WED_FRI, '2026-10-02')).toBe(true); // Fri
    expect(isQuotaDay(MON_WED_FRI, '2026-10-04')).toBe(false); // Sun
  });
});

describe('periodContaining', () => {
  it('daily is the day itself', () => {
    expect(periodContaining('daily', '2026-09-29', 1)).toEqual({ start: '2026-09-29', end: '2026-09-29' });
  });

  it('weekly follows the week start', () => {
    // Tuesday 2026-09-29
    expect(periodContaining('weekly', '2026-09-29', 1)).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    expect(periodContaining('weekly', '2026-09-29', 0)).toEqual({ start: '2026-09-27', end: '2026-10-03' });
  });

  it('a Sunday belongs to different weeks depending on the week start', () => {
    expect(startOfWeek('2026-10-04', 1)).toBe('2026-09-28');
    expect(startOfWeek('2026-10-04', 0)).toBe('2026-10-04');
  });

  it('weeks cross month and year ends', () => {
    expect(periodContaining('weekly', '2027-01-01', 1)).toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });

  it.each([
    ['2026-09-15', '2026-09-30'],
    ['2026-02-10', '2026-02-28'],
    ['2028-02-10', '2028-02-29'],
    ['2026-12-31', '2026-12-31'],
  ])('month of %s ends on %s', (date, end) => {
    expect(periodContaining('monthly', date, 1)).toEqual({ start: `${date.slice(0, 7)}-01`, end });
    expect(endOfMonth(date)).toBe(end);
  });
});

describe('periodsBetween', () => {
  it('lists every day for a daily goal', () => {
    expect(periodsBetween('daily', '2026-09-28', '2026-10-01', 1, null)).toHaveLength(4);
  });

  it('skips rest days for a weekday mask', () => {
    const periods = periodsBetween('daily', '2026-09-28', '2026-10-04', 1, MON_WED_FRI);
    expect(periods.map((p) => p.start)).toEqual(['2026-09-28', '2026-09-30', '2026-10-02']);
  });

  it('includes partial weeks and months at the edges', () => {
    expect(periodsBetween('weekly', '2026-09-30', '2026-10-06', 1, null)).toEqual([
      { start: '2026-09-28', end: '2026-10-04' },
      { start: '2026-10-05', end: '2026-10-11' },
    ]);
    expect(periodsBetween('monthly', '2026-01-31', '2026-03-01', 1, null)).toHaveLength(3);
  });
});

describe('daysBetween', () => {
  it('counts calendar days, including across a leap day', () => {
    expect(daysBetween('2026-09-29', '2026-09-29')).toBe(0);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-10-01', '2026-09-29')).toBe(-2);
  });
});

describe('monthGrid', () => {
  it('lays out September 2026 in Monday-first weeks', () => {
    const grid = monthGrid('2026-09', 1);
    expect(grid).toHaveLength(5);
    expect(grid[0]).toEqual([
      null,
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(grid[4]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null]);
  });

  it('shifts for Sunday-first weeks', () => {
    expect(monthGrid('2026-09', 0)[0][0]).toBeNull();
    expect(monthGrid('2026-09', 0)[0][2]).toBe('2026-09-01');
    expect(monthGrid('2026-02', 0)).toHaveLength(4); // Feb 2026 starts on a Sunday
  });

  it('steps months across years', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});
