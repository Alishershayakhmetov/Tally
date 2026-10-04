import { getSettings } from '@/db/settings';
import { addDays, effectiveDayStart } from '@/domain/days';
import type { Measure } from '@/domain/measure';
import { resolveWeekStart } from '@/domain/periods';
import { WIDGET_MAX_ROWS, widgetStep, widgetTasks } from '@/domain/widget';
import { windowLabel } from '@/features/tasks/goalText';
import { listTaskViews, type TaskView } from '@/features/tasks/taskViews';
import i18n from '@/i18n';
import { localeFirstWeekday } from '@/lib/weekStart';

// What a widget shows, as plain data. The iOS widget runs in its own runtime
// without the app's code, so everything is precomputed here, text included.

/** The widget's name in app.json for both platforms (and its Android provider class). */
export const WIDGET_NAME = 'TallyWidget';

export type WidgetRow = {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  measure: Measure;
  unit: string | null;
  /** The current period's total (all time for total goals), and its target. */
  total: number;
  target: number;
  /** "today", "this week", "Rest day", or null for total goals. */
  period: string | null;
  /** Real-clock start of the current period (0 for total goals): iOS adds pending presses made since. */
  periodStartMs: number;
  /** What + adds (units, or seconds for time goals), its label ("+1", "+1 min"), and a screen-reader label. */
  step: number | null;
  stepLabel: string | null;
  addLabel: string;
};

export type WidgetSnapshot = {
  rows: WidgetRow[];
  /** Shown when there's no active task. */
  empty: string;
  /** The next moment a row's period changes (a day boundary), or null. */
  nextChangeAt: number | null;
};

/** Epoch ms of a wall-clock time on `date` in the device's time zone. */
function wallClockMs(date: string, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60).getTime();
}

function rowFor(view: TaskView, globalDayStartMin: number): WidgetRow {
  const t = i18n.t.bind(i18n);
  const { task, goal, window } = view;
  const cutoff = effectiveDayStart(task.dayStartMin, globalDayStartMin);
  const step = widgetStep(task.measure, task.increments);
  const stepLabel =
    step === null ? null : task.measure === 'duration' ? `+${step / 60} ${t('counter.min')}` : `+${step}`;
  return {
    id: task.id,
    name: task.name,
    emoji: task.emoji,
    color: task.color,
    measure: task.measure,
    unit: task.unitLabel,
    total: goal.progress.total,
    target: task.target,
    period: goal.restDay && !goal.progress.done ? t('goal.restDay') : windowLabel(t, task.recurrence),
    periodStartMs: window ? wallClockMs(window.start, cutoff) : 0,
    step,
    stepLabel,
    addLabel: stepLabel ? t('widget.add', { amount: stepLabel, name: task.name }) : '',
  };
}

/** The first active tasks on Home at `nowMs`, at most `maxRows`. Needs the database open. */
export function buildWidgetSnapshot(nowMs: number, maxRows = WIDGET_MAX_ROWS): WidgetSnapshot {
  const settings = getSettings();
  const weekStart = resolveWeekStart(settings.weekStart, localeFirstWeekday());
  const views = widgetTasks(listTaskViews(nowMs, settings, weekStart), maxRows);
  const boundaries = views.map((view) =>
    wallClockMs(addDays(view.today, 1), effectiveDayStart(view.task.dayStartMin, settings.dayStartMin)),
  );
  return {
    rows: views.map((view) => rowFor(view, settings.dayStartMin)),
    empty: i18n.t('widget.empty'),
    nextChangeAt: boundaries.length > 0 ? Math.min(...boundaries) : null,
  };
}
