import type { TFunction } from 'i18next';

import { formatAmount } from '@/domain/measure';
import type { Recurrence } from '@/domain/periods';
import type { StreakUnit } from '@/domain/streaks';
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

/** "Need 24/day · 40 ahead of pace", "Need 50 today", or null without a pace window. */
export function paceText(t: TFunction, view: TaskView): string | null {
  const { pace, task } = view;
  if (!pace) return null;
  const amount = (n: number) => formatAmount(task.measure, n);
  if (pace.daysLeft === 1) return t('pace.today', { amount: amount(pace.perDay) });
  const relative =
    pace.ahead > 0
      ? t('pace.ahead', { amount: amount(pace.ahead) })
      : pace.ahead < 0
        ? t('pace.behind', { amount: amount(-pace.ahead) })
        : t('pace.onPace');
  return `${t('pace.perDay', { amount: amount(pace.perDay) })} · ${relative}`;
}

const STREAK_KEYS: Record<StreakUnit, { current: string; best: string }> = {
  day: { current: 'streak.days', best: 'streak.bestDays' },
  week: { current: 'streak.weeks', best: 'streak.bestWeeks' },
  month: { current: 'streak.months', best: 'streak.bestMonths' },
};

/** "12-day streak", for the badge's accessibility label. */
export function streakLabel(t: TFunction, view: TaskView): string {
  return t(STREAK_KEYS[view.streak.unit].current, { count: view.streak.current });
}

/** "🔥 12-day streak · best 20", or "Best streak: 20 days" once there's no current streak or the task ended. */
export function streakText(t: TFunction, view: TaskView): string | null {
  const { streak, lifecycle } = view;
  if (lifecycle === 'active' && streak.current > 0) {
    const current = `🔥 ${streakLabel(t, view)}`;
    return streak.best > streak.current ? `${current} · ${t('streak.best', { n: streak.best })}` : current;
  }
  return streak.best > 0 ? t(STREAK_KEYS[streak.unit].best, { count: streak.best }) : null;
}

/** Home cards show a badge from this many periods in a row. */
export const MIN_BADGE_STREAK = 2;

export function showsStreakBadge(view: TaskView): boolean {
  return view.lifecycle === 'active' && view.streak.current >= MIN_BADGE_STREAK;
}
