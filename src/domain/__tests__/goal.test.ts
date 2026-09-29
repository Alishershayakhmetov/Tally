import { currentWindow, daysLeft, goalView, lifecycleOf, summarizePeriods, type GoalTask } from '../goal';
import { weekdayBit } from '../periods';

const base: GoalTask = {
  target: 100,
  recurrence: 'none',
  weekdayMask: null,
  startDate: '2026-09-01',
  endDate: null,
  archivedAt: null,
};

describe('lifecycleOf', () => {
  it('is active without an end date', () => {
    expect(lifecycleOf(base, '2030-01-01')).toBe('active');
  });

  it('stays active on the last day and finishes the day after', () => {
    const task = { ...base, endDate: '2026-10-31' };
    expect(lifecycleOf(task, '2026-10-31')).toBe('active');
    expect(lifecycleOf(task, '2026-11-01')).toBe('finished');
  });

  it('archived wins over finished', () => {
    expect(lifecycleOf({ ...base, endDate: '2026-01-01', archivedAt: 1 }, '2026-09-29')).toBe('archived');
  });
});

describe('daysLeft', () => {
  it('counts today, so the last day is 1', () => {
    expect(daysLeft('2026-10-31', '2026-10-30')).toBe(2);
    expect(daysLeft('2026-10-31', '2026-10-31')).toBe(1);
    expect(daysLeft('2026-10-31', '2026-11-01')).toBeNull();
    expect(daysLeft(null, '2026-10-31')).toBeNull();
  });
});

describe('currentWindow and goalView', () => {
  it('total goals look at all history', () => {
    expect(currentWindow(base, '2026-09-29', 1)).toBeNull();
  });

  it('weekly goals look at the current week', () => {
    expect(currentWindow({ ...base, recurrence: 'weekly' }, '2026-09-29', 0)).toEqual({
      start: '2026-09-27',
      end: '2026-10-03',
    });
  });

  it('marks rest days for a daily weekday mask', () => {
    const monOnly = { ...base, recurrence: 'daily' as const, weekdayMask: weekdayBit(1) };
    expect(goalView(monOnly, '2026-09-28', 0).restDay).toBe(false);
    expect(goalView(monOnly, '2026-09-29', 0).restDay).toBe(true);
  });

  it('carries progress and days left', () => {
    const view = goalView({ ...base, endDate: '2026-10-01' }, '2026-09-29', 60);
    expect(view.progress).toMatchObject({ total: 60, percent: 60, remaining: 40 });
    expect(view.daysLeft).toBe(3);
  });
});

describe('summarizePeriods', () => {
  const daily = { ...base, recurrence: 'daily' as const, startDate: '2026-09-28', endDate: '2026-10-02' };

  it('counts days that reached the target, net of corrections', () => {
    const sums = new Map([
      ['2026-09-28', 100],
      ['2026-09-29', 120],
      ['2026-09-30', 99],
      ['2026-10-02', 100],
    ]);
    expect(summarizePeriods(daily, '2026-10-05', 1, sums, '2026-09-28')).toEqual({ met: 3, total: 5 });
  });

  it('stops at today for a running challenge', () => {
    expect(summarizePeriods(daily, '2026-09-29', 1, new Map([['2026-09-28', 100]]), '2026-09-28')).toEqual({
      met: 1,
      total: 2,
    });
  });

  it('only counts quota days for a weekday mask', () => {
    const monWedFri = { ...daily, weekdayMask: weekdayBit(1) | weekdayBit(3) | weekdayBit(5) };
    const sums = new Map([
      ['2026-09-28', 100],
      ['2026-09-29', 500], // Tuesday: a rest day, does not count
    ]);
    expect(summarizePeriods(monWedFri, '2026-10-05', 1, sums, '2026-09-28')).toEqual({ met: 1, total: 3 });
  });

  it('sums a whole week, respecting the week start', () => {
    const weekly = {
      ...base,
      recurrence: 'weekly' as const,
      target: 300,
      startDate: '2026-09-27',
      endDate: '2026-10-03',
    };
    const sums = new Map([
      ['2026-09-27', 200], // Sunday
      ['2026-09-29', 100],
    ]);
    // Sunday-first: one week (Sep 27 – Oct 3) with 300
    expect(summarizePeriods(weekly, '2026-10-10', 0, sums, '2026-09-27')).toEqual({ met: 1, total: 1 });
    // Monday-first: Sep 27 closes the week of Sep 21; Sep 28 – Oct 4 has 100
    expect(summarizePeriods(weekly, '2026-10-10', 1, sums, '2026-09-27')).toEqual({ met: 0, total: 2 });
  });

  it('extends back to entries that re-grouped before the start date', () => {
    expect(summarizePeriods(daily, '2026-09-28', 1, new Map([['2026-09-27', 100]]), '2026-09-27')).toEqual({
      met: 1,
      total: 2,
    });
  });
});
