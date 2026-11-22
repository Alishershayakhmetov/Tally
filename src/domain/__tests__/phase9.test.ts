import { createBackup, type Backup, type BackupEntry, type BackupTask } from '../backup';
import { parseAmount, parseCountdown, parseTarget, validateTaskForm, type TaskFormValues } from '../input';
import { parseDurationIn, switchDurationUnit } from '../measure';
import { formatIsoWithOffset } from '../days';
import { backupVersions, remoteIsBehind, serializeSyncFile } from '../sync';

describe('parseDurationIn', () => {
  it('keeps the format: minutes, m:ss and h:mm:ss', () => {
    expect(parseDurationIn('25', 'format')).toBe(1500);
    expect(parseDurationIn('1:30', 'format')).toBe(90);
    expect(parseDurationIn('1:05:00', 'format')).toBe(3900);
  });

  it('reads a plain number in the picked unit, with a dot or a comma', () => {
    expect(parseDurationIn('2', 'hours')).toBe(7200);
    expect(parseDurationIn('1,5', 'hours')).toBe(5400);
    expect(parseDurationIn('1.5', 'hours')).toBe(5400);
    expect(parseDurationIn('90', 'minutes')).toBe(5400);
    expect(parseDurationIn('0.5', 'minutes')).toBe(30);
    expect(parseDurationIn('.5', 'minutes')).toBe(30);
    expect(parseDurationIn(' 45 ', 'seconds')).toBe(45);
  });

  it('rounds to whole seconds and keeps the sign', () => {
    expect(parseDurationIn('1.2345', 'hours')).toBe(4444);
    expect(parseDurationIn('2.6', 'seconds')).toBe(3);
    expect(parseDurationIn('-5', 'minutes')).toBe(-300);
    expect(parseDurationIn('−0,5', 'hours')).toBe(-1800);
    expect(Object.is(parseDurationIn('-0', 'seconds'), -0)).toBe(false);
  });

  it('rejects the format in a unit, and anything that is not a number', () => {
    for (const text of ['', '1:30', '1,5,5', 'abc', '5 min', '1.', '1e3']) {
      expect(parseDurationIn(text, 'minutes')).toBeNull();
    }
    expect(parseDurationIn('1,5', 'format')).toBeNull();
  });
});

describe('switchDurationUnit', () => {
  it('keeps a typed number, which then means the new unit', () => {
    expect(switchDurationUnit('45', 'format', 'seconds')).toBe('45');
    expect(switchDurationUnit('1,5', 'minutes', 'hours')).toBe('1,5');
    expect(switchDurationUnit('90', 'seconds', 'format')).toBe('90');
    expect(switchDurationUnit('', 'format', 'hours')).toBe('');
  });

  it('converts a time like 1:30:00 when the unit shows it exactly', () => {
    expect(switchDurationUnit('1:30:00', 'format', 'hours')).toBe('1.5');
    expect(switchDurationUnit('1:30:00', 'format', 'minutes')).toBe('90');
    expect(switchDurationUnit('1:05:00', 'format', 'seconds')).toBe('3900');
    expect(switchDurationUnit('0:17:24', 'format', 'hours')).toBe('0.29');
  });

  it('leaves the text alone when it would need more decimals, or is not a time', () => {
    expect(switchDurationUnit('1:05:00', 'format', 'hours')).toBe('1:05:00');
    expect(switchDurationUnit('1:61', 'format', 'minutes')).toBe('1:61');
    expect(switchDurationUnit('1:30', 'format', 'format')).toBe('1:30');
  });
});

describe('parsing time input with a unit', () => {
  it('amounts: a number in the unit, any sign, but not zero', () => {
    expect(parseAmount('45', 'duration', 'seconds')).toEqual({ ok: true, value: 45 });
    expect(parseAmount('-1,5', 'duration', 'minutes')).toEqual({ ok: true, value: -90 });
    expect(parseAmount('0.2', 'duration', 'seconds')).toEqual({ ok: false, error: { code: 'amountZero' } });
    expect(parseAmount('1:30', 'duration', 'minutes')).toEqual({
      ok: false,
      error: { code: 'numberInvalid' },
    });
    expect(parseAmount('1:30', 'duration')).toEqual({ ok: true, value: 90 });
    // Counts ignore the unit.
    expect(parseAmount('12', 'count', 'hours')).toEqual({ ok: true, value: 12 });
  });

  it('targets and countdowns: a number above 0', () => {
    expect(parseTarget('1.5', 'duration', 'hours')).toEqual({ ok: true, value: 5400 });
    expect(parseTarget('0', 'duration', 'hours')).toEqual({
      ok: false,
      error: { code: 'numberNotPositive' },
    });
    expect(parseTarget('x', 'duration', 'hours')).toEqual({
      ok: false,
      error: { code: 'numberNotPositive' },
    });
    expect(parseTarget('x', 'duration')).toEqual({ ok: false, error: { code: 'durationTargetInvalid' } });
    expect(parseCountdown('45', 'seconds')).toEqual({ ok: true, value: 45 });
    expect(parseCountdown('25', 'hours')).toEqual({ ok: false, error: { code: 'countdownTooLong' } });
    expect(parseCountdown('-1', 'minutes')).toEqual({ ok: false, error: { code: 'numberNotPositive' } });
    expect(parseCountdown('0')).toEqual({ ok: false, error: { code: 'countdownInvalid' } });
  });

  it('the task form reads a time goal in its unit', () => {
    const form: TaskFormValues = {
      name: 'Plank',
      emoji: null,
      color: '#2563EB',
      measure: 'duration',
      unitLabel: '',
      target: '1,5',
      targetUnit: 'hours',
      increments: '1, 5',
      recurrence: 'none',
      weekdayMask: 127,
      endDate: null,
      dayStartMin: null,
      reminderTime: null,
      description: '',
    };
    const result = validateTaskForm(form, '2026-10-12');
    expect(result.ok && result.value.target).toBe(5400);
  });
});

// ---------------------------------------------------------------------------
// Sync file

const task: BackupTask = {
  id: 'task-1',
  name: 'Push-ups',
  emoji: '💪',
  color: '#2563EB',
  measure: 'count',
  unitLabel: null,
  target: 1000,
  recurrence: 'none',
  weekdayMask: null,
  startDate: '2026-10-01',
  endDate: null,
  increments: [1, 5],
  reminderTime: null,
  description: null,
  dayStartMin: null,
  sortOrder: 1,
  archivedAt: null,
  createdAt: 1000,
  updatedAt: 1000,
  deletedAt: null,
};

const entry: BackupEntry = {
  id: 'entry-1',
  taskId: 'task-1',
  amount: 5,
  source: 'button',
  occurredAt: 1_790_000_000_000,
  utcOffsetMin: 300,
  note: null,
  createdAt: 2000,
  updatedAt: 2000,
  deletedAt: null,
};

function file(rows: Partial<Pick<Backup, 'tasks' | 'entries' | 'settings'>>): Backup {
  return createBackup({ tasks: [], entries: [], settings: [], ...rows }, new Date('2026-10-12T10:00:00Z'));
}

describe('remoteIsBehind', () => {
  const both = file({
    tasks: [task],
    entries: [entry],
    settings: [{ key: 'theme', value: 'dark', updatedAt: 5 }],
  });

  it('uploads when there is no file yet', () => {
    expect(remoteIsBehind(both, null)).toBe(true);
  });

  it('does not upload when the file has everything, even if it has more', () => {
    expect(remoteIsBehind(both, both)).toBe(false);
    expect(remoteIsBehind(file({ tasks: [task] }), both)).toBe(false);
    // The file's newer version of a row is merged in, not a reason to upload.
    expect(remoteIsBehind(both, { ...both, entries: [{ ...entry, updatedAt: 9000 }] })).toBe(false);
  });

  it('uploads a missing row, a newer version, or a deletion', () => {
    expect(remoteIsBehind(both, file({ tasks: [task] }))).toBe(true);
    expect(remoteIsBehind({ ...both, entries: [{ ...entry, amount: 6, updatedAt: 3000 }] }, both)).toBe(true);
    expect(remoteIsBehind({ ...both, tasks: [{ ...task, deletedAt: 4000, updatedAt: 4000 }] }, both)).toBe(
      true,
    );
  });

  it('ignores settings the file format drops, so they never cause an upload loop', () => {
    const extra = {
      ...both,
      settings: [...both.settings, { key: 'someFutureKey', value: 'x', updatedAt: 99 }],
    };
    expect(remoteIsBehind(extra, both)).toBe(false);
  });

  it('writes compact JSON that reads back as the same versions', () => {
    const text = serializeSyncFile(both);
    expect(text).not.toContain('\n');
    expect(backupVersions(JSON.parse(text) as Backup)).toEqual(backupVersions(both));
  });
});

describe('export time', () => {
  const at = Date.UTC(2026, 9, 12, 10, 0, 0);

  it('is the phone clock with its UTC offset, not UTC', () => {
    expect(formatIsoWithOffset(at, 300)).toBe('2026-10-12T15:00:00+05:00');
    expect(formatIsoWithOffset(at, -270)).toBe('2026-10-12T05:30:00-04:30');
    expect(formatIsoWithOffset(at, 0)).toBe('2026-10-12T10:00:00+00:00');
    // The date can differ from UTC's.
    expect(formatIsoWithOffset(Date.UTC(2026, 9, 12, 22, 0, 0), 300)).toBe('2026-10-13T03:00:00+05:00');
  });

  it('is what a backup records, and still reads back as the same instant', () => {
    const backup = createBackup({ tasks: [], entries: [], settings: [] }, new Date(at), 300);
    expect(backup.exportedAt).toBe('2026-10-12T15:00:00+05:00');
    expect(new Date(backup.exportedAt).getTime()).toBe(at);
  });
});
