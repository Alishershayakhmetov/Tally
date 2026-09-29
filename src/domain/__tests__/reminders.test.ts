import { weekdayBit } from '../periods';
import { parseReminderTime, planReminders, type ReminderTask, type WallClock } from '../reminders';

/** A phone fixed at UTC+5 (Almaty). */
const almaty: WallClock = {
  toEpoch: (date, minutes) => Date.parse(`${date}T00:00:00+05:00`) + minutes * 60_000,
  offsetAt: () => 300,
};
const at = (wall: string) => Date.parse(`${wall}:00+05:00`);

const base: ReminderTask = {
  id: 't1',
  target: 100,
  recurrence: 'daily',
  weekdayMask: null,
  startDate: '2026-09-28',
  endDate: null,
  archivedAt: null,
  reminderTime: '19:00',
  dayStartMin: 0,
  total: 0,
};

const plan = (task: Partial<ReminderTask>, now: string, sums: [string, number][] = [], horizon = 3) =>
  planReminders({ ...base, ...task }, at(now), 1, almaty, new Map(sums), horizon);

describe('parseReminderTime', () => {
  it('accepts HH:MM on a 24-hour clock', () => {
    expect(parseReminderTime('00:00')).toBe(0);
    expect(parseReminderTime('19:30')).toBe(1170);
    expect(parseReminderTime('24:00')).toBeNull();
    expect(parseReminderTime('7:30')).toBeNull();
  });
});

describe('planReminders: daily quota', () => {
  it('fires every evening from today when nothing is logged', () => {
    const planned = plan({}, '2026-09-29T10:00');
    expect(planned.map((p) => p.day)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(planned[0]).toMatchObject({ fireAt: at('2026-09-29T19:00'), remaining: 100 });
  });

  it('skips today once the quota is met, but keeps tomorrow', () => {
    const planned = plan({}, '2026-09-29T10:00', [['2026-09-29', 100]]);
    expect(planned[0].day).toBe('2026-09-30');
  });

  it('tells how much is left when partly done', () => {
    expect(plan({}, '2026-09-29T10:00', [['2026-09-29', 60]])[0].remaining).toBe(40);
  });

  it('does not schedule a time that already passed today', () => {
    expect(plan({}, '2026-09-29T20:00')[0].day).toBe('2026-09-30');
  });

  it('skips rest days of a weekday mask', () => {
    const monWedFri = weekdayBit(1) | weekdayBit(3) | weekdayBit(5);
    // Tue Sep 29 → Wed, Fri, Mon…
    const planned = plan({ weekdayMask: monWedFri }, '2026-09-29T10:00', [], 7);
    expect(planned.map((p) => p.day)).toEqual(['2026-09-30', '2026-10-02', '2026-10-05']);
  });

  it('stops after the end date and plans nothing once finished or archived', () => {
    expect(plan({ endDate: '2026-09-30' }, '2026-09-29T10:00').map((p) => p.day)).toEqual([
      '2026-09-29',
      '2026-09-30',
    ]);
    expect(plan({ endDate: '2026-09-28' }, '2026-09-29T10:00')).toEqual([]);
    expect(plan({ archivedAt: 1 }, '2026-09-29T10:00')).toEqual([]);
  });

  it('maps a reminder before the cutoff to the previous logical day', () => {
    // Cutoff 04:00; a 01:00 reminder on Wednesday belongs to Tuesday's quota.
    const planned = plan({ reminderTime: '01:00', dayStartMin: 240 }, '2026-09-29T10:00', [], 1);
    expect(planned[0]).toMatchObject({ fireAt: at('2026-09-30T01:00'), day: '2026-09-29' });
  });

  it("uses that logical day's progress for a late-night reminder", () => {
    // Wed 01:00 is Tuesday's (met) → skipped; Thu 01:00 is Wednesday's reminder.
    const planned = plan(
      { reminderTime: '01:00', dayStartMin: 240 },
      '2026-09-29T10:00',
      [['2026-09-29', 100]],
      2,
    );
    expect(planned).toEqual([
      { taskId: 't1', fireAt: at('2026-10-01T01:00'), day: '2026-09-30', remaining: 100 },
    ]);
  });
});

describe('planReminders: weekly and monthly quotas', () => {
  it('keeps reminding every day until the week is done', () => {
    const planned = plan({ recurrence: 'weekly', target: 300 }, '2026-09-29T10:00', [['2026-09-28', 100]]);
    expect(planned.map((p) => [p.day, p.remaining])).toEqual([
      ['2026-09-29', 200],
      ['2026-09-30', 200],
      ['2026-10-01', 200],
      ['2026-10-02', 200],
    ]);
  });

  it('skips the rest of a finished week and resumes with the next one', () => {
    const planned = plan({ recurrence: 'weekly', target: 300 }, '2026-10-02T10:00', [['2026-09-29', 300]], 4);
    // Week Sep 28 – Oct 4 is done; next week starts Mon Oct 5.
    expect(planned.map((p) => p.day)).toEqual(['2026-10-05', '2026-10-06']);
  });

  it('treats a new month as a fresh quota', () => {
    const planned = plan({ recurrence: 'monthly', target: 50 }, '2026-09-29T10:00', [['2026-09-10', 50]]);
    expect(planned.map((p) => [p.day, p.remaining])).toEqual([
      ['2026-10-01', 50],
      ['2026-10-02', 50],
    ]);
  });
});

describe('planReminders: total goals', () => {
  it('skips a day on which something was already logged', () => {
    const planned = plan({ recurrence: 'none', target: 1000, total: 640 }, '2026-09-29T10:00', [
      ['2026-09-29', 40],
    ]);
    expect(planned[0]).toMatchObject({ day: '2026-09-30', remaining: 360 });
  });

  it('stops once the target is reached', () => {
    expect(plan({ recurrence: 'none', target: 1000, total: 1000 }, '2026-09-29T10:00')).toEqual([]);
  });
});

describe('planReminders: daylight saving', () => {
  it('fires at 19:00 local time on both sides of a DST change', () => {
    // Berlin, 2026-03-29: clocks go from +01:00 to +02:00 at 02:00.
    const berlin: WallClock = {
      toEpoch: (date, minutes) =>
        Date.parse(`${date}T00:00:00${date < '2026-03-29' ? '+01:00' : '+02:00'}`) + minutes * 60_000,
      offsetAt: (ms) => (ms < Date.parse('2026-03-29T01:00:00Z') ? 60 : 120),
    };
    const planned = planReminders(
      { ...base, startDate: '2026-03-01' },
      Date.parse('2026-03-28T10:00:00+01:00'),
      1,
      berlin,
      new Map(),
      1,
    );
    expect(planned.map((p) => new Date(p.fireAt).toISOString())).toEqual([
      '2026-03-28T18:00:00.000Z',
      '2026-03-29T17:00:00.000Z',
    ]);
  });
});
