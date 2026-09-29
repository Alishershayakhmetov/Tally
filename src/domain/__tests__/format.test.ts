import {
  formatClock,
  formatCount,
  formatDayLabel,
  formatProgressLine,
  formatSigned,
  formatStatusLine,
} from '../format';

describe('progress lines', () => {
  it('formats the card text for partial, done, overshoot and negative totals', () => {
    expect(formatProgressLine(640, 1000, 'push-ups')).toBe('640 / 1000 push-ups');
    expect(formatProgressLine(-5, 100, null)).toBe('−5 / 100');
    expect(formatStatusLine(640, 1000)).toBe('64% · 360 left');
    expect(formatStatusLine(1040, 1000)).toBe('104% · done');
    expect(formatStatusLine(-5, 100)).toBe('0% · 105 left');
  });
});

describe('formatCount / formatSigned', () => {
  it('uses a typographic minus for negatives', () => {
    expect(formatCount(-5)).toBe('−5');
    expect(formatCount(0)).toBe('0');
    expect(formatSigned(5)).toBe('+5');
    expect(formatSigned(-5)).toBe('−5');
  });
});

describe('formatClock', () => {
  it('shows the wall-clock time the entry was logged at', () => {
    const occurredAt = Date.parse('2026-09-29T19:04:00+05:00');
    expect(formatClock(occurredAt, 300)).toBe('19:04');
    expect(formatClock(occurredAt, 0)).toBe('14:04');
  });
});

describe('formatDayLabel', () => {
  it.each([
    ['2026-09-29', '2026-09-29', 'Today'],
    ['2026-09-28', '2026-09-29', 'Yesterday'],
    ['2026-12-31', '2027-01-01', 'Yesterday'],
    ['2026-09-01', '2026-09-29', 'Sep 1'],
    ['2025-12-30', '2026-09-29', 'Dec 30, 2025'],
  ])('%s seen on %s → %s', (date, today, expected) => {
    expect(formatDayLabel(date, today)).toBe(expected);
  });
});
