export type Progress = {
  total: number;
  target: number;
  /** Whole percent, floored at 0, can exceed 100. */
  percent: number;
  /** Bar fill, clamped to 0..1. */
  fraction: number;
  /** 0 once the target is reached. */
  remaining: number;
  done: boolean;
};

export function computeProgress(total: number, target: number): Progress {
  if (!Number.isInteger(target) || target <= 0) {
    throw new RangeError(`target must be a positive integer, got ${target}`);
  }
  const done = total >= target;
  return {
    total,
    target,
    percent: Math.max(0, Math.floor((total * 100) / target)),
    fraction: Math.min(1, Math.max(0, total / target)),
    remaining: done ? 0 : target - total,
    done,
  };
}

export function crossedTarget(before: number, after: number, target: number): boolean {
  return before < target && after >= target;
}
