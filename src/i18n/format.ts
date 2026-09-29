import type { TFunction } from 'i18next';

import { describeDay } from '@/domain/format';
import type { InputError } from '@/domain/input';

function monthsShort(t: TFunction): string[] {
  return t('date.monthsShort', { returnObjects: true }) as string[];
}

/** "Oct 31" / "31 окт.", with the year only when it differs from today's. */
export function formatDate(t: TFunction, localDate: string, today: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const monthName = monthsShort(t)[month - 1];
  return year === Number(today.slice(0, 4))
    ? t('date.dayMonth', { day, month: monthName })
    : t('date.dayMonthYear', { day, month: monthName, year });
}

/** "Today", "Yesterday", or a date. */
export function formatDay(t: TFunction, localDate: string, today: string): string {
  const described = describeDay(localDate, today);
  if (described.kind === 'today') return t('date.today');
  if (described.kind === 'yesterday') return t('date.yesterday');
  return formatDate(t, localDate, today);
}

export function formatError(t: TFunction, error: InputError): string {
  return t(`errors.${error.code}`, error.params ?? {});
}
