import { addDays } from './days';
import { computeProgress } from './progress';

const MINUS = '−';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatCount(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n);
}

export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : formatCount(n);
}

/** "640 / 1000 push-ups" */
export function formatProgressLine(total: number, target: number, unitLabel: string | null): string {
  return `${formatCount(total)} / ${target}${unitLabel ? ` ${unitLabel}` : ''}`;
}

/** "64% · 360 left" or "104% · done" */
export function formatStatusLine(total: number, target: number): string {
  const p = computeProgress(total, target);
  return p.done ? `${p.percent}% · done` : `${p.percent}% · ${p.remaining} left`;
}

export function formatClock(occurredAtMs: number, utcOffsetMin: number): string {
  const wall = new Date(occurredAtMs + utcOffsetMin * 60_000);
  const hh = String(wall.getUTCHours()).padStart(2, '0');
  const mm = String(wall.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDayLabel(localDate: string, today: string): string {
  if (localDate === today) return 'Today';
  if (localDate === addDays(today, -1)) return 'Yesterday';
  const [year, month, day] = localDate.split('-').map(Number);
  const label = `${MONTHS[month - 1]} ${day}`;
  return year === Number(today.slice(0, 4)) ? label : `${label}, ${year}`;
}
