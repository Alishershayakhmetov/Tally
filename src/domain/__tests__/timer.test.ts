import { elapsedMs, loggedSeconds, pauseTimer, resumeTimer, type TimerState } from '../timer';

const T0 = 1_790_000_000_000;
const started: TimerState = {
  taskId: 't',
  firstStartedAt: T0,
  utcOffsetMin: 300,
  runningSince: T0,
  accumulatedMs: 0,
};

describe('stopwatch', () => {
  it('counts running time from timestamps, so a killed app resumes correctly', () => {
    expect(elapsedMs(started, T0 + 90_500)).toBe(90_500);
    expect(loggedSeconds(started, T0 + 90_500)).toBe(90);
  });

  it('stops counting while paused and continues after resuming', () => {
    const paused = pauseTimer(started, T0 + 60_000);
    expect(paused.runningSince).toBeNull();
    expect(elapsedMs(paused, T0 + 10 * 60_000)).toBe(60_000);
    const resumed = resumeTimer(paused, T0 + 10 * 60_000);
    expect(elapsedMs(resumed, T0 + 11 * 60_000)).toBe(120_000);
  });

  it('keeps the first start time for day attribution across pauses', () => {
    const resumed = resumeTimer(pauseTimer(started, T0 + 1000), T0 + 5000);
    expect(resumed.firstStartedAt).toBe(T0);
  });

  it('pause and resume are idempotent', () => {
    const paused = pauseTimer(started, T0 + 1000);
    expect(pauseTimer(paused, T0 + 9000)).toBe(paused);
    expect(resumeTimer(started, T0 + 9000)).toBe(started);
  });

  it('never goes negative if the clock moves backwards', () => {
    expect(elapsedMs(started, T0 - 5000)).toBe(0);
  });
});
