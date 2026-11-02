import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { importBackup, readBackup } from '@/db/backup';
import { subscribeDataChanges } from '@/db/live';
import type { MergeSummary } from '@/domain/backup';
import { SYNC_FILE_PATH } from '@/domain/sync';
import {
  createKey,
  decryptEnvelope,
  DEFAULT_KDF,
  keyForHeader,
  readEnvelope,
  type EnvelopeHeader,
} from '@/domain/syncCrypto';
import { now } from '@/lib/clock';

import {
  authorizeUrl,
  downloadFile,
  DropboxError,
  exchangeCode,
  getAccount,
  parseAuthRedirect,
  refreshAccess,
  revokeToken,
  uploadFile,
  type AccessToken,
  type DropboxAccount,
} from './dropbox';
import {
  completed,
  encryptionState,
  isPending,
  NO_ENCRYPTION,
  parseRecord,
  policyOf,
  serializeRecord,
  type EncryptionRecord,
} from './encryptionRecord';
import { SyncError, syncOnce, type SyncLocal, type SyncRemote } from './engine';
import { challengeFor, createState, createVerifier } from './pkce';
import { cancelSignIn, secrets, signIn, syncSupported } from './platform';

// The Dropbox connection and automatic sync (SPEC Phase 9). The refresh token
// lives in the OS keystore (expo-secure-store on a phone, Windows' DPAPI in the
// Windows app, see platform.ts); the short-lived access token
// only in memory. Sync runs on launch, when the app returns to the foreground,
// a few seconds after local changes, and when the app goes to the background
// with changes not yet uploaded.
//
// With a sync password (SPEC Phase 11) the file in Dropbox is encrypted. What
// this device knows about that is the EncryptionRecord (encryptionRecord.ts),
// also in the keystore. When the file and the record disagree in a way that needs
// a person to decide (a password to enter, a file that lost its encryption), automatic
// syncs wait, and Settings says what to do.

export { cancelSignIn, syncSupported };

export type SyncProblem =
  | 'network'
  | 'revoked'
  | 'scope'
  | 'rateLimit'
  | 'server'
  | 'fileInvalid'
  | 'newerFormat'
  | 'conflict'
  | 'passwordRequired'
  | 'passwordChanged'
  | 'cloudNotEncrypted'
  | 'signInFailed'
  | 'failed';

/** Problems that only a decision about the encryption can fix. */
export const ENCRYPTION_PROBLEMS: readonly SyncProblem[] = [
  'passwordRequired',
  'passwordChanged',
  'cloudNotEncrypted',
];

export type SyncState = {
  status: 'loading' | 'disconnected' | 'connected';
  account: DropboxAccount | null;
  busy: 'connecting' | 'syncing' | null;
  /** Real-clock epoch ms of the last successful sync. */
  lastSyncAt: number | null;
  lastPulled: MergeSummary | null;
  problem: SyncProblem | null;
  /** `on`: the cloud file is (to be) encrypted; `pending`: a change that the next sync will make. */
  encryption: { on: boolean; pending: boolean };
};

type Connection = { refreshToken: string; account: DropboxAccount | null };

const CONNECTION_KEY = 'dropbox.connection';
const LAST_SYNC_KEY = 'dropbox.lastSyncAt';
const ENCRYPTION_KEY = 'dropbox.encryption';
/** Quiet time after the last local change before uploading it. */
const CHANGE_DEBOUNCE_MS = 5_000;
/** Coming back to the app syncs, unless a sync finished this recently. */
const FOREGROUND_GAP_MS = 30_000;
/** An access token this close to expiry is refreshed first. */
const EXPIRY_MARGIN_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// State for the Settings screen

let state: SyncState = {
  status: 'loading',
  account: null,
  busy: null,
  lastSyncAt: null,
  lastPulled: null,
  problem: null,
  encryption: { on: false, pending: false },
};
const listeners = new Set<() => void>();

function update(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getState = () => state;

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, getState, getState);
}

// ---------------------------------------------------------------------------
// Connection and tokens

let connection: Connection | null = null;
let access: AccessToken | null = null;

async function loadConnection(): Promise<void> {
  try {
    const saved = await secrets.get(CONNECTION_KEY);
    connection = saved ? (JSON.parse(saved) as Connection) : null;
    const lastSync = Number(await secrets.get(LAST_SYNC_KEY));
    update({
      status: connection ? 'connected' : 'disconnected',
      account: connection?.account ?? null,
      lastSyncAt: connection && lastSync > 0 ? lastSync : null,
    });
  } catch (error) {
    console.warn('Reading the Dropbox connection failed', error);
    connection = null;
    update({ status: 'disconnected' });
  }
}

async function saveConnection(next: Connection): Promise<void> {
  await secrets.set(CONNECTION_KEY, JSON.stringify(next));
  connection = next;
}

async function forgetConnection(): Promise<void> {
  connection = null;
  access = null;
  await Promise.all([
    secrets.delete(CONNECTION_KEY).catch(() => {}),
    secrets.delete(LAST_SYNC_KEY).catch(() => {}),
  ]);
}

async function accessToken(): Promise<string> {
  if (access && access.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return access.token;
  if (!connection) throw new DropboxError('revoked', 'not connected');
  access = await refreshAccess(connection.refreshToken);
  return access.token;
}

/** A token Dropbox refuses before its expiry gets one fresh retry. */
async function withAccess<T>(call: (token: string) => Promise<T>): Promise<T> {
  const token = await accessToken();
  try {
    return await call(token);
  } catch (error) {
    if (!(error instanceof DropboxError) || (error.kind !== 'expired' && error.kind !== 'revoked'))
      throw error;
    access = null;
    return call(await accessToken());
  }
}

function problemOf(error: unknown): SyncProblem {
  if (error instanceof SyncError) return error.reason;
  if (error instanceof DropboxError) return error.kind === 'expired' ? 'revoked' : error.kind;
  return 'failed';
}

// ---------------------------------------------------------------------------
// Sign-in

export type ConnectResult = 'connected' | 'cancelled' | 'failed';

export async function connectDropbox(): Promise<ConnectResult> {
  if (state.busy) return 'cancelled';
  update({ busy: 'connecting', problem: null });
  try {
    const verifier = createVerifier();
    const expectedState = createState();
    const challenge = await challengeFor(verifier);
    const url = await signIn(authorizeUrl(challenge, expectedState));
    if (!url) return 'cancelled';
    const parsed = parseAuthRedirect(url, expectedState);
    if (!parsed.ok) {
      if (parsed.reason === 'denied') return 'cancelled';
      update({ problem: 'signInFailed' });
      return 'failed';
    }
    const tokens = await exchangeCode(parsed.code, verifier);
    access = tokens.access;
    const account = await getAccount(tokens.access.token).catch((error: unknown) => {
      console.warn('Reading the Dropbox account failed', error);
      return null;
    });
    await saveConnection({ refreshToken: tokens.refreshToken, account });
    update({ status: 'connected', account, lastSyncAt: null, lastPulled: null });
  } catch (error) {
    console.warn('Connecting Dropbox failed', error);
    update({ problem: error instanceof DropboxError ? problemOf(error) : 'signInFailed' });
    return 'failed';
  } finally {
    update({ busy: null });
  }
  requestSync();
  return 'connected';
}

/** Data on the phone and the file in Dropbox both stay; this phone just stops syncing. */
export async function disconnectDropbox(): Promise<void> {
  const previous = connection;
  const token = access && access.expiresAt > Date.now() ? access.token : null;
  await forgetConnection();
  // The key is of no use without the connection: connecting again asks for the password.
  await saveEncryption(NO_ENCRYPTION).catch((error: unknown) =>
    console.warn('Forgetting the key failed', error),
  );
  blocked = false;
  update({ status: 'disconnected', account: null, lastSyncAt: null, lastPulled: null, problem: null });
  if (!previous) return;
  try {
    await revokeToken(token ?? (await refreshAccess(previous.refreshToken)).token);
  } catch (error) {
    // Already signed out on Dropbox's side, or offline: the token is forgotten here either way.
    console.warn('Revoking the Dropbox token failed', error);
  }
}

// ---------------------------------------------------------------------------
// Encryption

const random = (byteCount: number) => Crypto.getRandomBytes(byteCount);

let record: EncryptionRecord = NO_ENCRYPTION;
/** Automatic syncs wait while this is true: the person has to decide something first. */
let blocked = false;

async function loadEncryption(): Promise<void> {
  try {
    const { record: loaded, damaged } = parseRecord(await secrets.get(ENCRYPTION_KEY));
    record = loaded;
    if (damaged) {
      blocked = true;
      update({ problem: 'passwordRequired' });
    }
  } catch (error) {
    console.warn('Reading the encryption state failed', error);
  }
  update({ encryption: encryptionState(record) });
}

/** Written to the keystore first: a change that can't be kept must not look as if it was made. */
async function saveEncryption(next: EncryptionRecord): Promise<void> {
  if (next.current === null && next.target === null && !next.replace) await secrets.delete(ENCRYPTION_KEY);
  else await secrets.set(ENCRYPTION_KEY, serializeRecord(next));
  record = next;
  update({ encryption: encryptionState(record) });
}

export type KeyProgress = (fraction: number) => void;

export type CloudForm = 'none' | 'plain' | 'encrypted' | 'unknown' | 'offline';

/** What's in Dropbox now, to tell the person what turning encryption on will do. Changes nothing. */
export async function inspectCloud(): Promise<{ form: CloudForm; header: EnvelopeHeader | null }> {
  try {
    const file = await remote.download();
    if (!file) return { form: 'none', header: null };
    const envelope = readEnvelope(JSON.parse(file.text));
    if (envelope) return { form: 'encrypted', header: envelope.header };
    return { form: 'plain', header: null };
  } catch (error) {
    if (error instanceof DropboxError) return { form: 'offline', header: null };
    return { form: 'unknown', header: null };
  }
}

/**
 * Sets the sync password. An empty one turns encryption off. Takes a few seconds on a
 * phone (the key derivation), reporting progress; then the next sync seals, re-seals or
 * unseals the file in Dropbox.
 */
export async function setSyncPassword(password: string, onProgress?: KeyProgress): Promise<void> {
  if (password === '') {
    if (record.target === null && record.current === null) return;
    // Never uploaded as encrypted: simply drop the plan. Otherwise the file is written plain next.
    await saveEncryption({ current: record.current, target: null, replace: false });
  } else {
    const key = await createKey(password, random, DEFAULT_KDF, onProgress);
    await saveEncryption({ current: record.current, target: key, replace: false });
  }
  syncNow();
}

export type UnlockResult = 'ok' | 'wrong' | 'notEncrypted' | 'offline' | 'failed';

/** For an encrypted file this device has no (or an out-of-date) password for: checks the password against it. */
export async function unlockSyncPassword(password: string, onProgress?: KeyProgress): Promise<UnlockResult> {
  let file;
  try {
    file = await remote.download();
  } catch (error) {
    return error instanceof DropboxError ? 'offline' : 'failed';
  }
  if (!file) return 'notEncrypted';
  let envelope;
  try {
    envelope = readEnvelope(JSON.parse(file.text));
  } catch {
    return 'failed';
  }
  if (!envelope) return 'notEncrypted';
  const key = await keyForHeader(password, envelope.header, onProgress);
  try {
    await decryptEnvelope(envelope, key);
  } catch {
    return 'wrong';
  }
  await saveEncryption({ current: key, target: key, replace: false });
  syncNow();
  return 'ok';
}

/** Start over: the file in Dropbox is overwritten with this device's data, under a new password or none. */
export async function replaceCloudData(password: string, onProgress?: KeyProgress): Promise<void> {
  const target = password === '' ? null : await createKey(password, random, DEFAULT_KDF, onProgress);
  await saveEncryption({ current: null, target, replace: true });
  syncNow();
}

/** The cloud file lost its encryption (turned off on another device): follow it. */
export async function stopEncryptingHere(): Promise<void> {
  await saveEncryption(NO_ENCRYPTION);
  syncNow();
}

/** The cloud file lost its encryption: seal it again with this device's password. */
export async function encryptCloudAgain(): Promise<void> {
  const key = record.target ?? record.current;
  if (!key) return;
  await saveEncryption({ current: null, target: key, replace: false });
  syncNow();
}

// ---------------------------------------------------------------------------
// Sync

/** True while a sync merges the file in, so its own data change doesn't schedule another sync. */
let applyingRemote = false;
/** Local changes since the last sync started. */
let dirty = false;
let running: Promise<void> | null = null;
let again = false;

const remote: SyncRemote = {
  download: () => withAccess((token) => downloadFile(token, SYNC_FILE_PATH)),
  upload: (text, rev) => withAccess((token) => uploadFile(token, SYNC_FILE_PATH, text, rev)),
};

const local: SyncLocal = {
  read: () => readBackup(new Date(now())),
  merge: (backup) => {
    applyingRemote = true;
    try {
      return importBackup(backup);
    } finally {
      applyingRemote = false;
    }
  },
};

async function runSync(): Promise<void> {
  const syncing = connection;
  const snapshot = record;
  update({ busy: 'syncing' });
  dirty = false;
  try {
    const outcome = await syncOnce(remote, local, policyOf(snapshot), random);
    if (connection !== syncing) return;
    const at = Date.now();
    await secrets.set(LAST_SYNC_KEY, String(at)).catch(() => {});
    blocked = false;
    // The file in the cloud now has the form this device asked for: a change in progress is done.
    // (If the user changed it again meanwhile, that change is for the next sync.)
    if (isPending(snapshot) && record === snapshot) {
      await saveEncryption(completed(snapshot)).catch((error: unknown) =>
        console.warn('Recording the encryption state failed', error),
      );
    }
    update({ lastSyncAt: at, lastPulled: outcome.pulled, problem: null });
  } catch (error) {
    console.warn('Dropbox sync failed', error);
    if (connection !== syncing) return;
    const problem = problemOf(error);
    if (ENCRYPTION_PROBLEMS.includes(problem)) blocked = true;
    if (problem === 'revoked') {
      // The app was removed from the Dropbox account: connecting again is the only way back.
      await forgetConnection();
      update({ status: 'disconnected', account: null, lastSyncAt: null, lastPulled: null });
    }
    // Whatever changed here may not be in the file yet.
    dirty = true;
    update({ problem });
  } finally {
    update({ busy: null });
  }
}

function startSyncRun(): void {
  if (!connection) return;
  if (running) {
    again = true;
    return;
  }
  running = runSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      requestSync();
    }
  });
}

/** An automatic sync: runs now, or right after the one in progress, unless a decision about the encryption is awaited. */
export function requestSync(): void {
  if (!blocked) startSyncRun();
}

/** The user asked: tries again even if the last attempt needed a decision. */
export function syncNow(): void {
  blocked = false;
  startSyncRun();
}

/** Call once the database is open. Returns a cleanup function. */
export function startSync(): () => void {
  if (!syncSupported) return () => {};
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  void Promise.all([loadConnection(), loadEncryption()]).then(requestSync);

  const unsubscribe = subscribeDataChanges(() => {
    if (applyingRemote || !connection) return;
    dirty = true;
    if (changeTimer) clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      changeTimer = null;
      requestSync();
    }, CHANGE_DEBOUNCE_MS);
  });

  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') {
      if (Date.now() - (state.lastSyncAt ?? 0) > FOREGROUND_GAP_MS) requestSync();
    } else if (next === 'background' && dirty) {
      // Upload before the OS suspends the app, rather than waiting for the next launch.
      if (changeTimer) clearTimeout(changeTimer);
      changeTimer = null;
      requestSync();
    }
  });

  return () => {
    unsubscribe();
    appState.remove();
    if (changeTimer) clearTimeout(changeTimer);
  };
}
