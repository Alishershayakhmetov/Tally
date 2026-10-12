import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useSyncExternalStore } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { importBackup, readBackup } from '@/db/backup';
import { subscribeDataChanges } from '@/db/live';
import type { MergeSummary } from '@/domain/backup';
import { SYNC_FILE_PATH } from '@/domain/sync';
import { now } from '@/lib/clock';

import {
  authorizeUrl,
  downloadFile,
  DROPBOX_REDIRECT_URI,
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
import { SyncError, syncOnce, type SyncLocal, type SyncRemote } from './engine';
import { challengeFor, createState, createVerifier } from './pkce';

// The Dropbox connection and automatic sync (SPEC Phase 9). The refresh token
// lives in the OS keystore (expo-secure-store); the short-lived access token
// only in memory. Sync runs on launch, when the app returns to the foreground,
// a few seconds after local changes, and when the app goes to the background
// with changes not yet uploaded.

export const syncSupported = Platform.OS !== 'web';

export type SyncProblem =
  | 'network'
  | 'revoked'
  | 'scope'
  | 'rateLimit'
  | 'server'
  | 'fileInvalid'
  | 'newerFormat'
  | 'conflict'
  | 'signInFailed'
  | 'failed';

export type SyncState = {
  status: 'loading' | 'disconnected' | 'connected';
  account: DropboxAccount | null;
  busy: 'connecting' | 'syncing' | null;
  /** Real-clock epoch ms of the last successful sync. */
  lastSyncAt: number | null;
  lastPulled: MergeSummary | null;
  problem: SyncProblem | null;
};

type Connection = { refreshToken: string; account: DropboxAccount | null };

const CONNECTION_KEY = 'dropbox.connection';
const LAST_SYNC_KEY = 'dropbox.lastSyncAt';
/** Quiet time after the last local change before uploading it. */
const CHANGE_DEBOUNCE_MS = 5_000;
/** Coming back to the app syncs, unless a sync finished this recently. */
const FOREGROUND_GAP_MS = 30_000;
/** An access token this close to expiry is refreshed first. */
const EXPIRY_MARGIN_MS = 5 * 60_000;
/** On Android the browser's "closed" signal can arrive just before the redirect. */
const REDIRECT_GRACE_MS = 1_500;

// ---------------------------------------------------------------------------
// State for the Settings screen

let state: SyncState = {
  status: 'loading',
  account: null,
  busy: null,
  lastSyncAt: null,
  lastPulled: null,
  problem: null,
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
    const saved = await SecureStore.getItemAsync(CONNECTION_KEY);
    connection = saved ? (JSON.parse(saved) as Connection) : null;
    const lastSync = Number(await SecureStore.getItemAsync(LAST_SYNC_KEY));
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
  await SecureStore.setItemAsync(CONNECTION_KEY, JSON.stringify(next));
  connection = next;
}

async function forgetConnection(): Promise<void> {
  connection = null;
  access = null;
  await Promise.all([
    SecureStore.deleteItemAsync(CONNECTION_KEY).catch(() => {}),
    SecureStore.deleteItemAsync(LAST_SYNC_KEY).catch(() => {}),
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

/** Listens for the redirect too, in case the browser reports "closed" first. */
function watchRedirect(): { take: () => Promise<string | null>; stop: () => void } {
  let url: string | null = null;
  let arrived: (() => void) | null = null;
  const subscription = Linking.addEventListener('url', (event) => {
    if (!event.url.startsWith(DROPBOX_REDIRECT_URI)) return;
    url = event.url;
    arrived?.();
  });
  return {
    take: async () => {
      if (!url) {
        await new Promise<void>((resolve) => {
          arrived = resolve;
          setTimeout(resolve, REDIRECT_GRACE_MS);
        });
      }
      return url;
    },
    stop: () => subscription.remove(),
  };
}

export type ConnectResult = 'connected' | 'cancelled' | 'failed';

export async function connectDropbox(): Promise<ConnectResult> {
  if (state.busy) return 'cancelled';
  update({ busy: 'connecting', problem: null });
  const redirect = watchRedirect();
  try {
    const verifier = createVerifier();
    const expectedState = createState();
    const challenge = await challengeFor(verifier);
    const result = await WebBrowser.openAuthSessionAsync(
      authorizeUrl(challenge, expectedState),
      DROPBOX_REDIRECT_URI,
    );
    const url = result.type === 'success' ? result.url : await redirect.take();
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
    redirect.stop();
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
  update({ busy: 'syncing' });
  dirty = false;
  try {
    const outcome = await syncOnce(remote, local);
    if (connection !== syncing) return;
    const at = Date.now();
    await SecureStore.setItemAsync(LAST_SYNC_KEY, String(at)).catch(() => {});
    update({ lastSyncAt: at, lastPulled: outcome.pulled, problem: null });
  } catch (error) {
    console.warn('Dropbox sync failed', error);
    if (connection !== syncing) return;
    const problem = problemOf(error);
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

/** Runs a sync now, or right after the one in progress. */
export function requestSync(): void {
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

/** Call once the database is open. Returns a cleanup function. */
export function startSync(): () => void {
  if (!syncSupported) return () => {};
  let changeTimer: ReturnType<typeof setTimeout> | null = null;
  void loadConnection().then(requestSync);

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
