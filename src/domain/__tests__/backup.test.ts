import {
  backupFileName,
  createBackup,
  parseBackup,
  planMerge,
  serializeBackup,
  type Backup,
  type BackupEntry,
  type BackupTask,
  type LocalVersions,
} from '../backup';

const task: BackupTask = {
  id: 'task-1',
  name: 'Push-ups',
  emoji: '💪',
  color: '#2563EB',
  measure: 'count',
  unitLabel: 'reps',
  target: 1000,
  recurrence: 'none',
  weekdayMask: null,
  startDate: '2026-09-01',
  endDate: '2026-10-31',
  increments: [-1, 1, 5, 10],
  reminderTime: '19:30',
  dayStartMin: 240,
  sortOrder: 1,
  archivedAt: null,
  createdAt: 1000,
  updatedAt: 2000,
  deletedAt: null,
};

const entry: BackupEntry = {
  id: 'entry-1',
  taskId: 'task-1',
  amount: 25,
  source: 'button',
  occurredAt: 1_790_000_000_000,
  utcOffsetMin: 300,
  note: 'felt tired',
  createdAt: 3000,
  updatedAt: 3000,
  deletedAt: null,
};

function backup(overrides: Partial<Backup> = {}): Backup {
  return {
    ...createBackup(
      { tasks: [task], entries: [entry], settings: [{ key: 'dayStartMin', value: '240', updatedAt: 500 }] },
      new Date('2026-09-30T10:00:00Z'),
    ),
    ...overrides,
  };
}

/** Parses a JSON-able value the way a picked file would arrive. */
function parse(value: unknown) {
  return parseBackup(JSON.stringify(value));
}

describe('export format', () => {
  it('round-trips through JSON unchanged', () => {
    const original = backup();
    expect(parseBackup(serializeBackup(original))).toEqual({ ok: true, backup: original });
  });

  it('names the file by date', () => {
    expect(backupFileName('2026-09-30')).toBe('tally-backup-2026-09-30.json');
  });

  it('accepts an empty backup', () => {
    expect(parse(backup({ tasks: [], entries: [], settings: [] })).ok).toBe(true);
  });
});

describe('parseBackup rejects', () => {
  it('text that is not JSON', () => {
    expect(parseBackup('{"app": "tally",')).toEqual({ ok: false, error: 'notJson' });
  });

  it('JSON from somewhere else', () => {
    expect(parse({ hello: 'world' })).toEqual({ ok: false, error: 'notBackup' });
    expect(parse([1, 2, 3])).toEqual({ ok: false, error: 'notBackup' });
    expect(parse(null)).toEqual({ ok: false, error: 'notBackup' });
  });

  it('a file from a newer app version', () => {
    expect(parse({ ...backup(), format: 2 })).toEqual({ ok: false, error: 'newerFormat' });
  });

  it.each<[string, Partial<BackupTask>]>([
    ['tasks[0].color', { color: 'blue' }],
    ['tasks[0].target', { target: 0 }],
    ['tasks[0].measure', { measure: 'weight' as never }],
    ['tasks[0].startDate', { startDate: '2026-02-30' }],
    ['tasks[0].endDate', { endDate: '2026-13-01' }],
    ['tasks[0].increments', { increments: [] }],
    ['tasks[0].increments', { increments: [1, 0] }],
    ['tasks[0].reminderTime', { reminderTime: '25:00' }],
    ['tasks[0].dayStartMin', { dayStartMin: 10 }],
    ['tasks[0].weekdayMask', { weekdayMask: 128 }],
    ['tasks[0].name', { name: '   ' }],
    ['tasks[0].updatedAt', { updatedAt: 1.5 }],
  ])('an invalid task field (%s)', (detail, change) => {
    expect(parse(backup({ tasks: [{ ...task, ...change }] }))).toEqual({
      ok: false,
      error: 'invalid',
      detail,
    });
  });

  it('a missing field', () => {
    const { color: _color, ...noColor } = task;
    expect(parse(backup({ tasks: [noColor as BackupTask] }))).toMatchObject({ detail: 'tasks[0].color' });
  });

  it('invalid entries', () => {
    expect(parse(backup({ entries: [{ ...entry, amount: 2.5 }] }))).toMatchObject({
      detail: 'entries[0].amount',
    });
    expect(parse(backup({ entries: [{ ...entry, utcOffsetMin: 900 }] }))).toMatchObject({
      detail: 'entries[0].utcOffsetMin',
    });
    expect(parse(backup({ entries: [{ ...entry, source: 'robot' as never }] }))).toMatchObject({
      detail: 'entries[0].source',
    });
  });

  it('duplicate ids and entries whose task is not in the file', () => {
    expect(parse(backup({ tasks: [task, task] }))).toMatchObject({ detail: 'tasks: duplicate id' });
    expect(parse(backup({ entries: [entry, entry] }))).toMatchObject({ detail: 'entries: duplicate id' });
    expect(parse(backup({ entries: [{ ...entry, taskId: 'elsewhere' }] }))).toMatchObject({
      detail: 'entries[0].taskId',
    });
  });

  it('a section that is not a list', () => {
    expect(parse({ ...backup(), entries: {} })).toMatchObject({ detail: 'entries' });
  });
});

describe('notes (added in Phase 5)', () => {
  it('imports a file written before notes existed, with null notes', () => {
    const { note: _note, ...withoutNote } = entry;
    const parsed = parse(backup({ entries: [withoutNote as BackupEntry] }));
    expect(parsed.ok && parsed.backup.entries[0].note).toBeNull();
  });

  it('rejects a note longer than the app allows', () => {
    expect(parse(backup({ entries: [{ ...entry, note: 'x'.repeat(141) }] }))).toMatchObject({
      detail: 'entries[0].note',
    });
    expect(parse(backup({ entries: [{ ...entry, note: 42 as never }] }))).toMatchObject({
      detail: 'entries[0].note',
    });
  });
});

describe('parseBackup cleans', () => {
  it('drops properties it does not know, so they never reach SQL', () => {
    const parsed = parse(backup({ tasks: [{ ...task, evil: 'DROP TABLE tasks' } as BackupTask] }));
    expect(parsed.ok && parsed.backup.tasks[0]).toEqual(task);
  });

  it('drops settings keys from newer versions', () => {
    const settings = [
      { key: 'theme', value: 'dark', updatedAt: 1 },
      { key: 'futureThing', value: 'x', updatedAt: 1 },
    ];
    const parsed = parse(backup({ settings }));
    expect(parsed.ok && parsed.backup.settings).toEqual([{ key: 'theme', value: 'dark', updatedAt: 1 }]);
  });
});

describe('planMerge', () => {
  const none: LocalVersions = { tasks: new Map(), entries: new Map(), settings: new Map() };

  it('adds everything to an empty phone', () => {
    const plan = planMerge(backup(), none);
    expect(plan.tasks).toEqual([task]);
    expect(plan.entries).toEqual([entry]);
    expect(plan.settings).toHaveLength(1);
    expect(plan.summary).toEqual({ tasksAdded: 1, entriesAdded: 1, updated: 1 });
  });

  it('changes nothing when the phone already has the same rows', () => {
    const plan = planMerge(backup(), {
      tasks: new Map([[task.id, task.updatedAt]]),
      entries: new Map([[entry.id, entry.updatedAt]]),
      settings: new Map([['dayStartMin', 500]]),
    });
    expect(plan).toMatchObject({ tasks: [], entries: [], settings: [] });
    expect(plan.summary).toEqual({ tasksAdded: 0, entriesAdded: 0, updated: 0 });
  });

  it('replaces only rows the file edited more recently', () => {
    const plan = planMerge(backup(), {
      tasks: new Map([[task.id, task.updatedAt - 1]]),
      entries: new Map([[entry.id, entry.updatedAt + 1]]),
      settings: new Map([['dayStartMin', 499]]),
    });
    expect(plan.tasks).toEqual([task]);
    expect(plan.entries).toEqual([]);
    expect(plan.settings.map((s) => s.key)).toEqual(['dayStartMin']);
    expect(plan.summary).toEqual({ tasksAdded: 0, entriesAdded: 0, updated: 2 });
  });

  it('applies newer deletions but does not count new tombstones as added', () => {
    const deletedEntry = { ...entry, deletedAt: 4000, updatedAt: 4000 };
    const deletedTask = { ...task, id: 'task-2', deletedAt: 2500 };
    const plan = planMerge(backup({ tasks: [task, deletedTask], entries: [deletedEntry], settings: [] }), {
      ...none,
      entries: new Map([[entry.id, entry.updatedAt]]),
    });
    expect(plan.entries).toEqual([deletedEntry]);
    expect(plan.tasks).toEqual([task, deletedTask]);
    expect(plan.summary).toEqual({ tasksAdded: 1, entriesAdded: 0, updated: 1 });
  });
});
