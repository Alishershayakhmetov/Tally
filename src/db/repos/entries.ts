import { and, asc, between, desc, eq, isNotNull, isNull, max, sql, sum } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';

import { normalizeNote } from '@/domain/notes';
import type { Period } from '@/domain/periods';
import { now } from '@/lib/clock';

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
  note?: string | null;
};

const live = (taskId: string) => and(eq(entries.taskId, taskId), isNull(entries.deletedAt));

export function addEntry(input: NewEntry, at = now()): string {
  const id = randomUUID();
  getDb()
    .insert(entries)
    .values({ id, ...input, note: normalizeNote(input.note), createdAt: at, updatedAt: at })
    .run();
  notifyDataChanged();
  return id;
}

/** Adds delta to an existing entry (tap coalescing) and returns its new amount. */
export function extendEntry(id: string, delta: number, at = now()): number {
  const row = getDb()
    .update(entries)
    .set({ amount: sql`${entries.amount} + ${delta}`, updatedAt: at })
    .where(and(eq(entries.id, id), isNull(entries.deletedAt)))
    .returning({ amount: entries.amount })
    .get();
  if (!row) throw new Error(`entry ${id} not found`);
  notifyDataChanged();
  return row.amount;
}

/** Edits an entry's amount and note (History). */
export function updateEntry(id: string, change: { amount: number; note: string | null }, at = now()): void {
  getDb()
    .update(entries)
    .set({ amount: change.amount, note: normalizeNote(change.note), updatedAt: at })
    .where(eq(entries.id, id))
    .run();
  notifyDataChanged();
}

/** Adds, changes or (with null) removes the note on an entry. */
export function setEntryNote(id: string, note: string | null, at = now()): void {
  getDb()
    .update(entries)
    .set({ note: normalizeNote(note), updatedAt: at })
    .where(eq(entries.id, id))
    .run();
  notifyDataChanged();
}

/** Distinct notes across all tasks, most recently used first, for the quick chips. */
export function recentNotes(limit = 6): string[] {
  return getDb()
    .select({ note: entries.note, last: max(entries.updatedAt) })
    .from(entries)
    .where(and(isNotNull(entries.note), isNull(entries.deletedAt)))
    .groupBy(entries.note)
    .orderBy(desc(max(entries.updatedAt)))
    .limit(limit)
    .all()
    .flatMap((row) => (row.note ? [row.note] : []));
}

export function softDeleteEntry(id: string, at = now()): void {
  getDb().update(entries).set({ deletedAt: at, updatedAt: at }).where(eq(entries.id, id)).run();
  notifyDataChanged();
}

export function listRecentEntries(taskId: string, limit = 20): Entry[] {
  return getDb()
    .select()
    .from(entries)
    .where(live(taskId))
    .orderBy(desc(entries.occurredAt), desc(entries.createdAt))
    .limit(limit)
    .all();
}

export function listEntries(taskId: string): Entry[] {
  return getDb()
    .select()
    .from(entries)
    .where(live(taskId))
    .orderBy(desc(entries.occurredAt), desc(entries.createdAt))
    .all();
}

/** Net amount logged on the logical days of `period` (uses the task/day index). */
export function sumEntries(taskId: string, period: Period): number {
  const row = getDb()
    .select({ total: sum(entries.amount).mapWith(Number) })
    .from(entries)
    .where(and(live(taskId), between(entries.localDate, period.start, period.end)))
    .get();
  return row?.total ?? 0;
}

/** Net amount per logical day, oldest first. */
export function dailySums(taskId: string): { date: string; total: number }[] {
  return getDb()
    .select({ date: entries.localDate, total: sum(entries.amount).mapWith(Number) })
    .from(entries)
    .where(live(taskId))
    .groupBy(entries.localDate)
    .orderBy(asc(entries.localDate))
    .all();
}
