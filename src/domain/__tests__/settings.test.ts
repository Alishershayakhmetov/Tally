import { DEFAULT_SETTINGS, formatMinutes, isValidDayStart, parseSettings } from '../settings';

describe('parseSettings', () => {
  it('returns defaults for an empty table', () => {
    expect(parseSettings(new Map())).toEqual(DEFAULT_SETTINGS);
  });

  it('reads stored values', () => {
    const rows = new Map([
      ['language', 'ru'],
      ['theme', 'dark'],
      ['weekStart', '0'],
      ['dayStartMin', '240'],
      ['vibration', 'true'],
    ]);
    expect(parseSettings(rows)).toEqual({
      language: 'ru',
      theme: 'dark',
      weekStart: 0,
      dayStartMin: 240,
      vibration: true,
    });
  });

  it('ignores malformed values', () => {
    const rows = new Map([
      ['language', 'de'],
      ['theme', 'neon'],
      ['weekStart', '9'],
      ['dayStartMin', '1000'],
      ['vibration', 'yes'],
    ]);
    expect(parseSettings(rows)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('vibration', () => {
  it('is off by default, including for installs that never saved it', () => {
    expect(DEFAULT_SETTINGS.vibration).toBe(false);
    expect(parseSettings(new Map([['theme', 'dark']])).vibration).toBe(false);
  });

  it('round-trips through the string column', () => {
    expect(parseSettings(new Map([['vibration', String(true)]])).vibration).toBe(true);
    expect(parseSettings(new Map([['vibration', String(false)]])).vibration).toBe(false);
  });
});

describe('day start', () => {
  it('accepts 15-minute steps from 00:00 to 12:00', () => {
    expect(isValidDayStart(0)).toBe(true);
    expect(isValidDayStart(240)).toBe(true);
    expect(isValidDayStart(720)).toBe(true);
    expect(isValidDayStart(735)).toBe(false);
    expect(isValidDayStart(10)).toBe(false);
    expect(isValidDayStart(-15)).toBe(false);
  });

  it('formats as HH:MM', () => {
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(255)).toBe('04:15');
    expect(formatMinutes(720)).toBe('12:00');
  });
});
