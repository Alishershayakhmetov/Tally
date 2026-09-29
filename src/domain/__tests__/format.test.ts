import { describeDay, formatClock, formatCount, formatProgressLine, formatSigned } from '../format';

describe('formatCount / formatSigned', () => {
  it('uses a typographic minus for negatives', () => {
    expect(formatCount(-5)).toBe('−5');
    expect(formatCount(0)).toBe('0');
    expect(formatSigned(5)).toBe('+5');
    expect(formatSigned(-5)).toBe('−5');
  });
});

describe('formatProgressLine', () => {
  it('puts the unit after a separator, and shows negatives', () => {
    expect(formatProgressLine(640, 1000, 'push-ups')).toBe('640 / 1000 · push-ups');
    expect(formatProgressLine(-5, 100, null)).toBe('−5 / 100');
  });
});

describe('formatClock', () => {
  it('shows the wall-clock time the entry was logged at', () => {
    const occurredAt = Date.parse('2026-09-29T19:04:00+05:00');
    expect(formatClock(occurredAt, 300)).toBe('19:04');
    expect(formatClock(occurredAt, 0)).toBe('14:04');
  });
});

describe('describeDay', () => {
  it.each([
    ['2026-09-29', '2026-09-29', { kind: 'today' }],
    ['2026-09-28', '2026-09-29', { kind: 'yesterday' }],
    ['2026-12-31', '2027-01-01', { kind: 'yesterday' }],
    ['2026-09-01', '2026-09-29', { kind: 'date', day: 1, month: 8, year: null }],
    ['2025-12-30', '2026-09-29', { kind: 'date', day: 30, month: 11, year: 2025 }],
  ])('%s seen on %s', (date, today, expected) => {
    expect(describeDay(date, today)).toEqual(expected);
  });
});
