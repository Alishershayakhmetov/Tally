import type { TFunction } from 'i18next';

import { formatAmount } from '@/domain/measure';
import type { Recurrence } from '@/domain/periods';
import { formatDate } from '@/i18n/format';

import type { TaskView } from './taskViews';

export function windowLabel(t: TFunction, recurrence: Recurrence): string | null {
  switch (recurrence) {
    case 'daily':
      return t('goal.today');
    case 'weekly':
      return t('goal.thisWeek');
    case 'monthly':
      return t('goal.thisMonth');
    default:
      return null;
  }
}

/** "64% · 360 left", "104% · done" or "Rest day". */
export function statusText(t: TFunction, view: TaskView): string {
  const { progress, restDay } = view.goal;
  if (restDay && !progress.done) return t('goal.restDay');
  return progress.done
    ? `${progress.percent}% · ${t('goal.done')}`
    : `${progress.percent}% · ${t('goal.left', { amount: formatAmount(view.task.measure, progress.remaining) })}`;
}

/** "12 days left", "Last day", or null without an end date. */
export function deadlineText(t: TFunction, view: TaskView): string | null {
  const left = view.goal.daysLeft;
  if (left === null) return null;
  return left === 1 ? t('goal.lastDay') : t('goal.daysLeft', { count: left });
}

/** "18 of 30 days met" for repeating goals. */
export function periodsMetText(t: TFunction, view: TaskView): string | null {
  const { task, summary } = view;
  if (!summary) return null;
  const key =
    task.recurrence === 'weekly'
      ? 'goal.weeksMet'
      : task.recurrence === 'monthly'
        ? 'goal.monthsMet'
        : 'goal.daysMet';
  return t(key, { met: summary.met, count: summary.total });
}

/** "Ended Oct 31 · Goal reached" or "Ended Oct 31 · 18 of 30 days met". */
export function finishedText(t: TFunction, view: TaskView): string {
  const { task } = view;
  const result =
    periodsMetText(t, view) ?? (task.total >= task.target ? t('goal.reached') : t('goal.missed'));
  return task.endDate
    ? `${t('goal.endedOn', { date: formatDate(t, task.endDate, view.today) })} · ${result}`
    : result;
}

/** What an ended (finished or archived) task achieved; archived total goals keep their live status. */
export function endedStatusText(t: TFunction, view: TaskView): string {
  if (view.lifecycle === 'finished') return finishedText(t, view);
  return periodsMetText(t, view) ?? statusText(t, view);
}

/** Whether an ended task counts as a success, for the ✓ and the green status. */
export function endedSuccessfully(view: TaskView): boolean {
  const { summary, task } = view;
  return summary ? summary.total > 0 && summary.met === summary.total : task.total >= task.target;
}
