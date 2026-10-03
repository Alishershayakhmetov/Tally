import { restartEndDate } from '../goal';
import { parseCountdown } from '../input';
import {
  countdownDisplay,
  countdownEndsAt,
  defaultCountdownSeconds,
  loggedSeconds,
  MAX_COUNTDOWN_SECONDS,
  pauseTimer,
  resumeTimer,
  stepCountdown,
  type TimerState,
} from '../timer';
import { MIN_TODAY_GOALS, todaySummary, type DayGoal } from '../today';

const T0 = 1_790_000_000_000;
const FIVE_MIN = 5 * 60_000;
const countdown: TimerState = {
  taskId: 't',
  firstStartedAt: T0,
  utcOffsetMin: 300,
  runningSince: T0,
  accumulatedMs: 0,
  countdownMs: FIVE_MIN,
};

describe('countdown', () => {
  it('shows the time left, rounded up so 0:00 appears only when it ends', () => {
    expect(countdownDisplay(countdown, T0)).toEqual({ overtime: false, seconds: 300 });
    expect(countdownDisplay(countdown, T0 + 500)).toEqual({ overtime: false, seconds: 300 });
    expect(countdownDisplay(countdown, T0 + 299_001)).toEqual({ overtime: false, seconds: 1 });
    expect(countdownDisplay(countdown, T0 + FIVE_MIN)).toEqual({ overtime: true, seconds: 0 });
  });

  it('keeps counting overtime past 0:00, and stopping logs the whole time', () => {
    expect(countdownDisplay(countdown, T0 + FIVE_MIN + 12_400)).toEqual({ overtime: true, seconds: 12 });
    expect(loggedSeconds(countdown, T0 + FIVE_MIN + 12_400)).toBe(312);
  });

  it('is null for a plain stopwatch', () => {
    const stopwatch = { ...countdown, countdownMs: null };
    expect(countdownDisplay(stopwatch, T0 + 1000)).toBeNull();
    expect(countdownEndsAt(stopwatch, T0)).toBeNull();
    const { countdownMs: _, ...older } = countdown;
    expect(countdownDisplay(older, T0 + 1000)).toBeNull();
  });

  it('ends when the running time reaches the length, moving with pauses', () => {
    expect(countdownEndsAt(countdown, T0)).toBe(T0 + FIVE_MIN);
    const paused = pauseTimer(countdown, T0 + 60_000);
    expect(countdownEndsAt(paused, T0 + 90_000)).toBeNull();
    expect(countdownDisplay(paused, T0 + 10 * 60_000)).toEqual({ overtime: false, seconds: 240 });
    const resumed = resumeTimer(paused, T0 + 10 * 60_000);
    expect(countdownEndsAt(resumed, T0 + 10 * 60_000)).toBe(T0 + 14 * 60_000);
  });

  it('has no end time left once it is over', () => {
    expect(countdownEndsAt(countdown, T0 + FIVE_MIN)).toBeNull();
    expect(countdownEndsAt(countdown, T0 + FIVE_MIN + 1)).toBeNull();
  });
});

describe('defaultCountdownSeconds', () => {
  it("uses what's left today for a daily goal, or the whole target once it's met", () => {
    expect(
      defaultCountdownSeconds({ recurrence: 'daily', target: 300, remaining: 180, pacePerDay: null }),
    ).toBe(180);
    expect(
      defaultCountdownSeconds({ recurrence: 'daily', target: 300, remaining: 0, pacePerDay: null }),
    ).toBe(300);
  });

  it("uses the pace line's per-day need for other goals", () => {
    expect(
      defaultCountdownSeconds({ recurrence: 'weekly', target: 9000, remaining: 3600, pacePerDay: 1200 }),
    ).toBe(1200);
    expect(
      defaultCountdownSeconds({ recurrence: 'none', target: 60_000, remaining: 59_000, pacePerDay: 600 }),
    ).toBe(600);
  });

  it('falls back to 10 minutes without a pace line', () => {
    expect(
      defaultCountdownSeconds({ recurrence: 'none', target: 60_000, remaining: 60_000, pacePerDay: null }),
    ).toBe(600);
    expect(
      defaultCountdownSeconds({ recurrence: 'monthly', target: 6000, remaining: 0, pacePerDay: null }),
    ).toBe(600);
  });

  it('stays within 1 s … 24 h', () => {
    expect(
      defaultCountdownSeconds({
        recurrence: 'daily',
        target: 30 * 3600,
        remaining: 30 * 3600,
        pacePerDay: null,
      }),
    ).toBe(MAX_COUNTDOWN_SECONDS);
  });
});

describe('stepCountdown', () => {
  it('steps within 1 s … 24 h and refuses to leave that range', () => {
    expect(stepCountdown(300, 60)).toBe(360);
    expect(stepCountdown(97, -60)).toBe(37);
    expect(stepCountdown(37, -60)).toBeNull();
    expect(stepCountdown(60, -60)).toBeNull();
    expect(stepCountdown(MAX_COUNTDOWN_SECONDS - 30, 60)).toBeNull();
  });
});

describe('parseCountdown', () => {
  it('reads minutes, m:ss and h:mm:ss as seconds', () => {
    expect(parseCountdown('5')).toEqual({ ok: true, value: 300 });
    expect(parseCountdown('1:30')).toEqual({ ok: true, value: 90 });
    expect(parseCountdown('1:00:00')).toEqual({ ok: true, value: 3600 });
  });

  it('rejects zero, negative, malformed and over-long times', () => {
    for (const text of ['0', '0:00', '-5', 'abc', '']) {
      expect(parseCountdown(text)).toEqual({ ok: false, error: { code: 'countdownInvalid' } });
    }
    expect(parseCountdown('24:00:01')).toEqual({ ok: false, error: { code: 'countdownTooLong' } });
    expect(parseCountdown('24:00:00')).toEqual({ ok: true, value: MAX_COUNTDOWN_SECONDS });
  });
});

describe('todaySummary', () => {
  function view(over: {
    lifecycle?: DayGoal['lifecycle'];
    recurrence?: DayGoal['task']['recurrence'];
    restDay?: boolean;
    done?: boolean;
  }): DayGoal {
    return {
      lifecycle: over.lifecycle ?? 'active',
      task: { recurrence: over.recurrence ?? 'daily' },
      goal: { restDay: over.restDay ?? false, progress: { done: over.done ?? false } },
    };
  }

  it('counts active daily goals with a quota today, in order', () => {
    const a = view({ done: true });
    const b = view({});
    const c = view({ done: true });
    expect(todaySummary([a, b, c])).toEqual({ goals: [a, b, c], done: 2 });
  });

  it('leaves out other goal types, rest days and ended tasks', () => {
    const daily = [view({}), view({ done: true })];
    const others = [
      view({ recurrence: 'weekly', done: true }),
      view({ recurrence: 'monthly' }),
      view({ recurrence: 'none' }),
      view({ restDay: true }),
      view({ restDay: true, done: true }),
      view({ lifecycle: 'finished', done: true }),
      view({ lifecycle: 'archived' }),
    ];
    expect(todaySummary([...others, ...daily])).toEqual({ goals: daily, done: 1 });
  });

  it(`needs at least ${MIN_TODAY_GOALS} goals, or it would repeat the one card`, () => {
    expect(todaySummary([view({ done: true }), view({ recurrence: 'weekly' })])).toBeNull();
    expect(todaySummary([])).toBeNull();
  });
});

describe('restartEndDate', () => {
  it('keeps the challenge length, counted in days including both ends', () => {
    // 30 days: Sep 1 … Sep 30. Again from Oct 3: Oct 3 … Nov 1.
    expect(restartEndDate('2026-09-01', '2026-09-30', '2026-10-03')).toBe('2026-11-01');
    // A one-day challenge stays one day.
    expect(restartEndDate('2026-09-01', '2026-09-01', '2026-10-03')).toBe('2026-10-03');
  });

  it('crosses month and leap-year ends', () => {
    expect(restartEndDate('2027-01-01', '2027-01-31', '2028-02-10')).toBe('2028-03-11');
  });

  it('keeps no end date as none', () => {
    expect(restartEndDate('2026-09-01', null, '2026-10-03')).toBeNull();
  });
});
