import {
  buttonAmount,
  formatAmount,
  formatDuration,
  formatSignedAmount,
  parseDurationText,
} from '../measure';

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [65, '1:05'],
    [1500, '25:00'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [36000, '10:00:00'],
    [-180, '−3:00'],
  ])('%p s → %p', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe('formatAmount / formatSignedAmount', () => {
  it('formats by measure', () => {
    expect(formatAmount('count', 1500)).toBe('1500');
    expect(formatAmount('duration', 1500)).toBe('25:00');
    expect(formatSignedAmount('duration', 300)).toBe('+5:00');
    expect(formatSignedAmount('duration', -60)).toBe('−1:00');
    expect(formatSignedAmount('count', -1)).toBe('−1');
  });

  it('turns minute buttons into seconds for time goals', () => {
    expect(buttonAmount('duration', 5)).toBe(300);
    expect(buttonAmount('duration', -1)).toBe(-60);
    expect(buttonAmount('count', 5)).toBe(5);
  });
});

describe('parseDurationText', () => {
  it.each([
    ['25', 1500],
    ['1:30', 90],
    ['90:00', 5400],
    ['1:05:00', 3900],
    ['0:45', 45],
    ['-3', -180],
    ['−1:00', -60],
    [' 2 ', 120],
  ])('%p → %p s', (text, seconds) => {
    expect(parseDurationText(text)).toBe(seconds);
  });

  it.each(['', 'abc', '1:5', '1:60', '1:00:60', '1:60:00', '1.5', '::', '1:2:3'])('rejects %p', (text) => {
    expect(parseDurationText(text)).toBeNull();
  });
});
