'use strict';

// SQLite for the app, in the main process (better-sqlite3). The window calls it
// through synchronous IPC, so the app's synchronous queries keep working. Rows
// come back whole; nothing but cached prepared statements is kept between calls.

const path = require('node:path');
const Database = require('better-sqlite3');

const MAX_CACHED_STATEMENTS = 300;

/** @type {import('better-sqlite3').Database | null} */
let db = null;
/** @type {Map<string, import('better-sqlite3').Statement>} */
const statements = new Map();

function open(directory, name) {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`Bad database name: ${name}`);
  if (db) return;
  db = new Database(path.join(directory, name));
  db.pragma('journal_mode = WAL');
}

function close() {
  statements.clear();
  db?.close();
  db = null;
}

function handle() {
  if (!db) throw new Error('The database is not open');
  return db;
}

function exec(sql) {
  handle().exec(sql);
}

/**
 * better-sqlite3 binds a JS number that isn't an int32 as a REAL. A column with
 * INTEGER affinity turns that back into an integer, but arithmetic on the bound
 * value itself (`? / 1000`) would change meaning, so whole numbers go in as BigInt.
 */
function bindValue(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'boolean') return value ? 1n : 0n;
  if (value === undefined) return null;
  return value;
}

/** Positional values stay an array; named ones lose the ":" / "@" / "$" prefix expo-sqlite wants. */
function bindParams(params) {
  if (Array.isArray(params)) return params.map(bindValue);
  const named = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    named[/^[:@$]/.test(key) ? key.slice(1) : key] = bindValue(value);
  }
  return named;
}

function prepare(sql) {
  let statement = statements.get(sql);
  if (!statement) {
    if (statements.size >= MAX_CACHED_STATEMENTS) statements.clear();
    statement = handle().prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
}

/** Runs one statement. `raw` returns rows as arrays of values, otherwise as objects. */
function run(sql, params, raw) {
  const statement = prepare(sql);
  const bound = bindParams(params);
  if (statement.reader) {
    return { changes: 0, lastInsertRowId: 0, rows: statement.raw(Boolean(raw)).all(bound) };
  }
  const info = statement.run(bound);
  return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid), rows: [] };
}

module.exports = { open, close, exec, run, bindParams };
