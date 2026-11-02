import { formatIsoWithOffset } from './days';
import { MAX_ABS_AMOUNT, MAX_INCREMENTS, MAX_NAME_LENGTH, MAX_UNIT_LENGTH } from './input';
import type { Measure } from './measure';
import { MAX_NOTE_LENGTH } from './notes';
import type { Recurrence } from './periods';
import { parseReminderTime } from './reminders';
import { DEFAULT_SETTINGS, isValidDayStart } from './settings';

// Backup file (SPEC §10, Phase 3): every task and entry, tombstones included,
// plus settings. `local_date` is a derived cache and the stopwatch is local
// state, so neither is exported. A picked file is untrusted input: it's fully
// validated before anything is written.

export const BACKUP_APP = 'tally';
export const BACKUP_FORMAT = 1;

export type BackupTask = {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  measure: Measure;
  unitLabel: string | null;
  target: number;
  recurrence: Recurrence;
  weekdayMask: number | null;
  startDate: string;
  endDate: string | null;
  increments: number[];
  reminderTime: string | null;
  dayStartMin: number | null;
  sortOrder: number;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type BackupEntry = {
  id: string;
  taskId: string;
  amount: number;
  source: 'button' | 'manual' | 'timer';
  occurredAt: number;
  utcOffsetMin: number;
  /** Added in Phase 5; files from before it have no notes and import with null. */
  note: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export type BackupSetting = { key: string; value: string; updatedAt: number };

export type Backup = {
  app: typeof BACKUP_APP;
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  tasks: BackupTask[];
  entries: BackupEntry[];
  settings: BackupSetting[];
};

export type BackupError = 'notJson' | 'notBackup' | 'newerFormat' | 'invalid';

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: BackupError; detail?: string };

export function createBackup(
  data: { tasks: BackupTask[]; entries: BackupEntry[]; settings: BackupSetting[] },
  exportedAt: Date,
  /** The phone's UTC offset, so the export time reads as the phone's clock, not UTC. */
  utcOffsetMin = 0,
): Backup {
  const at = formatIsoWithOffset(exportedAt.getTime(), utcOffsetMin);
  return { app: BACKUP_APP, format: BACKUP_FORMAT, exportedAt: at, ...data };
}

export function serializeBackup(backup: Backup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/** "tally-backup-2026-09-30.json" */
export function backupFileName(localDate: string): string {
  return `${BACKUP_APP}-backup-${localDate}.json`;
}

// ---------------------------------------------------------------------------
// Validation

const SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));
/** UTC−14:00 … UTC+14:00 */
const MAX_OFFSET_MIN = 14 * 60;

type Check = (value: unknown) => boolean;

const isString: Check = (v) => typeof v === 'string';
const isId: Check = (v) => typeof v === 'string' && v.length > 0 && v.length <= 64;
const isInt: Check = (v) => Number.isSafeInteger(v);
const isTimestamp: Check = (v) => isInt(v) && (v as number) >= 0;
const nullable =
  (check: Check): Check =>
  (v) =>
    v === null || check(v);
const oneOf =
  (...values: string[]): Check =>
  (v) =>
    typeof v === 'string' && values.includes(v);
/** A real calendar date: "2026-02-30" and "2026-13-01" are rejected. */
const isDate: Check = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(v);
};
const isAmount: Check = (v) => isInt(v) && Math.abs(v as number) <= MAX_ABS_AMOUNT;

const TASK_FIELDS: Record<keyof BackupTask, Check> = {
  id: isId,
  name: (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_NAME_LENGTH,
  emoji: nullable((v) => typeof v === 'string' && v.length <= 16),
  color: (v) => typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v),
  measure: oneOf('count', 'duration'),
  unitLabel: nullable((v) => typeof v === 'string' && v.length <= MAX_UNIT_LENGTH),
  target: (v) => isAmount(v) && (v as number) > 0,
  recurrence: oneOf('none', 'daily', 'weekly', 'monthly'),
  weekdayMask: nullable((v) => isInt(v) && (v as number) >= 1 && (v as number) <= 127),
  startDate: isDate,
  endDate: nullable(isDate),
  increments: (v) =>
    Array.isArray(v) && v.length >= 1 && v.length <= MAX_INCREMENTS && v.every((n) => isAmount(n) && n !== 0),
  reminderTime: nullable((v) => typeof v === 'string' && parseReminderTime(v) !== null),
  dayStartMin: nullable((v) => typeof v === 'number' && isValidDayStart(v)),
  sortOrder: (v) => typeof v === 'number' && Number.isFinite(v),
  archivedAt: nullable(isTimestamp),
  createdAt: isTimestamp,
  updatedAt: isTimestamp,
  deletedAt: nullable(isTimestamp),
};

const ENTRY_FIELDS: Record<keyof BackupEntry, Check> = {
  id: isId,
  taskId: isId,
  amount: isAmount,
  source: oneOf('button', 'manual', 'timer'),
  occurredAt: isTimestamp,
  utcOffsetMin: (v) => isInt(v) && Math.abs(v as number) <= MAX_OFFSET_MIN,
  note: nullable((v) => typeof v === 'string' && v.length <= MAX_NOTE_LENGTH),
  createdAt: isTimestamp,
  updatedAt: isTimestamp,
  deletedAt: nullable(isTimestamp),
};

const SETTING_FIELDS: Record<keyof BackupSetting, Check> = {
  key: isString,
  value: isString,
  updatedAt: isTimestamp,
};

/** Fields added after format 1 was first written: a missing one means null, not an error. */
const LATER_FIELDS = new Set(['note']);

/** Copies exactly the known fields, so extra properties in the file never reach SQL. */
function pick<T>(raw: unknown, fields: Record<keyof T & string, Check>, path: string): T | string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return path;
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, check] of Object.entries(fields) as [string, Check][]) {
    const value = source[key] === undefined && LATER_FIELDS.has(key) ? null : source[key];
    if (!check(value)) return `${path}.${key}`;
    out[key] = value;
  }
  return out as T;
}

function pickAll<T>(raw: unknown, fields: Record<keyof T & string, Check>, name: string): T[] | string {
  if (!Array.isArray(raw)) return name;
  const out: T[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = pick<T>(raw[i], fields, `${name}[${i}]`);
    if (typeof row === 'string') return row;
    out.push(row);
  }
  return out;
}

function hasDuplicateIds(rows: readonly { id: string }[]): boolean {
  return new Set(rows.map((r) => r.id)).size !== rows.length;
}

export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'notJson' };
  }
  return parseBackupValue(raw);
}

/** For callers that already hold the parsed JSON (the sync file is parsed once to tell its format). */
export function parseBackupValue(raw: unknown): ParsedBackup {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'notBackup' };
  const file = raw as Record<string, unknown>;
  if (file.app !== BACKUP_APP || !isInt(file.format)) return { ok: false, error: 'notBackup' };
  if ((file.format as number) > BACKUP_FORMAT) return { ok: false, error: 'newerFormat' };
  if (file.format !== BACKUP_FORMAT) return { ok: false, error: 'notBackup' };

  const invalid = (detail: string): ParsedBackup => ({ ok: false, error: 'invalid', detail });
  if (!isString(file.exportedAt)) return invalid('exportedAt');
  const tasks = pickAll<BackupTask>(file.tasks, TASK_FIELDS, 'tasks');
  if (typeof tasks === 'string') return invalid(tasks);
  const entries = pickAll<BackupEntry>(file.entries, ENTRY_FIELDS, 'entries');
  if (typeof entries === 'string') return invalid(entries);
  const settings = pickAll<BackupSetting>(file.settings, SETTING_FIELDS, 'settings');
  if (typeof settings === 'string') return invalid(settings);

  if (hasDuplicateIds(tasks)) return invalid('tasks: duplicate id');
  if (hasDuplicateIds(entries)) return invalid('entries: duplicate id');
  const taskIds = new Set(tasks.map((t) => t.id));
  const orphan = entries.findIndex((e) => !taskIds.has(e.taskId));
  if (orphan >= 0) return invalid(`entries[${orphan}].taskId`);

  return {
    ok: true,
    backup: {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: file.exportedAt as string,
      tasks,
      entries,
      // Unknown keys may come from a newer app version; they're dropped, not an error.
      settings: settings.filter((s) => SETTING_KEYS.has(s.key)),
    },
  };
}

// ---------------------------------------------------------------------------
// Merge: match by id, the newer updated_at wins, ties keep what's on the phone.

/** id → updated_at of what's already on the phone, tombstones included. */
export type LocalVersions = {
  tasks: ReadonlyMap<string, number>;
  entries: ReadonlyMap<string, number>;
  settings: ReadonlyMap<string, number>;
};

export type MergePlan = {
  tasks: BackupTask[];
  entries: BackupEntry[];
  settings: BackupSetting[];
  summary: MergeSummary;
};

export type MergeSummary = {
  /** New, not-deleted rows. */
  tasksAdded: number;
  entriesAdded: number;
  /** Rows that replaced an older local version (including deletions), plus settings written. */
  updated: number;
};

function newer<T extends { updatedAt: number }>(
  rows: readonly T[],
  local: ReadonlyMap<string, number>,
  key: (row: T) => string,
): { write: T[]; added: T[]; updated: number } {
  const write: T[] = [];
  const added: T[] = [];
  let updated = 0;
  for (const row of rows) {
    const mine = local.get(key(row));
    if (mine === undefined) {
      write.push(row);
      added.push(row);
    } else if (row.updatedAt > mine) {
      write.push(row);
      updated++;
    }
  }
  return { write, added, updated };
}

export function planMerge(backup: Backup, local: LocalVersions): MergePlan {
  const tasks = newer(backup.tasks, local.tasks, (t) => t.id);
  const entries = newer(backup.entries, local.entries, (e) => e.id);
  const settings = newer(backup.settings, local.settings, (s) => s.key);
  return {
    tasks: tasks.write,
    entries: entries.write,
    settings: settings.write,
    summary: {
      tasksAdded: tasks.added.filter((t) => t.deletedAt === null).length,
      entriesAdded: entries.added.filter((e) => e.deletedAt === null).length,
      updated: tasks.updated + entries.updated + settings.write.length,
    },
  };
}
