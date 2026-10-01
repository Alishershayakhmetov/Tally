import type { GoalTask } from '../goal';
import { weekdayBit } from '../periods';
import {
  barSeries,
  defaultGranularity,
  goalLine,
  goalRate,
  heatLevel,
  heatScale,
  niceAxis,
  summarize,
} from '../stats';

// 2026-09-28 is a Monday; "today" is Wednesday 2026-09-30.
const MONDAY = 1;
const TODAY = '2026-09-30';

const daily: GoalTask = {
  target: 10,
  recurrence: 'daily',
  weekdayMask: null,
  startDate: '2026-09-20',
  endDate: null,
  archivedAt: null,
};

const sums = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('summarize', () => {
  it('totals, counts active days and averages over them', () => {
    const days = [
      { date: '2026-09-20', total: 10 },
      { date: '2026-09-22', total: 25 },
      { date: '2026-09-23', total: -5 },
      { date: '2026-09-25', total: 25 },
    ];
    expect(summarize(days)).toEqual({
      total: 55,
      activeDays: 3,
      averagePerActiveDay: 18,
      bestDay: { date: '2026-09-25', total: 25 },
      firstDate: '2026-09-20',
    });
  });

  it('has no average or best day before anything positive is logged', () => {
    expect(summarize([])).toEqual({
      total: 0,
      activeDays: 0,
      averagePerActiveDay: null,
      bestDay: null,
      firstDate: null,
    });
    expect(summarize([{ date: '2026-09-20', total: -3 }])).toMatchObject({ bestDay: null, activeDays: 0 });
  });
});

describe('goalRate', () => {
  it('is null for total goals', () => {
    expect(goalRate({ ...daily, recurrence: 'none' }, TODAY, MONDAY, sums({}), null)).toBeNull();
  });

  it('leaves out today until it is met', () => {
    const met = { '2026-09-28': 10, '2026-09-29': 12 };
    // Sep 20–29 are 10 finished days, 2 met; today (3 so far) isn't counted yet.
    expect(goalRate(daily, TODAY, MONDAY, sums({ ...met, '2026-09-30': 3 }), '2026-09-28')).toEqual({
      met: 2,
      count: 10,
    });
    expect(goalRate(daily, TODAY, MONDAY, sums({ ...met, '2026-09-30': 10 }), '2026-09-28')).toEqual({
      met: 3,
      count: 11,
    });
  });

  it('skips rest days', () => {
    const monWedFri = { ...daily, weekdayMask: weekdayBit(1) | weekdayBit(3) | weekdayBit(5) };
    // Mon 21, Wed 23, Fri 25, Mon 28 are finished quota days; Wed 30 is today.
    expect(goalRate(monWedFri, TODAY, MONDAY, sums({ '2026-09-21': 10 }), '2026-09-21')).toEqual({
      met: 1,
      count: 4,
    });
  });
});

describe('barSeries', () => {
  const data = sums({ '2026-09-01': 3, '2026-09-29': 5, '2026-09-30': 7, '2026-08-15': 100 });

  it('ends with today and goes back one day per bar', () => {
    const bars = barSeries('day', TODAY, MONDAY, data, 3);
    expect(bars.map((b) => [b.period.start, b.total])).toEqual([
      ['2026-09-28', 0],
      ['2026-09-29', 5],
      ['2026-09-30', 7],
    ]);
  });

  it('sums whole weeks, starting on the chosen weekday', () => {
    const bars = barSeries('week', TODAY, MONDAY, data, 2);
    expect(bars).toEqual([
      { period: { start: '2026-09-21', end: '2026-09-27' }, total: 0 },
      { period: { start: '2026-09-28', end: '2026-10-04' }, total: 12 },
    ]);
    expect(barSeries('week', TODAY, 0, data, 1)[0].period).toEqual({
      start: '2026-09-27',
      end: '2026-10-03',
    });
  });

  it('sums calendar months, across a year boundary too', () => {
    expect(barSeries('month', TODAY, MONDAY, data, 2).map((b) => [b.period, b.total])).toEqual([
      [{ start: '2026-08-01', end: '2026-08-31' }, 100],
      [{ start: '2026-09-01', end: '2026-09-30' }, 15],
    ]);
    expect(barSeries('month', '2026-01-10', MONDAY, data, 2)[0].period).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    });
  });

  it('has 30 days, 12 weeks or 12 months by default', () => {
    expect(barSeries('day', TODAY, MONDAY, data)).toHaveLength(30);
    expect(barSeries('week', TODAY, MONDAY, data)).toHaveLength(12);
    expect(barSeries('month', TODAY, MONDAY, data)).toHaveLength(12);
  });
});

describe('goalLine and defaultGranularity', () => {
  it('draws the goal only on bars of its own period', () => {
    expect(goalLine({ recurrence: 'daily', target: 8 }, 'day')).toBe(8);
    expect(goalLine({ recurrence: 'daily', target: 8 }, 'week')).toBeNull();
    expect(goalLine({ recurrence: 'weekly', target: 20 }, 'week')).toBe(20);
    expect(goalLine({ recurrence: 'none', target: 1000 }, 'day')).toBeNull();
  });

  it('opens on the goal period', () => {
    expect(defaultGranularity('weekly')).toBe('week');
    expect(defaultGranularity('monthly')).toBe('month');
    expect(defaultGranularity('none')).toBe('day');
  });
});

describe('niceAxis', () => {
  it('picks 1-2-5 steps for counts', () => {
    expect(niceAxis([0, 40, 12], 'count')).toEqual({ min: 0, max: 40, ticks: [0, 20, 40] });
    expect(niceAxis([8], 'count')).toEqual({ min: 0, max: 10, ticks: [0, 5, 10] });
    expect(niceAxis([3], 'count')).toEqual({ min: 0, max: 3, ticks: [0, 1, 2, 3] });
    expect(niceAxis([1000], 'count').ticks).toEqual([0, 500, 1000]);
    expect(niceAxis([120], 'count').ticks).toEqual([0, 50, 100, 150]);
  });

  it('still has an axis when everything is zero', () => {
    expect(niceAxis([0, 0], 'count')).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(niceAxis([], 'duration')).toEqual({ min: 0, max: 60, ticks: [0, 60] });
  });

  it('extends below zero for net-negative periods', () => {
    expect(niceAxis([-5, 30], 'count')).toEqual({ min: -20, max: 40, ticks: [-20, 0, 20, 40] });
  });

  it('uses whole minutes and hours for time', () => {
    expect(niceAxis([25 * 60], 'duration').ticks).toEqual([0, 600, 1200, 1800]);
    expect(niceAxis([2 * 3600], 'duration').ticks).toEqual([0, 3600, 7200]);
  });
});

describe('heat map', () => {
  it('splits a scale into four shades, with the top one for reaching it', () => {
    expect([0, -2, 1, 4, 7, 9, 10, 15].map((n) => heatLevel(n, 10))).toEqual([0, 0, 1, 2, 3, 3, 4, 4]);
    expect(heatLevel(5, 0)).toBe(0);
  });

  it('scales to the daily goal, or to the best day of the month', () => {
    const data = sums({ '2026-09-03': 12, '2026-09-10': 30, '2026-08-01': 99 });
    expect(heatScale({ recurrence: 'daily', target: 8 }, '2026-09', data)).toBe(8);
    expect(heatScale({ recurrence: 'none', target: 1000 }, '2026-09', data)).toBe(30);
    expect(heatScale({ recurrence: 'weekly', target: 50 }, '2026-10', data)).toBe(0);
  });
});
