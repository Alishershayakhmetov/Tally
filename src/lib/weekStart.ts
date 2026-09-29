import { getCalendars } from 'expo-localization';

import { useSettings } from '@/db/settings';
import { resolveWeekStart, type Weekday } from '@/domain/periods';

/** expo-localization numbers weekdays 1 = Sunday … 7 = Saturday. */
export function localeFirstWeekday(): Weekday | null {
  const first = getCalendars()[0]?.firstWeekday;
  return first ? ((first - 1) as Weekday) : null;
}

export function useWeekStart(): Weekday {
  return resolveWeekStart(useSettings().weekStart, localeFirstWeekday());
}
