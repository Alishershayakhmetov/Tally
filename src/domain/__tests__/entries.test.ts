import { COALESCE_WINDOW_MS, nextBurst, planTap, type Burst } from '../entries';

const DAY = '2026-09-29';
const T0 = 1_790_000_000_000;

function burst(overrides: Partial<Burst> = {}): Burst {
  return { entryId: 'e1', lastTapAt: T0, localDate: DAY, direction: 1, ...overrides };
}

describe('planTap', () => {
  it('starts a new entry when there is no burst', () => {
    expect(planTap(null, 1, T0, DAY)).toEqual({ kind: 'new' });
  });

  it('extends the burst for a same-direction tap inside the window', () => {
    expect(planTap(burst(), 5, T0 + 500, DAY)).toEqual({ kind: 'extend', entryId: 'e1' });
    expect(planTap(burst(), 1, T0 + COALESCE_WINDOW_MS, DAY)).toEqual({ kind: 'extend', entryId: 'e1' });
  });

  it('starts a new entry once the window has passed', () => {
    expect(planTap(burst(), 1, T0 + COALESCE_WINDOW_MS + 1, DAY)).toEqual({ kind: 'new' });
  });

  it('keeps a correction in the other direction as its own entry', () => {
    expect(planTap(burst(), -1, T0 + 100, DAY)).toEqual({ kind: 'new' });
    expect(planTap(burst({ direction: -1 }), -1, T0 + 100, DAY)).toEqual({ kind: 'extend', entryId: 'e1' });
  });

  it('never merges across the day boundary', () => {
    expect(planTap(burst(), 1, T0 + 100, '2026-09-30')).toEqual({ kind: 'new' });
  });

  it('starts a new entry if the clock moved backwards', () => {
    expect(planTap(burst(), 1, T0 - 1, DAY)).toEqual({ kind: 'new' });
  });

  it.each([0, 1.5, NaN])('rejects delta %p', (delta) => {
    expect(() => planTap(null, delta, T0, DAY)).toThrow(RangeError);
  });

  it('simulates 50 quick +1 taps as a single entry', () => {
    let current: Burst | null = null;
    const entryAmounts = new Map<string, number>();
    let nextId = 0;
    for (let i = 0; i < 50; i++) {
      const now = T0 + i * 150;
      const plan = planTap(current, 1, now, DAY);
      const id = plan.kind === 'extend' ? plan.entryId : `e${nextId++}`;
      entryAmounts.set(id, (entryAmounts.get(id) ?? 0) + 1);
      current = nextBurst(id, 1, now, DAY);
    }
    expect([...entryAmounts.values()]).toEqual([50]);
  });
});

describe('nextBurst', () => {
  it('records the direction of the tap', () => {
    expect(nextBurst('e1', 10, T0, DAY).direction).toBe(1);
    expect(nextBurst('e1', -1, T0, DAY).direction).toBe(-1);
  });
});
