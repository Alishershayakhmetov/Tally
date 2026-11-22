import { createBackup, planMerge, type Backup, type BackupEntry, type BackupTask } from '@/domain/backup';
import { backupVersions } from '@/domain/sync';

import type { RemoteFile, SyncLocal, SyncRemote } from '../engine';

export function task(id: string, updatedAt: number, extra: Partial<BackupTask> = {}): BackupTask {
  return {
    id,
    name: id,
    emoji: null,
    color: '#2563EB',
    measure: 'count',
    unitLabel: null,
    target: 100,
    recurrence: 'none',
    weekdayMask: null,
    startDate: '2026-10-01',
    endDate: null,
    increments: [1],
    reminderTime: null,
    description: null,
    dayStartMin: null,
    sortOrder: 1,
    archivedAt: null,
    createdAt: 1,
    updatedAt,
    deletedAt: null,
    ...extra,
  };
}

export function entry(id: string, taskId: string, amount: number, updatedAt: number): BackupEntry {
  return {
    id,
    taskId,
    amount,
    source: 'button',
    occurredAt: 1_790_000_000_000,
    utcOffsetMin: 0,
    note: null,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: null,
  };
}

/** A phone's database: merging applies the backup's rule, like importBackup does. */
export class Device implements SyncLocal {
  constructor(public data: Backup) {}

  read(): Backup {
    return JSON.parse(JSON.stringify(this.data)) as Backup;
  }

  merge(remote: Backup) {
    const plan = planMerge(remote, backupVersions(this.data));
    const upsert = <T, K>(rows: T[], incoming: T[], key: (row: T) => K) => {
      const out = new Map(rows.map((row) => [key(row), row]));
      for (const row of incoming) out.set(key(row), row);
      return [...out.values()];
    };
    this.data = {
      ...this.data,
      tasks: upsert(this.data.tasks, plan.tasks, (t) => t.id),
      entries: upsert(this.data.entries, plan.entries, (e) => e.id),
      settings: upsert(this.data.settings, plan.settings, (s) => s.key),
    };
    return plan.summary;
  }
}

export class FakeDropbox implements SyncRemote {
  file: RemoteFile | null = null;
  revs = 0;
  uploads = 0;
  conflicts = 0;
  /** Runs right before an upload is checked, to let "another device" get in first. */
  beforeUpload: (() => void) | null = null;

  async download() {
    return this.file && { ...this.file };
  }

  async upload(text: string, rev: string | null) {
    this.beforeUpload?.();
    if ((this.file?.rev ?? null) !== rev) {
      this.conflicts++;
      return 'conflict' as const;
    }
    this.uploads++;
    this.file = { text, rev: `rev-${++this.revs}` };
    return 'ok' as const;
  }
}

export const backup = (rows: Partial<Pick<Backup, 'tasks' | 'entries' | 'settings'>>) =>
  createBackup({ tasks: [], entries: [], settings: [], ...rows }, new Date('2026-10-12T10:00:00Z'));

export const ids = (device: Device) => ({
  tasks: device.data.tasks.map((t) => `${t.id}@${t.updatedAt}`).sort(),
  entries: device.data.entries.map((e) => `${e.id}:${e.amount}`).sort(),
});
