import { useEffect, useState } from 'react';

import { currentLogicalDate } from '@/domain/days';

const CHECK_EVERY_MS = 60_000;

/** Today's logical date, re-checked every minute so labels roll over at the cutoff. */
export function useLogicalToday(dayStartMin: number): string {
  const [today, setToday] = useState(() => currentLogicalDate(new Date(), dayStartMin));
  useEffect(() => {
    const timer = setInterval(() => setToday(currentLogicalDate(new Date(), dayStartMin)), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [dayStartMin]);
  return today;
}
