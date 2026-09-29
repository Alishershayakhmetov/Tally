export const DEFAULT_INCREMENTS = [-1, 1, 5, 10];
export const MAX_INCREMENTS = 6;
export const MAX_ABS_AMOUNT = 1_000_000_000;
export const MAX_NAME_LENGTH = 60;
export const MAX_UNIT_LENGTH = 30;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

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
  if (value === null) return { ok: false, error: 'Enter a whole number, e.g. 37 or -5' };
  if (value === 0) return { ok: false, error: 'Amount cannot be 0' };
  if (Math.abs(value) > MAX_ABS_AMOUNT) return { ok: false, error: 'That number is too large' };
  return { ok: true, value };
}

export function parseTarget(text: string): Result<number> {
  const value = parseSignedInt(text);
  if (value === null || value <= 0) return { ok: false, error: 'Target must be a whole number above 0' };
  if (value > MAX_ABS_AMOUNT) return { ok: false, error: 'Target is too large' };
  return { ok: true, value };
}

/** "-1, 1, 5, 10" → [-1, 1, 5, 10], sorted, duplicates rejected. */
export function parseIncrements(text: string): Result<number[]> {
  const parts = text
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'Add at least one button' };
  if (parts.length > MAX_INCREMENTS) {
    return { ok: false, error: `At most ${MAX_INCREMENTS} buttons` };
  }
  const values: number[] = [];
  for (const part of parts) {
    const value = parseSignedInt(part);
    if (value === null || value === 0)
      return { ok: false, error: `"${part}" is not a non-zero whole number` };
    if (Math.abs(value) > MAX_ABS_AMOUNT) return { ok: false, error: `"${part}" is too large` };
    if (values.includes(value)) return { ok: false, error: `${part} appears twice` };
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
};

export type ValidTaskForm = {
  name: string;
  emoji: string | null;
  color: string;
  unitLabel: string | null;
  target: number;
  increments: number[];
};

export type TaskFormErrors = Partial<Record<'name' | 'unitLabel' | 'target' | 'increments', string>>;

export function validateTaskForm(
  values: TaskFormValues,
): { ok: true; value: ValidTaskForm } | { ok: false; errors: TaskFormErrors } {
  const errors: TaskFormErrors = {};
  const name = values.name.trim();
  const unitLabel = values.unitLabel.trim();

  if (!name) errors.name = 'Give the task a name';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `At most ${MAX_NAME_LENGTH} characters`;
  if (unitLabel.length > MAX_UNIT_LENGTH) errors.unitLabel = `At most ${MAX_UNIT_LENGTH} characters`;

  const target = parseTarget(values.target);
  if (!target.ok) errors.target = target.error;
  const increments = parseIncrements(values.increments);
  if (!increments.ok) errors.increments = increments.error;

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
    },
  };
}
