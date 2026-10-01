import type { TFunction } from 'i18next';

import { formatCount, type Measure } from '@/domain/measure';
import type { Bar, Granularity } from '@/domain/stats';
import { formatDate, formatDay } from '@/i18n/format';

function monthName(t: TFunction, month: number, form: 'short' | 'long'): string {
  const names = t(form === 'short' ? 'date.monthsShort' : 'date.monthsLong', { returnObjects: true });
  return (names as string[])[month - 1];
}

/** Under a bar: "Sep 28", the week's first day, or "Sep". */
export function barAxisLabel(t: TFunction, granularity: Granularity, bar: Bar, today: string): string {
  if (granularity === 'month') return monthName(t, Number(bar.period.start.slice(5, 7)), 'short');
  return formatDate(t, bar.period.start, today);
}

/** For the readout and the table: "Today", "Sep 22 – Sep 28", "September 2026". */
export function barLongLabel(t: TFunction, granularity: Granularity, bar: Bar, today: string): string {
  const { start, end } = bar.period;
  if (granularity === 'day') return formatDay(t, start, today);
  if (granularity === 'week') return `${formatDate(t, start, today)} – ${formatDate(t, end, today)}`;
  const [year, month] = start.split('-').map(Number);
  return t('date.monthYear', { month: monthName(t, month, 'long'), year });
}

/** Y-axis ticks: counts as numbers, time as "20 min" or "2 h". */
export function axisTickLabel(t: TFunction, measure: Measure, value: number): string {
  if (measure === 'count') return formatCount(value);
  const minutes = Math.round(value / 60);
  return minutes !== 0 && minutes % 60 === 0
    ? t('stats.axisHours', { n: minutes / 60 })
    : t('stats.axisMin', { n: minutes });
}
