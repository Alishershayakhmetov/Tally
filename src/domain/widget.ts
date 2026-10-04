import { planTap } from './entries';
import type { Lifecycle } from './goal';
import { buttonAmount, type Measure } from './measure';

// Home-screen widgets (Phase 7): the first active tasks on Home, each with
// progress and a + button. Shared by the Android and iOS widgets.

/** The widget shows at most this many tasks (a medium widget). */
export const WIDGET_MAX_ROWS = 3;

/** What one press of a widget's + adds: the task's smallest + button, in units or seconds. Null without one. */
export function widgetStep(measure: Measure, increments: readonly number[]): number | null {
  const positive = increments.filter((n) => n > 0);
  return positive.length > 0 ? buttonAmount(measure, Math.min(...positive)) : null;
}

/** The tasks a widget shows: active ones, in Home order, at most `max`. Reordering Home picks them. */
export function widgetTasks<T extends { lifecycle: Lifecycle }>(
  views: readonly T[],
  max = WIDGET_MAX_ROWS,
): T[] {
  return views.filter((view) => view.lifecycle === 'active').slice(0, max);
}

/** Height of one task row on Android, in dp, and the widget's vertical padding. */
const ROW_DP = 56;
const PADDING_DP = 16;

/** How many task rows fit an Android widget `heightDp` tall: 1 to WIDGET_MAX_ROWS. */
export function widgetRowsForHeight(heightDp: number): number {
  const rows = Math.floor((heightDp - PADDING_DP) / ROW_DP);
  return Math.min(WIDGET_MAX_ROWS, Math.max(1, rows));
}

/**
 * A + press on the iOS widget. The widget can't reach the database, so it
 * keeps presses in its own props until the app runs and logs them.
 */
export type WidgetTap = { taskId: string; at: number; amount: number };

/** One entry to write for a run of presses. */
export type TapGroup = { taskId: string; amount: number; at: number; localDate: string };

/**
 * Turns presses into entries with the counter's merge rule (planTap): presses
 * on the same task within 2 s, in the same direction and on the same logical
 * day become one entry, dated at the first press.
 */
export function groupWidgetTaps(
  taps: readonly WidgetTap[],
  localDateOf: (taskId: string, at: number) => string,
): TapGroup[] {
  const groups: TapGroup[] = [];
  const open = new Map<string, { index: number; lastAt: number }>();
  for (const tap of [...taps].sort((a, b) => a.at - b.at)) {
    if (!Number.isInteger(tap.amount) || tap.amount === 0) continue;
    const localDate = localDateOf(tap.taskId, tap.at);
    const current = open.get(tap.taskId);
    const group = current ? groups[current.index] : undefined;
    const plan =
      current && group
        ? planTap(
            {
              entryId: String(current.index),
              lastTapAt: current.lastAt,
              localDate: group.localDate,
              direction: group.amount > 0 ? 1 : -1,
            },
            tap.amount,
            tap.at,
            localDate,
          )
        : { kind: 'new' as const };
    if (plan.kind === 'extend' && current && group) {
      group.amount += tap.amount;
      current.lastAt = tap.at;
    } else {
      groups.push({ taskId: tap.taskId, amount: tap.amount, at: tap.at, localDate });
      open.set(tap.taskId, { index: groups.length - 1, lastAt: tap.at });
    }
  }
  return groups;
}
