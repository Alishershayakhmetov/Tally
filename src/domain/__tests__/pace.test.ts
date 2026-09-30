import { computePace, paceWindow, type PaceTask } from '../pace';

// 2026-09-28 is a Monday.
const MONDAY = 1;

const total: PaceTask = {
  target: 1000,
  recurrence: 'none',
  weekdayMask: null,
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  archivedAt: null,
  measure: 'count',
};

describe('paceWindow', () => {
  it('spans start → end for a total goal with an end date', () => {
    expect(paceWindow(total, '2026-10-15', MONDAY)).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('is null without an end date, for daily quotas and after the end', () => {
    expect(paceWindow({ ...total, endDate: null }, '2026-10-15', MONDAY)).toBeNull();
    expect(paceWindow({ ...total, recurrence: 'daily' }, '2026-10-15', MONDAY)).toBeNull();
    expect(paceWindow(total, '2026-11-01', MONDAY)).toBeNull();
  });

  it('is the current week or month for repeating quotas, cut at the end date', () => {
    const weekly = { ...total, recurrence: 'weekly' as const, endDate: null };
    expect(paceWindow(weekly, '2026-09-30', MONDAY)).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    expect(paceWindow({ ...weekly, endDate: '2026-10-01' }, '2026-09-30', MONDAY)).toEqual({
      start: '2026-09-28',
      end: '2026-10-01',
    });
    expect(paceWindow({ ...weekly, recurrence: 'monthly' }, '2026-09-30', MONDAY)).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });
});

describe('computePace', () => {
  it('spreads the remainder over the days left, including today', () => {
    // 1000 over 31 days
    expect(computePace(total, '2026-10-01', MONDAY, 0)).toEqual({ perDay: 33, daysLeft: 31, ahead: 0 });
  });

  it('compares with an even spread up to the start of today', () => {
    // 10 days done: 1000 × 10 / 31 ≈ 322.6 expected
    expect(computePace(total, '2026-10-11', MONDAY, 400)).toEqual({ perDay: 29, daysLeft: 21, ahead: 77 });
    expect(computePace(total, '2026-10-11', MONDAY, 300)?.ahead).toBe(-22);
  });

  it('calls less than one unit either way "on pace"', () => {
    expect(computePace(total, '2026-10-11', MONDAY, 323)?.ahead).toBe(0);
    expect(computePace(total, '2026-10-11', MONDAY, 322)?.ahead).toBe(0);
    expect(Object.is(computePace(total, '2026-10-11', MONDAY, 322)?.ahead, -0)).toBe(false);
  });

  it('asks for the whole remainder on the last day', () => {
    expect(computePace(total, '2026-10-31', MONDAY, 950)).toMatchObject({ perDay: 50, daysLeft: 1 });
  });

  it('has nothing to say once the goal is reached, or for goals without a window', () => {
    expect(computePace(total, '2026-10-11', MONDAY, 1000)).toBeNull();
    expect(computePace(total, '2026-10-11', MONDAY, 1200)).toBeNull();
    expect(computePace({ ...total, endDate: null }, '2026-10-11', MONDAY, 0)).toBeNull();
    expect(computePace({ ...total, recurrence: 'daily' }, '2026-10-11', MONDAY, 0)).toBeNull();
  });

  it('works inside the current week, and inside a week cut short by the end date', () => {
    const weekly = { ...total, target: 20, recurrence: 'weekly' as const, endDate: null };
    // Wednesday: 2 of 7 days done → 5.7 expected, 5 logged
    expect(computePace(weekly, '2026-09-30', MONDAY, 5)).toEqual({ perDay: 3, daysLeft: 5, ahead: 0 });
    // The task ends on Thursday: 2 of 4 days done → 10 expected
    expect(computePace({ ...weekly, endDate: '2026-10-01' }, '2026-09-30', MONDAY, 5)).toEqual({
      perDay: 8,
      daysLeft: 2,
      ahead: -5,
    });
  });

  it('rounds time goals to whole minutes', () => {
    const time: PaceTask = { ...total, measure: 'duration', target: 600 * 60, endDate: '2026-10-30' };
    expect(computePace(time, '2026-10-01', MONDAY, 10)).toEqual({ perDay: 20 * 60, daysLeft: 30, ahead: 0 });
    // 10 of 30 days done → 12 000 s expected
    expect(computePace(time, '2026-10-11', MONDAY, 12_100)?.ahead).toBe(60);
    expect(computePace(time, '2026-10-11', MONDAY, 12_030)?.ahead).toBe(0);
    expect(computePace(time, '2026-10-11', MONDAY, 11_000)?.ahead).toBe(-960);
  });
});
