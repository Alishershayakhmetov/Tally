import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { importBackup, readBackup } from '@/db/backup';
import { getDb, openDatabase } from '@/db/client';
import { addEntry, listEntries } from '@/db/repos/entries';
import { createTask, getTask, listTasks } from '@/db/repos/tasks';
import { updateSetting } from '@/db/settings';
import { createBackup } from '@/domain/backup';
import type { ValidTaskForm } from '@/domain/input';

import type { DbRunResult, DesktopBridge } from '../bridge';

// The Windows app's database path, end to end in Node: the app's own Drizzle
// layer, migrations and repositories run through the expo-sqlite stand-in
// (src/desktop/sqlite.ts), which calls the main process's better-sqlite3
// wrapper (desktop/src/database.js) the way the preload script would.
// Skipped where desktop/ has no node_modules (nothing installed for the Windows app).

jest.mock('expo-crypto', () => ({
  randomUUID: () => jest.requireActual<typeof import('node:crypto')>('node:crypto').randomUUID(),
}));
// The app imports 'expo-sqlite'; the Windows build swaps in the stand-in (metro.config.js).
jest.mock('expo-sqlite', () => jest.requireActual('../sqlite'));

type Database = {
  open(directory: string, name: string): void;
  close(): void;
  exec(sql: string): void;
  run(sql: string, params: unknown, raw: boolean): unknown;
  bindParams(params: unknown): unknown;
};

let database: Database | null = null;
try {
  database = jest.requireActual<Database>('../../../desktop/src/database');
} catch {
  database = null;
}

const FORM: ValidTaskForm = {
  name: 'Push-ups',
  emoji: '💪',
  color: '#2563EB',
  measure: 'count',
  unitLabel: 'reps',
  target: 100,
  increments: [1, 5],
  recurrence: 'daily',
  weekdayMask: null,
  endDate: null,
  dayStartMin: null,
  reminderTime: null,
};

(database ? describe : describe.skip)('SQLite through the desktop bridge', () => {
  const db = database as Database;
  let directory = '';

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'tally-desktop-'));
    // Only the database part of the bridge is needed here.
    const bridge: Pick<DesktopBridge, 'platform' | 'db'> = {
      platform: 'win32',
      db: {
        open: (name) => db.open(directory, name),
        exec: (sql) => db.exec(sql),
        run: (sql, params, raw) => db.run(sql, params, raw) as DbRunResult,
      },
    };
    globalThis.tallyDesktop = bridge as DesktopBridge;
    await openDatabase();
  });

  afterAll(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
    delete globalThis.tallyDesktop;
  });

  it('opens, migrates and reads an empty list', async () => {
    expect(listTasks()).toEqual([]);
  });

  it('stores tasks and entries with millisecond timestamps as integers', async () => {
    const at = Date.UTC(2026, 9, 12, 12, 0, 0);
    const id = createTask(FORM, at);
    addEntry(
      { taskId: id, amount: 7, source: 'button', occurredAt: at, utcOffsetMin: 300, localDate: '2026-10-12' },
      at,
    );
    expect(getTask(id)?.total).toBe(7);
    expect(listEntries(id)[0]).toMatchObject({ amount: 7, occurredAt: at, createdAt: at });
    // The stored type matters: a REAL would turn `occurred_at / 1000` into a fraction.
    const row = getDb().$client.getAllSync<{ t: string }>('select typeof(occurred_at) t from entries');
    expect(row).toEqual([{ t: 'integer' }]);
  });

  it('applies statements with named parameters (":name")', () => {
    // 02:00 local on Oct 12 (UTC+5) is before a 04:00 cutoff, so it belongs to Oct 11.
    const night = createTask({ ...FORM, name: 'Night' });
    const at = Date.UTC(2026, 9, 11, 21, 0, 0);
    addEntry(
      {
        taskId: night,
        amount: 1,
        source: 'button',
        occurredAt: at,
        utcOffsetMin: 300,
        localDate: '2026-10-12',
      },
      at,
    );
    updateSetting('dayStartMin', 240);
    expect(listEntries(night)[0].localDate).toBe('2026-10-11');
    updateSetting('dayStartMin', 0);
    expect(listEntries(night)[0].localDate).toBe('2026-10-12');
  });

  it('exports, and imports a second device’s changes in one transaction', async () => {
    const mine = readBackup(new Date(Date.UTC(2026, 9, 12, 13, 0, 0)));
    expect(importBackup(mine)).toEqual({ tasksAdded: 0, entriesAdded: 0, updated: 0 });

    const [task] = listTasks();
    const theirEntry = {
      ...mine.entries[0],
      id: randomUUID(),
      amount: 3,
      updatedAt: mine.entries[0].updatedAt + 1,
    };
    const summary = importBackup({ ...mine, entries: [...mine.entries, theirEntry] });
    expect(summary.entriesAdded).toBe(1);
    expect(
      listEntries(task.id)
        .map((e) => e.amount)
        .sort(),
    ).toEqual([3, 7]);
  });

  it('rolls everything back when an import fails halfway', async () => {
    const [task] = listTasks();
    const before = listEntries(task.id).length;
    const mine = readBackup(new Date());
    const good = { ...mine.entries[0], id: randomUUID(), updatedAt: mine.entries[0].updatedAt + 5 };
    // An entry for a task that doesn't exist breaks the foreign key after `good` was written.
    const orphan = { ...good, id: randomUUID(), taskId: 'no-such-task' };
    expect(() =>
      importBackup(createBackup({ tasks: [], entries: [good, orphan], settings: [] }, new Date())),
    ).toThrow();
    expect(listEntries(task.id)).toHaveLength(before);
  });

  describe('binding values', () => {
    it('strips the prefix of named parameters, and binds whole numbers as integers', () => {
      expect(db.bindParams({ ':a': 1, '@b': 'x', $c: true, d: undefined })).toEqual({
        a: 1n,
        b: 'x',
        c: 1n,
        d: null,
      });
      expect(db.bindParams([1.5, 1_790_000_000_000, 'x', null])).toEqual([
        1.5,
        1_790_000_000_000n,
        'x',
        null,
      ]);
    });
  });
});
