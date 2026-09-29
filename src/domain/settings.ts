import { MAX_DAY_START_MIN } from './days';
import type { WeekStartPref } from './periods';

export type LanguagePref = 'system' | 'en' | 'ru';
export type ThemePref = 'system' | 'light' | 'dark';

export type Settings = {
  language: LanguagePref;
  theme: ThemePref;
  weekStart: WeekStartPref;
  /** Global default cutoff in minutes after midnight (SPEC §3.5). */
  dayStartMin: number;
};

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  theme: 'system',
  weekStart: 'auto',
  dayStartMin: 0,
};

export const DAY_START_STEP_MIN = 15;

export function isValidDayStart(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= 0 &&
    minutes <= MAX_DAY_START_MIN &&
    minutes % DAY_START_STEP_MIN === 0
  );
}

export function clampDayStart(minutes: number): number {
  return Math.min(MAX_DAY_START_MIN, Math.max(0, minutes));
}

/** Settings rows are strings; anything unknown or malformed falls back to the default. */
export function parseSettings(rows: ReadonlyMap<string, string>): Settings {
  const language = rows.get('language');
  const theme = rows.get('theme');
  const weekStart = rows.get('weekStart');
  const dayStart = Number(rows.get('dayStartMin'));
  return {
    language:
      language === 'en' || language === 'ru' || language === 'system' ? language : DEFAULT_SETTINGS.language,
    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : DEFAULT_SETTINGS.theme,
    weekStart:
      weekStart === 'auto'
        ? 'auto'
        : /^[0-6]$/.test(weekStart ?? '')
          ? (Number(weekStart) as WeekStartPref)
          : DEFAULT_SETTINGS.weekStart,
    dayStartMin: isValidDayStart(dayStart) ? dayStart : DEFAULT_SETTINGS.dayStartMin,
  };
}

/** 240 → "04:00" */
export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
