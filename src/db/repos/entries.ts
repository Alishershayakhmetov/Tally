import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { getDb } from '../client';
import { notifyDataChanged } from '../live';
import { entries, type Entry, type EntrySource } from '../schema';

export type NewEntry = {
  taskId: string;
  amount: number;
  source: EntrySource;
  occurredAt: number;
  utcOffsetMin: number;
  localDate: string;
};

export function addEntry(input: NewEntry, now = Date.now()): string {
  const id = randomUUID();
  getDb()
    .insert(entries)
    .values({ id, ...input, createdAt: now, updatedAt: now })
    .run();
  notifyDataChanged();
  return id;
}

/** Adds delta to an existing entry (tap coalescing) and returns its new amount. */
export function extendEntry(id: string, delta: number, now = Date.now()): number {
  const row = getDb()
    .update(entries)
    .set({ amount: sql`${entries.amount} + ${delta}`, updatedAt: now })
    .where(and(eq(entries.id, id), isNull(entries.deletedAt)))
    .returning({ amount: entries.amount })
    .get();
  if (!row) throw new Error(`entry ${id} not found`);
  notifyDataChanged();
  return row.amount;
}

export function softDeleteEntry(id: string, now = Date.now()): void {
  getDb().update(entries).set({ deletedAt: now, updatedAt: now }).where(eq(entries.id, id)).run();
  notifyDataChanged();
}

export function listRecentEntries(taskId: string, limit = 20): Entry[] {
  return getDb()
    .select()
    .from(entries)
    .where(and(eq(entries.taskId, taskId), isNull(entries.deletedAt)))
    .orderBy(desc(entries.occurredAt), desc(entries.createdAt))
    .limit(limit)
    .all();
}
