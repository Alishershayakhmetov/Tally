import type { SQLiteBindParams } from 'expo-sqlite';

import {
  createBackup,
  planMerge,
  type Backup,
  type BackupEntry,
  type BackupTask,
  type MergeSummary,
} from '@/domain/backup';
import { deviceUtcOffsetMin } from '@/domain/days';

import { getDb } from './client';
import { notifyDataChanged } from './live';
import { entries, settings, tasks, type Entry, type Task } from './schema';
import { getSettings, reloadSettings } from './settings';
import { DROP_ENDED_TASK_TIMER_SQL, REGROUP_ALL_SQL, UPSERT_ENTRY, UPSERT_SETTING, UPSERT_TASK } from './sql';

// Export and import (SPEC §10, Phase 3). Format, validation and merge rules are
// pure (domain/backup.ts); this file only reads rows and applies a merge plan.

const toBackupTask = (task: Task): BackupTask => task;

function toBackupEntry({ localDate: _derived, ...entry }: Entry): BackupEntry {
  return entry;
}

/** Everything, soft-deleted rows included, so deletions carry over too. */
export function readBackup(at: Date): Backup {
  const db = getDb();
  return createBackup(
    {
      tasks: db.select().from(tasks).all().map(toBackupTask),
      entries: db.select().from(entries).all().map(toBackupEntry),
      settings: db.select().from(settings).all(),
    },
    at,
    deviceUtcOffsetMin(at),
  );
}

function versions(rows: { id: string; updatedAt: number }[]): Map<string, number> {
  return new Map(rows.map((row) => [row.id, row.updatedAt]));
}

function runEach<Row>(
  statement: { sql: string; params: (row: Row) => SQLiteBindParams },
  rows: readonly Row[],
): void {
  if (rows.length === 0) return;
  const prepared = getDb().$client.prepareSync(statement.sql);
  try {
    for (const row of rows) prepared.executeSync(statement.params(row));
  } finally {
    prepared.finalizeSync();
  }
}

/** Merges a validated backup: new rows are added, and newer versions replace older ones. */
export function importBackup(backup: Backup): MergeSummary {
  const db = getDb();
  const plan = planMerge(backup, {
    tasks: versions(db.select({ id: tasks.id, updatedAt: tasks.updatedAt }).from(tasks).all()),
    entries: versions(db.select({ id: entries.id, updatedAt: entries.updatedAt }).from(entries).all()),
    settings: versions(db.select({ id: settings.key, updatedAt: settings.updatedAt }).from(settings).all()),
  });
  if (plan.tasks.length + plan.entries.length + plan.settings.length === 0) return plan.summary;

  try {
    db.transaction(() => {
      runEach(UPSERT_TASK, plan.tasks);
      runEach(UPSERT_ENTRY, plan.entries);
      runEach(UPSERT_SETTING, plan.settings);
      // The file may have changed cutoffs, so every entry is re-grouped under the merged ones.
      reloadSettings();
      db.$client.runSync(REGROUP_ALL_SQL, { ':day_start_min': getSettings().dayStartMin });
      db.$client.runSync(DROP_ENDED_TASK_TIMER_SQL);
    });
  } finally {
    // Also after a rollback, so the cache never holds settings that weren't committed.
    reloadSettings();
  }
  notifyDataChanged();
  return plan.summary;
}
