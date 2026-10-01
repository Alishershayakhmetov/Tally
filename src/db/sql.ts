import type { BackupEntry, BackupSetting, BackupTask } from '@/domain/backup';
import { LOGICAL_DATE_SQL, logicalDateSql } from '@/domain/days';

// Raw statements kept free of Expo imports so Jest can run them against
// node:sqlite with the real migrations (see __tests__/sql.test.ts).

/** Re-derives local_date for every task that follows the global cutoff. */
export const REGROUP_DEFAULT_CUTOFF_TASKS_SQL = `UPDATE entries SET local_date = ${LOGICAL_DATE_SQL}
WHERE task_id IN (SELECT id FROM tasks WHERE day_start_min IS NULL)`;

/** Re-derives local_date for one task. */
export const REGROUP_TASK_SQL = `UPDATE entries SET local_date = ${LOGICAL_DATE_SQL}
WHERE task_id = :task_id`;

/** Re-derives local_date for every entry under its task's effective cutoff (after an import). */
export const REGROUP_ALL_SQL = `UPDATE entries SET local_date = ${logicalDateSql(
  'coalesce((SELECT day_start_min FROM tasks WHERE tasks.id = entries.task_id), :day_start_min)',
)}`;

/** A stopwatch can't outlive its task being archived or deleted (as when a newer version is imported). */
export const DROP_ENDED_TASK_TIMER_SQL = `DELETE FROM active_timer
WHERE task_id IN (SELECT id FROM tasks WHERE archived_at IS NOT NULL OR deleted_at IS NOT NULL)`;

// ---------------------------------------------------------------------------
// Backup import: insert, or replace only when the incoming row is newer. The
// WHERE guard makes the statements safe to run even for rows the merge plan
// would skip.

type Params = Record<string, string | number | null>;

function upsert<Row>(
  table: string,
  key: string,
  columns: readonly (readonly [column: string, field: keyof Row & string])[],
  extraInsert: readonly (readonly [column: string, value: string])[] = [],
) {
  const names = [...columns.map(([c]) => c), ...extraInsert.map(([c]) => c)];
  const values = [...columns.map(([c]) => `:${c}`), ...extraInsert.map(([, v]) => v)];
  const updates = columns.filter(([c]) => c !== key).map(([c]) => `${c} = excluded.${c}`);
  return {
    sql: `INSERT INTO ${table} (${names.join(', ')}) VALUES (${values.join(', ')})
ON CONFLICT (${key}) DO UPDATE SET ${updates.join(', ')}
WHERE excluded.updated_at > ${table}.updated_at`,
    params(row: Row): Params {
      const out: Params = {};
      for (const [column, field] of columns) {
        const value = row[field] as unknown;
        out[`:${column}`] = Array.isArray(value) ? JSON.stringify(value) : (value as string | number | null);
      }
      return out;
    },
  };
}

export const UPSERT_TASK = upsert<BackupTask>('tasks', 'id', [
  ['id', 'id'],
  ['name', 'name'],
  ['emoji', 'emoji'],
  ['color', 'color'],
  ['measure', 'measure'],
  ['unit_label', 'unitLabel'],
  ['target', 'target'],
  ['recurrence', 'recurrence'],
  ['weekday_mask', 'weekdayMask'],
  ['start_date', 'startDate'],
  ['end_date', 'endDate'],
  ['increments', 'increments'],
  ['reminder_time', 'reminderTime'],
  ['day_start_min', 'dayStartMin'],
  ['sort_order', 'sortOrder'],
  ['archived_at', 'archivedAt'],
  ['created_at', 'createdAt'],
  ['updated_at', 'updatedAt'],
  ['deleted_at', 'deletedAt'],
]);

/** local_date starts empty; REGROUP_ALL_SQL fills it in the same transaction. */
export const UPSERT_ENTRY = upsert<BackupEntry>(
  'entries',
  'id',
  [
    ['id', 'id'],
    ['task_id', 'taskId'],
    ['amount', 'amount'],
    ['source', 'source'],
    ['occurred_at', 'occurredAt'],
    ['utc_offset_min', 'utcOffsetMin'],
    ['note', 'note'],
    ['created_at', 'createdAt'],
    ['updated_at', 'updatedAt'],
    ['deleted_at', 'deletedAt'],
  ],
  [['local_date', "''"]],
);

export const UPSERT_SETTING = upsert<BackupSetting>('settings', 'key', [
  ['key', 'key'],
  ['value', 'value'],
  ['updated_at', 'updatedAt'],
]);
