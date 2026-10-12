import { parseDurationIn, type DurationUnit, type Measure } from './measure';
import type { Recurrence } from './periods';
import { parseReminderTime } from './reminders';
import { isValidDayStart } from './settings';
import { MAX_COUNTDOWN_SECONDS } from './timer';

export const DEFAULT_INCREMENTS = [-1, 1, 5, 10];
export const MAX_INCREMENTS = 6;
export const MAX_ABS_AMOUNT = 1_000_000_000;
export const MAX_NAME_LENGTH = 60;
export const MAX_UNIT_LENGTH = 30;

/** Error codes map to `errors.<code>` translation keys; params fill their placeholders. */
export type InputError = {
  code:
    | 'amountNotInteger'
    | 'durationInvalid'
    | 'durationTargetInvalid'
    | 'reminderInvalid'
    | 'amountZero'
    | 'amountTooLarge'
    | 'targetInvalid'
    | 'targetTooLarge'
    | 'incrementsEmpty'
    | 'incrementsTooMany'
    | 'incrementInvalid'
    | 'incrementTooLarge'
    | 'incrementDuplicate'
    | 'nameRequired'
    | 'nameTooLong'
    | 'unitTooLong'
    | 'weekdaysEmpty'
    | 'endBeforeStart'
    | 'dayStartInvalid'
    | 'countdownInvalid'
    | 'countdownTooLong'
    | 'numberInvalid'
    | 'numberNotPositive';
  params?: Record<string, string | number>;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: InputError };

const SIGNED_INT = /^([+\-−]?)(\d+)$/;

/** Accepts "37", "+5", "-5" and the typographic minus "−5". */
export function parseSignedInt(text: string): number | null {
  const match = SIGNED_INT.exec(text.trim().replace(/\s+/g, ''));
  if (!match) return null;
  const magnitude = Number(match[2]);
  if (!Number.isSafeInteger(magnitude)) return null;
  return match[1] === '-' || match[1] === '−' ? -magnitude : magnitude;
}

/**
 * A count, or for time goals a time in seconds: minutes / m:ss / h:mm:ss, or a
 * plain number of the `unit` the user picked.
 */
export function parseAmount(
  text: string,
  measure: Measure = 'count',
  unit: DurationUnit = 'format',
): Result<number> {
  const value = measure === 'duration' ? parseDurationIn(text, unit) : parseSignedInt(text);
  if (value === null) {
    const code =
      measure === 'count' ? 'amountNotInteger' : unit === 'format' ? 'durationInvalid' : 'numberInvalid';
    return { ok: false, error: { code } };
  }
  if (value === 0) return { ok: false, error: { code: 'amountZero' } };
  if (Math.abs(value) > MAX_ABS_AMOUNT) return { ok: false, error: { code: 'amountTooLarge' } };
  return { ok: true, value };
}

export function parseTarget(
  text: string,
  measure: Measure = 'count',
  unit: DurationUnit = 'format',
): Result<number> {
  const value = measure === 'duration' ? parseDurationIn(text, unit) : parseSignedInt(text);
  if (value === null || value <= 0) {
    const code =
      measure === 'count'
        ? 'targetInvalid'
        : unit === 'format'
          ? 'durationTargetInvalid'
          : 'numberNotPositive';
    return { ok: false, error: { code } };
  }
  if (value > MAX_ABS_AMOUNT) return { ok: false, error: { code: 'targetTooLarge' } };
  return { ok: true, value };
}

/** A countdown length above 0 and at most 24 h, in seconds. */
export function parseCountdown(text: string, unit: DurationUnit = 'format'): Result<number> {
  const value = parseDurationIn(text, unit);
  if (value === null || value <= 0) {
    return { ok: false, error: { code: unit === 'format' ? 'countdownInvalid' : 'numberNotPositive' } };
  }
  if (value > MAX_COUNTDOWN_SECONDS) return { ok: false, error: { code: 'countdownTooLong' } };
  return { ok: true, value };
}

/** "-1, 1, 5, 10" → [-1, 1, 5, 10], sorted, duplicates rejected. */
export function parseIncrements(text: string): Result<number[]> {
  const parts = text
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, error: { code: 'incrementsEmpty' } };
  if (parts.length > MAX_INCREMENTS) {
    return { ok: false, error: { code: 'incrementsTooMany', params: { max: MAX_INCREMENTS } } };
  }
  const values: number[] = [];
  for (const part of parts) {
    const value = parseSignedInt(part);
    if (value === null || value === 0)
      return { ok: false, error: { code: 'incrementInvalid', params: { value: part } } };
    if (Math.abs(value) > MAX_ABS_AMOUNT) {
      return { ok: false, error: { code: 'incrementTooLarge', params: { value: part } } };
    }
    if (values.includes(value))
      return { ok: false, error: { code: 'incrementDuplicate', params: { value: part } } };
    values.push(value);
  }
  return { ok: true, value: values.sort((a, b) => a - b) };
}

export type TaskFormValues = {
  name: string;
  emoji: string | null;
  color: string;
  measure: Measure;
  /** Counts only; ignored for time goals. */
  unitLabel: string;
  /** A number, or for time goals minutes / m:ss / h:mm:ss, or a number of `targetUnit`. */
  target: string;
  /** How a time goal's target is typed; counts ignore it. */
  targetUnit: DurationUnit;
  /** Units, or minutes for time goals. */
  increments: string;
  recurrence: Recurrence;
  /** Only used for daily goals. */
  weekdayMask: number;
  endDate: string | null;
  /** null = follow the global default. */
  dayStartMin: number | null;
  /** 'HH:MM', or null for no reminder. */
  reminderTime: string | null;
};

export type ValidTaskForm = {
  name: string;
  emoji: string | null;
  color: string;
  measure: Measure;
  unitLabel: string | null;
  /** Units, or seconds for time goals. */
  target: number;
  increments: number[];
  recurrence: Recurrence;
  weekdayMask: number | null;
  endDate: string | null;
  dayStartMin: number | null;
  reminderTime: string | null;
};

export type TaskFormField =
  'name' | 'unitLabel' | 'target' | 'increments' | 'weekdayMask' | 'endDate' | 'dayStartMin' | 'reminderTime';
export type TaskFormErrors = Partial<Record<TaskFormField, InputError>>;

/** `startDate` is the task's start (today for a new task), which an end date cannot precede. */
export function validateTaskForm(
  values: TaskFormValues,
  startDate: string,
): { ok: true; value: ValidTaskForm } | { ok: false; errors: TaskFormErrors } {
  const errors: TaskFormErrors = {};
  const name = values.name.trim();
  const unitLabel = values.measure === 'duration' ? '' : values.unitLabel.trim();

  if (!name) errors.name = { code: 'nameRequired' };
  else if (name.length > MAX_NAME_LENGTH)
    errors.name = { code: 'nameTooLong', params: { max: MAX_NAME_LENGTH } };
  if (unitLabel.length > MAX_UNIT_LENGTH)
    errors.unitLabel = { code: 'unitTooLong', params: { max: MAX_UNIT_LENGTH } };

  const target = parseTarget(values.target, values.measure, values.targetUnit);
  if (!target.ok) errors.target = target.error;
  const increments = parseIncrements(values.increments);
  if (!increments.ok) errors.increments = increments.error;

  const daily = values.recurrence === 'daily';
  if (daily && (values.weekdayMask & 127) === 0) errors.weekdayMask = { code: 'weekdaysEmpty' };
  if (values.endDate !== null && values.endDate < startDate) {
    errors.endDate = { code: 'endBeforeStart', params: { date: startDate } };
  }
  if (values.dayStartMin !== null && !isValidDayStart(values.dayStartMin))
    errors.dayStartMin = { code: 'dayStartInvalid' };
  if (values.reminderTime !== null && parseReminderTime(values.reminderTime) === null)
    errors.reminderTime = { code: 'reminderInvalid' };

  if (!target.ok || !increments.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      emoji: values.emoji,
      color: values.color,
      measure: values.measure,
      unitLabel: unitLabel || null,
      target: target.value,
      increments: increments.value,
      recurrence: values.recurrence,
      weekdayMask: daily && values.weekdayMask !== 127 ? values.weekdayMask & 127 : null,
      endDate: values.endDate,
      dayStartMin: values.dayStartMin,
      reminderTime: values.reminderTime,
    },
  };
}
