import { and, asc, eq, getTableColumns, isNull, max, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { deviceUtcOffsetMin, effectiveDayStart, logicalDate } from '@/domain/days';
import type { ValidTaskForm } from '@/domain/input';
import type { Ordered } from '@/domain/order';
import { now } from '@/lib/clock';

import { getDb } from '../client';
import { notifyDataChanged } from '../live';
import { activeTimer, entries, tasks, type Task } from '../schema';
import { getGlobalDayStartMin } from '../settings';
import { REGROUP_TASK_SQL } from '../sql';

export type TaskWithTotal = Task & { total: number };

const totalColumn = sql<number>`coalesce(sum(${entries.amount}), 0)`.mapWith(Number);

function withTotals() {
  return getDb()
    .select({ ...getTableColumns(tasks), total: totalColumn })
    .from(tasks)
    .leftJoin(entries, and(eq(entries.taskId, tasks.id), isNull(entries.deletedAt)))
    .groupBy(tasks.id);
}

/** Every task that isn't deleted: active, finished and archived. */
export function listTasks(): TaskWithTotal[] {
  return withTotals().where(isNull(tasks.deletedAt)).orderBy(asc(tasks.sortOrder)).all();
}

export function getTask(id: string): TaskWithTotal | undefined {
  return withTotals()
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .get();
}

/** Today's logical date for a task that will use `taskDayStartMin`. */
export function todayFor(taskDayStartMin: number | null, at = now()): string {
  return logicalDate(
    at,
    deviceUtcOffsetMin(new Date(at)),
    effectiveDayStart(taskDayStartMin, getGlobalDayStartMin()),
  );
}

export function createTask(input: ValidTaskForm, at = now()): string {
  const id = randomUUID();
  const lastOrder =
    getDb()
      .select({ value: max(tasks.sortOrder) })
      .from(tasks)
      .get()?.value ?? 0;
  getDb()
    .insert(tasks)
    .values({
      id,
      ...input,
      startDate: todayFor(input.dayStartMin, at),
      sortOrder: lastOrder + 1,
      createdAt: at,
      updatedAt: at,
    })
    .run();
  notifyDataChanged();
  return id;
}

/** Saves the form; a changed day start re-groups this task's history (SPEC §3.5). */
export function updateTask(id: string, input: ValidTaskForm, at = now()): void {
  const db = getDb();
  const before = db.select({ dayStartMin: tasks.dayStartMin }).from(tasks).where(eq(tasks.id, id)).get();
  if (!before) throw new Error(`task ${id} not found`);
  db.transaction((tx) => {
    tx.update(tasks)
      .set({ ...input, updatedAt: at })
      .where(eq(tasks.id, id))
      .run();
    if (before.dayStartMin !== input.dayStartMin) {
      db.$client.runSync(REGROUP_TASK_SQL, {
        ':day_start_min': effectiveDayStart(input.dayStartMin, getGlobalDayStartMin()),
        ':task_id': id,
      });
    }
  });
  notifyDataChanged();
}

/** Archiving or deleting a task also drops its stopwatch, which could no longer be stopped. */
export function setArchived(id: string, archived: boolean, at = now()): void {
  getDb().transaction((tx) => {
    tx.update(tasks)
      .set({ archivedAt: archived ? at : null, updatedAt: at })
      .where(eq(tasks.id, id))
      .run();
    if (archived) tx.delete(activeTimer).where(eq(activeTimer.taskId, id)).run();
  });
  notifyDataChanged();
}

/** Applies new sort orders from moveItem() (usually one row). */
export function reorderTasks(updates: readonly Ordered[], at = now()): void {
  if (updates.length === 0) return;
  getDb().transaction((tx) => {
    for (const { id, sortOrder } of updates) {
      tx.update(tasks).set({ sortOrder, updatedAt: at }).where(eq(tasks.id, id)).run();
    }
  });
  notifyDataChanged();
}

export function softDeleteTask(id: string, at = now()): void {
  getDb().transaction((tx) => {
    tx.update(tasks).set({ deletedAt: at, updatedAt: at }).where(eq(tasks.id, id)).run();
    tx.delete(activeTimer).where(eq(activeTimer.taskId, id)).run();
  });
  notifyDataChanged();
}
