import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { BackupEntry, BackupTask } from '@/domain/backup';
import { logicalDate } from '@/domain/days';

import {
  DROP_ENDED_TASK_TIMER_SQL,
  REGROUP_ALL_SQL,
  REGROUP_DEFAULT_CUTOFF_TASKS_SQL,
  REGROUP_TASK_SQL,
  UPSERT_ENTRY,
  UPSERT_SETTING,
  UPSERT_TASK,
} from '../sql';

const MIGRATIONS = join(__dirname, '..', '..', '..', 'drizzle');
const ALMATY = 300;

function migratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    for (const statement of readFileSync(join(MIGRATIONS, file), 'utf8').split('--> statement-breakpoint')) {
      db.exec(statement);
    }
  }
  return db;
}

function addTask(db: DatabaseSync, id: string, dayStartMin: number | null) {
  db.prepare(
    `INSERT INTO tasks (id, name, color, target, start_date, increments, day_start_min, sort_order, created_at, updated_at)
     VALUES (?, ?, '#000000', 100, '2026-09-28', '[1]', ?, 1, 0, 0)`,
  ).run(id, id, dayStartMin);
}

function addEntry(db: DatabaseSync, id: string, taskId: string, wallClock: string) {
  const occurredAt = Date.parse(`${wallClock}:00+05:00`);
  db.prepare(
    `INSERT INTO entries (id, task_id, amount, source, occurred_at, utc_offset_min, local_date, created_at, updated_at)
     VALUES (?, ?, 1, 'button', ?, ?, ?, 0, 0)`,
  ).run(id, taskId, occurredAt, ALMATY, logicalDate(occurredAt, ALMATY, 0));
}

function dayOf(db: DatabaseSync, entryId: string): string {
  return (db.prepare('SELECT local_date AS d FROM entries WHERE id = ?').get(entryId) as { d: string }).d;
}

describe('migrations', () => {
  it('apply cleanly in order and create every table', () => {
    const tables = migratedDb()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(['active_timer', 'entries', 'settings', 'tasks']);
  });

  it('add the countdown length to the timer (0004)', () => {
    const columns = migratedDb()
      .prepare('PRAGMA table_info(active_timer)')
      .all()
      .map((r) => r as { name: string; notnull: number });
    expect(columns.find((c) => c.name === 'countdown_ms')).toMatchObject({ notnull: 0 });
  });
});

describe('re-grouping when a cutoff changes (SPEC §3.5)', () => {
  function setup() {
    const db = migratedDb();
    addTask(db, 'follows-default', null);
    addTask(db, 'own-cutoff', 60);
    addEntry(db, 'late-night', 'follows-default', '2026-09-29T01:30');
    addEntry(db, 'evening', 'follows-default', '2026-09-28T21:00');
    addEntry(db, 'other-task', 'own-cutoff', '2026-09-29T01:30');
    return db;
  }

  it('moves only default-cutoff tasks when the global cutoff changes', () => {
    const db = setup();
    expect(dayOf(db, 'late-night')).toBe('2026-09-29');
    db.prepare(REGROUP_DEFAULT_CUTOFF_TASKS_SQL).run({ ':day_start_min': 240 });
    expect(dayOf(db, 'late-night')).toBe('2026-09-28');
    expect(dayOf(db, 'evening')).toBe('2026-09-28');
    expect(dayOf(db, 'other-task')).toBe('2026-09-29');
  });

  it('moves one task when its own cutoff changes, and back again', () => {
    const db = setup();
    db.prepare(REGROUP_TASK_SQL).run({ ':day_start_min': 180, ':task_id': 'own-cutoff' });
    expect(dayOf(db, 'other-task')).toBe('2026-09-28');
    expect(dayOf(db, 'late-night')).toBe('2026-09-29');
    db.prepare(REGROUP_TASK_SQL).run({ ':day_start_min': 0, ':task_id': 'own-cutoff' });
    expect(dayOf(db, 'other-task')).toBe('2026-09-29');
  });

  it('does not touch updated_at, so re-grouping never looks like a user edit', () => {
    const db = setup();
    db.prepare(REGROUP_DEFAULT_CUTOFF_TASKS_SQL).run({ ':day_start_min': 240 });
    const edited = db.prepare('SELECT count(*) AS n FROM entries WHERE updated_at <> 0').get() as {
      n: number;
    };
    expect(edited.n).toBe(0);
  });
});

describe('backup import SQL (SPEC §10, Phase 3)', () => {
  const task: BackupTask = {
    id: 'pushups',
    name: 'Push-ups',
    emoji: null,
    color: '#2563EB',
    measure: 'count',
    unitLabel: null,
    target: 1000,
    recurrence: 'none',
    weekdayMask: null,
    startDate: '2026-09-01',
    endDate: null,
    increments: [-1, 1, 5, 10],
    reminderTime: null,
    description: null,
    dayStartMin: 240,
    sortOrder: 1,
    archivedAt: null,
    createdAt: 1000,
    updatedAt: 2000,
    deletedAt: null,
  };
  const entry: BackupEntry = {
    id: 'late-night',
    taskId: 'pushups',
    amount: 20,
    source: 'button',
    occurredAt: Date.parse('2026-09-29T02:00:00+05:00'),
    utcOffsetMin: ALMATY,
    note: 'felt tired',
    createdAt: 3000,
    updatedAt: 3000,
    deletedAt: null,
  };

  function importedDb() {
    const db = migratedDb();
    db.exec('PRAGMA foreign_keys = ON');
    db.prepare(UPSERT_TASK.sql).run(UPSERT_TASK.params({ ...task, description: null }));
    db.prepare(UPSERT_TASK.sql).run(UPSERT_TASK.params({ ...task, id: 'squats', dayStartMin: null }));
    db.prepare(UPSERT_ENTRY.sql).run(UPSERT_ENTRY.params(entry));
    db.prepare(UPSERT_ENTRY.sql).run(UPSERT_ENTRY.params({ ...entry, id: 'squats-night', taskId: 'squats' }));
    db.prepare(REGROUP_ALL_SQL).run({ ':day_start_min': 0 });
    return db;
  }

  const row = (db: DatabaseSync, table: string, id: string) =>
    db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as Record<string, unknown>;

  it('inserts tasks and entries with every column, increments as JSON', () => {
    const db = importedDb();
    expect(row(db, 'tasks', 'pushups')).toMatchObject({
      name: 'Push-ups',
      increments: '[-1,1,5,10]',
      description: null,
      day_start_min: 240,
      updated_at: 2000,
      deleted_at: null,
    });
    expect(row(db, 'entries', 'late-night')).toMatchObject({
      amount: 20,
      utc_offset_min: ALMATY,
      note: 'felt tired',
    });
  });

  it("derives local_date under each task's effective cutoff", () => {
    const db = importedDb();
    expect(dayOf(db, 'late-night')).toBe('2026-09-28'); // own cutoff 04:00
    expect(dayOf(db, 'squats-night')).toBe('2026-09-29'); // global 00:00
  });

  it('stores a task description, line breaks included', () => {
    const db = importedDb();
    const text = 'Why: health' + String.fromCharCode(10) + 'How: daily';
    db.prepare(UPSERT_TASK.sql).run(UPSERT_TASK.params({ ...task, description: text, updatedAt: 2500 }));
    expect(row(db, 'tasks', 'pushups').description).toBe(text);
  });

  it('replaces a row only when the incoming version is newer', () => {
    const db = importedDb();
    const rename = (name: string, updatedAt: number) =>
      db.prepare(UPSERT_TASK.sql).run(UPSERT_TASK.params({ ...task, name, updatedAt }));
    rename('Older', 1999);
    rename('Same age', 2000);
    expect(row(db, 'tasks', 'pushups').name).toBe('Push-ups');
    rename('Newer', 2001);
    expect(row(db, 'tasks', 'pushups')).toMatchObject({ name: 'Newer', updated_at: 2001 });
  });

  it('applies a newer deletion and keeps local_date until re-grouping', () => {
    const db = importedDb();
    db.prepare(UPSERT_ENTRY.sql).run(UPSERT_ENTRY.params({ ...entry, deletedAt: 4000, updatedAt: 4000 }));
    expect(row(db, 'entries', 'late-night')).toMatchObject({ deleted_at: 4000, local_date: '2026-09-28' });
  });

  it('drops a stopwatch whose task the import archived or deleted', () => {
    const db = importedDb();
    const addTimer = (taskId: string) =>
      db
        .prepare(
          'INSERT INTO active_timer (task_id, first_started_at, utc_offset_min, accumulated_ms) VALUES (?, 0, 0, 0)',
        )
        .run(taskId);
    addTimer('pushups');
    db.prepare(REGROUP_ALL_SQL).run({ ':day_start_min': 0 });
    db.prepare(DROP_ENDED_TASK_TIMER_SQL).run();
    expect(db.prepare('SELECT count(*) AS n FROM active_timer').get()).toEqual({ n: 1 });
    db.prepare(UPSERT_TASK.sql).run(UPSERT_TASK.params({ ...task, archivedAt: 5000, updatedAt: 5000 }));
    db.prepare(DROP_ENDED_TASK_TIMER_SQL).run();
    expect(db.prepare('SELECT count(*) AS n FROM active_timer').get()).toEqual({ n: 0 });
  });

  it('merges settings by key, newer wins', () => {
    const db = migratedDb();
    const set = (value: string, updatedAt: number) =>
      db.prepare(UPSERT_SETTING.sql).run(UPSERT_SETTING.params({ key: 'theme', value, updatedAt }));
    set('dark', 10);
    set('light', 5);
    const theme = () =>
      (db.prepare("SELECT value FROM settings WHERE key = 'theme'").get() as { value: string }).value;
    expect(theme()).toBe('dark');
    set('light', 11);
    expect(theme()).toBe('light');
  });
});
