import { and, asc, eq, getTableColumns, isNull, max, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { deviceUtcOffsetMin, effectiveDayStart, logicalDate } from '@/domain/days';
import type { ValidTaskForm } from '@/domain/input';

import { getDb } from '../client';
import { notifyDataChanged } from '../live';
import { entries, tasks, type Task } from '../schema';
import { getGlobalDayStartMin } from '../settings';

export type TaskWithTotal = Task & { total: number };

const totalColumn = sql<number>`coalesce(sum(${entries.amount}), 0)`.mapWith(Number);

function withTotals() {
  return getDb()
    .select({ ...getTableColumns(tasks), total: totalColumn })
    .from(tasks)
    .leftJoin(entries, and(eq(entries.taskId, tasks.id), isNull(entries.deletedAt)))
    .groupBy(tasks.id);
}

export function listActiveTasks(): TaskWithTotal[] {
  return withTotals()
    .where(and(isNull(tasks.deletedAt), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.sortOrder))
    .all();
}

export function getTask(id: string): TaskWithTotal | undefined {
  return withTotals()
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .get();
}

export function createTask(input: ValidTaskForm, now = Date.now()): string {
  const id = randomUUID();
  const lastOrder =
    getDb()
      .select({ value: max(tasks.sortOrder) })
      .from(tasks)
      .get()?.value ?? 0;
  const dayStart = effectiveDayStart(null, getGlobalDayStartMin());
  getDb()
    .insert(tasks)
    .values({
      id,
      ...input,
      measure: 'count',
      recurrence: 'none',
      startDate: logicalDate(now, deviceUtcOffsetMin(new Date(now)), dayStart),
      sortOrder: lastOrder + 1,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  notifyDataChanged();
  return id;
}

export function softDeleteTask(id: string, now = Date.now()): void {
  getDb().update(tasks).set({ deletedAt: now, updatedAt: now }).where(eq(tasks.id, id)).run();
  notifyDataChanged();
}
