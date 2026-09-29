import { isValidDayStart } from './settings';
import type { Recurrence } from './periods';

export const DEFAULT_INCREMENTS = [-1, 1, 5, 10];
export const MAX_INCREMENTS = 6;
export const MAX_ABS_AMOUNT = 1_000_000_000;
export const MAX_NAME_LENGTH = 60;
export const MAX_UNIT_LENGTH = 30;

/** Error codes map to `errors.<code>` translation keys; params fill their placeholders. */
export type InputError = {
  code:
    | 'amountNotInteger'
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
    | 'dayStartInvalid';
  params?: Record<string, string | number>;
};

type Result<T> = { ok: true; value: T } | { ok: false; error: InputError };

const SIGNED_INT = /^([+\-−]?)(\d+)$/;

/** Accepts "37", "+5", "-5" and the typographic minus "−5". */
export function parseSignedInt(text: string): number | null {
  const match = SIGNED_INT.exec(text.trim().replace(/\s+/g, ''));
  if (!match) return null;
  const magnitude = Number(match[2]);
  if (!Number.isSafeInteger(magnitude)) return null;
  return match[1] === '-' || match[1] === '−' ? -magnitude : magnitude;
}

export function parseAmount(text: string): Result<number> {
  const value = parseSignedInt(text);
  if (value === null) return { ok: false, error: { code: 'amountNotInteger' } };
  if (value === 0) return { ok: false, error: { code: 'amountZero' } };
  if (Math.abs(value) > MAX_ABS_AMOUNT) return { ok: false, error: { code: 'amountTooLarge' } };
  return { ok: true, value };
}

export function parseTarget(text: string): Result<number> {
  const value = parseSignedInt(text);
  if (value === null || value <= 0) return { ok: false, error: { code: 'targetInvalid' } };
  if (value > MAX_ABS_AMOUNT) return { ok: false, error: { code: 'targetTooLarge' } };
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
  unitLabel: string;
  target: string;
  increments: string;
  recurrence: Recurrence;
  /** Only used for daily goals. */
  weekdayMask: number;
  endDate: string | null;
  /** null = follow the global default. */
  dayStartMin: number | null;
};

export type ValidTaskForm = {
  name: string;
  emoji: string | null;
  color: string;
  unitLabel: string | null;
  target: number;
  increments: number[];
  recurrence: Recurrence;
  weekdayMask: number | null;
  endDate: string | null;
  dayStartMin: number | null;
};

export type TaskFormField =
  'name' | 'unitLabel' | 'target' | 'increments' | 'weekdayMask' | 'endDate' | 'dayStartMin';
export type TaskFormErrors = Partial<Record<TaskFormField, InputError>>;

/** `startDate` is the task's start (today for a new task), which an end date cannot precede. */
export function validateTaskForm(
  values: TaskFormValues,
  startDate: string,
): { ok: true; value: ValidTaskForm } | { ok: false; errors: TaskFormErrors } {
  const errors: TaskFormErrors = {};
  const name = values.name.trim();
  const unitLabel = values.unitLabel.trim();

  if (!name) errors.name = { code: 'nameRequired' };
  else if (name.length > MAX_NAME_LENGTH)
    errors.name = { code: 'nameTooLong', params: { max: MAX_NAME_LENGTH } };
  if (unitLabel.length > MAX_UNIT_LENGTH)
    errors.unitLabel = { code: 'unitTooLong', params: { max: MAX_UNIT_LENGTH } };

  const target = parseTarget(values.target);
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

  if (!target.ok || !increments.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      emoji: values.emoji,
      color: values.color,
      unitLabel: unitLabel || null,
      target: target.value,
      increments: increments.value,
      recurrence: values.recurrence,
      weekdayMask: daily && values.weekdayMask !== 127 ? values.weekdayMask & 127 : null,
      endDate: values.endDate,
      dayStartMin: values.dayStartMin,
    },
  };
}
