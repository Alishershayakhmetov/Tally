import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Timestamps are UTC epoch ms. Rows are never hard-deleted: deleted_at is a
// tombstone so a future sync layer can propagate deletions (SPEC §6.3).

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  emoji: text('emoji'),
  color: text('color').notNull(),
  measure: text('measure', { enum: ['count', 'duration'] })
    .notNull()
    .default('count'),
  unitLabel: text('unit_label'),
  target: integer('target').notNull(),
  recurrence: text('recurrence', { enum: ['none', 'daily', 'weekly', 'monthly'] })
    .notNull()
    .default('none'),
  weekdayMask: integer('weekday_mask'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  increments: text('increments', { mode: 'json' }).$type<number[]>().notNull(),
  reminderTime: text('reminder_time'),
  dayStartMin: integer('day_start_min'),
  sortOrder: real('sort_order').notNull(),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id),
    amount: integer('amount').notNull(),
    source: text('source', { enum: ['button', 'manual', 'timer'] }).notNull(),
    occurredAt: integer('occurred_at').notNull(),
    utcOffsetMin: integer('utc_offset_min').notNull(),
    // Derived cache of logicalDate(occurred_at, utc_offset_min, cutoff); never synced.
    localDate: text('local_date').notNull(),
    /** Optional free text ("felt tired"); editing it bumps updated_at like any edit. */
    note: text('note'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [
    index('entries_task_day_idx')
      .on(t.taskId, t.localDate)
      .where(sql`${t.deletedAt} IS NULL`),
    index('entries_task_time_idx').on(t.taskId, t.occurredAt),
  ],
);

/** At most one row: the running or paused stopwatch (SPEC §4.1). Local state, never synced. */
export const activeTimer = sqliteTable('active_timer', {
  taskId: text('task_id')
    .primaryKey()
    .references(() => tasks.id),
  firstStartedAt: integer('first_started_at').notNull(),
  utcOffsetMin: integer('utc_offset_min').notNull(),
  runningSince: integer('running_since'),
  accumulatedMs: integer('accumulated_ms').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type EntrySource = Entry['source'];
