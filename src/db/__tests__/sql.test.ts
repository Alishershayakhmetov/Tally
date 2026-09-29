import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { logicalDate } from '@/domain/days';

import { REGROUP_DEFAULT_CUTOFF_TASKS_SQL, REGROUP_TASK_SQL } from '../sql';

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
