import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import migrations from '../../drizzle/migrations';
import * as schema from './schema';

/** `$client` is the raw expo-sqlite handle, used for statements with named parameters. */
export type Db = ExpoSQLiteDatabase<typeof schema> & { $client: SQLiteDatabase };

const DATABASE_NAME = 'task-counter.db';

let instance: Db | null = null;
let opening: Promise<Db> | null = null;

// Opened asynchronously once at startup, then queried synchronously. On web
// (expo-sqlite alpha) a synchronous open times out while the wasm worker is
// still loading; on native the async open costs nothing extra.
export function openDatabase(): Promise<Db> {
  opening ??= (async () => {
    const sqlite = await openDatabaseAsync(DATABASE_NAME);
    if (Platform.OS !== 'web') await sqlite.execAsync('PRAGMA journal_mode = WAL;');
    await sqlite.execAsync('PRAGMA foreign_keys = ON;');
    const db = drizzle(sqlite, { schema });
    await migrate(db, migrations);
    instance = db;
    return db;
  })().catch((error: unknown) => {
    opening = null;
    throw error;
  });
  return opening;
}

export function getDb(): Db {
  if (!instance) throw new Error('getDb() called before openDatabase() finished');
  return instance;
}
