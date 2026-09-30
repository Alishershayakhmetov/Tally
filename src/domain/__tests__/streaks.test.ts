import type { GoalTask } from '../goal';
import { weekdayBit } from '../periods';
import { computeStreak } from '../streaks';

// 2026-09-28 is a Monday; "today" is Wednesday 2026-09-30 unless a test says otherwise.
const MONDAY = 1;
const TODAY = '2026-09-30';

const daily: GoalTask = {
  target: 10,
  recurrence: 'daily',
  weekdayMask: null,
  startDate: '2026-09-01',
  endDate: null,
  archivedAt: null,
};

function sums(entries: Record<string, number>): Map<string, number> {
  return new Map(Object.entries(entries));
}

function streak(task: GoalTask, days: Record<string, number>, today = TODAY) {
  const map = sums(days);
  const first = [...map.keys()].sort()[0] ?? null;
  return computeStreak(task, today, MONDAY, map, first);
}

describe('daily quotas', () => {
  const week = { '2026-09-24': 10, '2026-09-25': 12, '2026-09-27': 10, '2026-09-28': 10, '2026-09-29': 15 };

  it('counts met days back from yesterday while today is still in progress', () => {
    expect(streak(daily, { ...week, '2026-09-30': 3 })).toEqual({ current: 3, best: 3, unit: 'day' });
  });

  it('includes today once it is met', () => {
    expect(streak(daily, { ...week, '2026-09-30': 10 })).toEqual({ current: 4, best: 4, unit: 'day' });
  });

  it('breaks on a missed day', () => {
    expect(streak(daily, { '2026-09-28': 10, '2026-09-30': 10 })).toMatchObject({ current: 1, best: 1 });
    expect(streak(daily, { '2026-09-28': 10 })).toMatchObject({ current: 0, best: 1 });
  });

  it('skips rest days in a weekday mask', () => {
    const monWedFri = { ...daily, weekdayMask: weekdayBit(1) | weekdayBit(3) | weekdayBit(5) };
    const met = { '2026-09-21': 10, '2026-09-23': 10, '2026-09-25': 10, '2026-09-28': 10 };
    // Today (Wednesday) is a quota day that isn't met yet: it doesn't break the streak.
    expect(streak(monWedFri, met)).toMatchObject({ current: 4, best: 4 });
    // By Thursday (a rest day), the missed Wednesday has broken it.
    expect(streak(monWedFri, met, '2026-10-01')).toMatchObject({ current: 0, best: 4 });
    expect(streak(monWedFri, { ...met, '2026-09-30': 11 }, '2026-10-01')).toMatchObject({ current: 5 });
  });

  it('stops at the end date of a finished task', () => {
    const ended = { ...daily, endDate: '2026-09-25' };
    expect(streak(ended, week)).toMatchObject({ current: 2, best: 2 });
  });

  it('is zero with no entries', () => {
    expect(streak(daily, {})).toEqual({ current: 0, best: 0, unit: 'day' });
  });
});

describe('weekly and monthly quotas', () => {
  const weekly = { ...daily, recurrence: 'weekly' as const, target: 30 };

  it('counts met weeks and ignores the week in progress until it is met', () => {
    const days = { '2026-09-10': 30, '2026-09-16': 20, '2026-09-18': 15, '2026-09-22': 40, '2026-09-29': 5 };
    // Weeks of Sep 7, 14, 21 met; the week of Sep 28 is in progress with 5.
    expect(streak(weekly, days)).toEqual({ current: 3, best: 3, unit: 'week' });
    expect(streak(weekly, { ...days, '2026-09-30': 25 })).toMatchObject({ current: 4, best: 4 });
  });

  it('counts months, and the best run survives a gap', () => {
    const monthly = { ...daily, recurrence: 'monthly' as const, target: 100, startDate: '2026-03-01' };
    const days = {
      '2026-03-05': 100,
      '2026-04-05': 100,
      '2026-05-05': 100,
      '2026-07-05': 100,
      '2026-08-05': 100,
    };
    expect(streak(monthly, days)).toEqual({ current: 2, best: 3, unit: 'month' });
  });
});

describe('total goals', () => {
  const total = { ...daily, recurrence: 'none' as const, target: 1000 };

  it('counts consecutive days with a positive net amount', () => {
    const days = { '2026-09-26': 5, '2026-09-27': 1, '2026-09-28': 40, '2026-09-29': 2 };
    expect(streak(total, days)).toEqual({ current: 4, best: 4, unit: 'day' });
    expect(streak(total, { ...days, '2026-09-30': 3 })).toMatchObject({ current: 5 });
  });

  it('does not count a day whose corrections leave it at zero or below', () => {
    const days = { '2026-09-26': 5, '2026-09-27': 1, '2026-09-28': 40, '2026-09-29': -5 };
    expect(streak(total, days)).toMatchObject({ current: 0, best: 3 });
  });

  it('counts entries from before the start date', () => {
    const days = { '2026-08-30': 5, '2026-08-31': 5, '2026-09-01': 5 };
    expect(streak(total, days, '2026-09-01')).toMatchObject({ current: 3, best: 3 });
  });
});
