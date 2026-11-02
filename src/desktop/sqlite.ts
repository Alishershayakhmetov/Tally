import type { SQLiteBindParams } from 'expo-sqlite';

import { getDesktop, type DbRunResult } from './bridge';

// A stand-in for `expo-sqlite` in the Windows app's web build (metro.config.js
// swaps it in when TALLY_DESKTOP=1). It offers the part of the API that
// Drizzle's expo-sqlite driver and this app use, and forwards each statement to
// better-sqlite3 in Electron's main process over synchronous IPC. Results come
// back whole, so a statement is just its SQL: nothing is kept open on the other side.

function bridge() {
  const desktop = getDesktop();
  if (!desktop) throw new Error('The desktop bridge is missing: this build only runs in the Windows app.');
  return desktop;
}

export type SQLiteRunResult = { changes: number; lastInsertRowId: number };

class SQLiteExecuteResult {
  constructor(
    private readonly result: DbRunResult,
    readonly changes = result.changes,
    readonly lastInsertRowId = result.lastInsertRowId,
  ) {}

  getAllSync<T = unknown>(): T[] {
    return this.result.rows as T[];
  }

  getFirstSync<T = unknown>(): T | null {
    return (this.result.rows[0] as T | undefined) ?? null;
  }
}

export class SQLiteStatement {
  constructor(private readonly sql: string) {}

  executeSync(params: SQLiteBindParams = []): SQLiteExecuteResult {
    return new SQLiteExecuteResult(bridge().db.run(this.sql, params, false));
  }

  executeForRawResultSync(params: SQLiteBindParams = []): SQLiteExecuteResult {
    return new SQLiteExecuteResult(bridge().db.run(this.sql, params, true));
  }

  finalizeSync(): void {}
}

export class SQLiteDatabase {
  prepareSync(sql: string): SQLiteStatement {
    return new SQLiteStatement(sql);
  }

  runSync(sql: string, params: SQLiteBindParams = []): SQLiteRunResult {
    const { changes, lastInsertRowId } = bridge().db.run(sql, params, false);
    return { changes, lastInsertRowId };
  }

  getAllSync<T = unknown>(sql: string, params: SQLiteBindParams = []): T[] {
    return bridge().db.run(sql, params, false).rows as T[];
  }

  execSync(sql: string): void {
    bridge().db.exec(sql);
  }

  async execAsync(sql: string): Promise<void> {
    this.execSync(sql);
  }
}

export type { SQLiteBindParams };

export async function openDatabaseAsync(name: string): Promise<SQLiteDatabase> {
  bridge().db.open(name);
  return new SQLiteDatabase();
}
