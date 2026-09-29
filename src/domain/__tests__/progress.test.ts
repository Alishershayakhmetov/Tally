import { computeProgress, crossedTarget } from '../progress';

describe('computeProgress', () => {
  it('reports partial progress', () => {
    expect(computeProgress(640, 1000)).toEqual({
      total: 640,
      target: 1000,
      percent: 64,
      fraction: 0.64,
      remaining: 360,
      done: false,
    });
  });

  it('floors the percent so 99.9% never shows as 100%', () => {
    expect(computeProgress(999, 1000).percent).toBe(99);
  });

  it('marks exactly the target as done', () => {
    const p = computeProgress(1000, 1000);
    expect(p).toMatchObject({ percent: 100, fraction: 1, remaining: 0, done: true });
  });

  it('allows overshoot above 100% while keeping the bar full', () => {
    expect(computeProgress(1040, 1000)).toMatchObject({
      percent: 104,
      fraction: 1,
      remaining: 0,
      done: true,
    });
  });

  it('shows negative totals truthfully with an empty bar and 0%', () => {
    expect(computeProgress(-5, 100)).toMatchObject({
      total: -5,
      percent: 0,
      fraction: 0,
      remaining: 105,
      done: false,
    });
  });

  it.each([0, -1, 2.5, NaN])('rejects target %p', (target) => {
    expect(() => computeProgress(1, target)).toThrow(RangeError);
  });
});

describe('crossedTarget', () => {
  it('fires only on the change that reaches the target', () => {
    expect(crossedTarget(990, 1000, 1000)).toBe(true);
    expect(crossedTarget(995, 1005, 1000)).toBe(true);
    expect(crossedTarget(1000, 1001, 1000)).toBe(false);
    expect(crossedTarget(900, 950, 1000)).toBe(false);
    expect(crossedTarget(1001, 999, 1000)).toBe(false);
  });
});
