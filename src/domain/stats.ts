import { addDays } from './days';
import type { GoalTask } from './goal';
import type { Measure } from './measure';
import {
  addMonths,
  endOfMonth,
  periodContaining,
  type Period,
  type Recurrence,
  type Weekday,
} from './periods';
import { periodResults, sumOver } from './streaks';

// Statistics screen (SPEC §10, Phase 4). All inputs are per-day net sums, so
// everything here is plain date arithmetic and easy to test.

export type DaySum = { date: string; total: number };

export type Summary = {
  total: number;
  /** Days with a positive net amount. */
  activeDays: number;
  /** Net total ÷ active days, rounded; null before the first active day. */
  averagePerActiveDay: number | null;
  /** The highest day; the most recent one on a tie. Null if no day is positive. */
  bestDay: DaySum | null;
  firstDate: string | null;
};

/** `days` is oldest first, as dailySums() returns it. */
export function summarize(days: readonly DaySum[]): Summary {
  let total = 0;
  let activeDays = 0;
  let bestDay: DaySum | null = null;
  for (const day of days) {
    total += day.total;
    if (day.total > 0) {
      activeDays++;
      if (!bestDay || day.total >= bestDay.total) bestDay = day;
    }
  }
  return {
    total,
    activeDays,
    averagePerActiveDay: activeDays > 0 ? Math.round(total / activeDays) : null,
    bestDay,
    firstDate: days[0]?.date ?? null,
  };
}

export type GoalRate = { met: number; count: number };

/**
 * Met periods of a repeating goal so far. The period in progress counts only
 * once it's met, so the rate doesn't drop every morning. Null for total goals.
 */
export function goalRate(
  task: GoalTask,
  today: string,
  weekStart: Weekday,
  dailySums: ReadonlyMap<string, number>,
  firstEntryDate: string | null,
): GoalRate | null {
  if (task.recurrence === 'none') return null;
  const { met, inProgress } = periodResults(task, today, weekStart, dailySums, firstEntryDate);
  const pending = inProgress && !met[met.length - 1] ? 1 : 0;
  return { met: met.filter(Boolean).length, count: met.length - pending };
}

// ---------------------------------------------------------------------------
// Bar chart

export type Granularity = 'day' | 'week' | 'month';

export const SERIES_LENGTH: Record<Granularity, number> = { day: 30, week: 12, month: 12 };

export type Bar = { period: Period; total: number };

/** The chart a goal opens with: its own period, or days for total goals. */
export function defaultGranularity(recurrence: Recurrence): Granularity {
  return recurrence === 'weekly' ? 'week' : recurrence === 'monthly' ? 'month' : 'day';
}

/** The last `count` periods, oldest first, ending with the one that contains today. */
export function barSeries(
  granularity: Granularity,
  today: string,
  weekStart: Weekday,
  dailySums: ReadonlyMap<string, number>,
  count = SERIES_LENGTH[granularity],
): Bar[] {
  const periods: Period[] = [];
  for (let i = count - 1; i >= 0; i--) {
    if (granularity === 'day') {
      const date = addDays(today, -i);
      periods.push({ start: date, end: date });
    } else if (granularity === 'week') {
      periods.push(periodContaining('weekly', addDays(today, -7 * i), weekStart));
    } else {
      const month = `${addMonths(today.slice(0, 7), -i)}-01`;
      periods.push({ start: month, end: endOfMonth(month) });
    }
  }
  return periods.map((period) => ({ period, total: sumOver(period, dailySums) }));
}

/** The goal as a reference line, when the bars measure the goal's own period. */
export function goalLine(
  task: { recurrence: Recurrence; target: number },
  granularity: Granularity,
): number | null {
  const matches =
    (task.recurrence === 'daily' && granularity === 'day') ||
    (task.recurrence === 'weekly' && granularity === 'week') ||
    (task.recurrence === 'monthly' && granularity === 'month');
  return matches ? task.target : null;
}

export type Axis = { min: number; max: number; ticks: number[] };

// Tick steps: counts use 1-2-5 (and 25, 250… above 10), durations use whole
// minutes and hours so labels read "15 min", "1 h".
const COUNT_STEPS = [1, 2, 5, 10, 20, 25, 50];
const DURATION_STEP_MIN = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 300, 600];

function countStep(rough: number): number {
  let scale = 1;
  for (;;) {
    for (const step of COUNT_STEPS) if (step * scale >= rough) return step * scale;
    scale *= 100;
  }
}

function durationStep(roughSeconds: number): number {
  const minutes = roughSeconds / 60;
  const step = DURATION_STEP_MIN.find((m) => m >= minutes);
  return (step ?? Math.ceil(minutes / 600) * 600) * 60;
}

/** Clean ticks from 0 (or below, for net-negative periods) to at least `high`, about three steps. */
export function niceAxis(values: readonly number[], measure: Measure): Axis {
  const high = Math.max(0, ...values);
  const low = Math.min(0, ...values);
  const span = high - low || (measure === 'duration' ? 60 : 1);
  const step = measure === 'duration' ? durationStep(span / 3) : countStep(span / 3);
  const max = Math.max(step, Math.ceil(high / step) * step);
  const min = Math.floor(low / step) * step || 0;
  const ticks: number[] = [];
  for (let v = min; v <= max; v += step) ticks.push(v);
  return { min, max, ticks };
}

// ---------------------------------------------------------------------------
// Calendar heat map

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * Shade for a day. With a daily goal the scale is the goal, so level 4 means
 * "met"; otherwise it's the month's best day. Nothing or less than nothing is 0.
 */
export function heatLevel(amount: number, scale: number): HeatLevel {
  if (amount <= 0 || scale <= 0) return 0;
  const fraction = amount / scale;
  if (fraction >= 1) return 4;
  if (fraction >= 2 / 3) return 3;
  if (fraction >= 1 / 3) return 2;
  return 1;
}

/** The value that maps to the darkest shade for `month` ("YYYY-MM"). */
export function heatScale(
  task: { recurrence: Recurrence; target: number },
  month: string,
  dailySums: ReadonlyMap<string, number>,
): number {
  if (task.recurrence === 'daily') return task.target;
  let best = 0;
  for (const [date, amount] of dailySums) if (date.startsWith(month) && amount > best) best = amount;
  return best;
}
