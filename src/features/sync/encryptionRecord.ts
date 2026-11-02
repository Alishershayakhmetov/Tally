import { keyFromStored, keyToStored, sameKey, type StoredKey, type SyncKey } from '@/domain/syncCrypto';

import type { SyncPolicy } from './engine';

// What this device knows about the encryption of the file in the cloud. It lives
// in the keystore next to the Dropbox token (never in the database, which is
// backed up and exported), as the derived key, not the password: the password
// is typed once, and the slow key derivation never has to run again.
//
// A change takes two steps, so an interruption can't lose it:
//   current: what the file in the cloud is sealed with, as far as this device knows
//            (null: it isn't encrypted)
//   target:  what it should be sealed with (null: not encrypted)
// They're equal in the steady state. Choosing a password, another one, or none sets
// `target`; once a sync has left the cloud file in that form, `current` catches up.

export type EncryptionRecord = {
  current: SyncKey | null;
  target: SyncKey | null;
  /** Start over: the next sync overwrites the cloud file without reading it. */
  replace: boolean;
};

export const NO_ENCRYPTION: EncryptionRecord = { current: null, target: null, replace: false };

export function policyOf(record: EncryptionRecord): SyncPolicy {
  return { read: record.current, write: record.target, replace: record.replace };
}

/** A change that a sync hasn't completed yet. */
export function isPending(record: EncryptionRecord): boolean {
  return record.replace || !sameKey(record.current, record.target);
}

/** The state after a sync left the cloud file in the target form. */
export function completed(record: EncryptionRecord): EncryptionRecord {
  return { current: record.target, target: record.target, replace: false };
}

export function encryptionState(record: EncryptionRecord): { on: boolean; pending: boolean } {
  return { on: record.target !== null, pending: isPending(record) };
}

type Stored = { v: 1; current: StoredKey | null; target: StoredKey | null; replace: boolean };

export function serializeRecord(record: EncryptionRecord): string {
  const stored: Stored = {
    v: 1,
    current: record.current && keyToStored(record.current),
    target: record.target && keyToStored(record.target),
    replace: record.replace,
  };
  return JSON.stringify(stored);
}

/**
 * A missing entry means "no encryption known here". A damaged one is reported as such,
 * and read as no encryption: a half-readable record must never turn into "encryption
 * off" by accident (a lost target would make the next sync upload a plain file), so the
 * caller stops syncing and asks for the password instead.
 */
export function parseRecord(text: string | null): { record: EncryptionRecord; damaged: boolean } {
  if (!text) return { record: NO_ENCRYPTION, damaged: false };
  try {
    const stored = JSON.parse(text) as Partial<Stored> | null;
    if (!stored || stored.v !== 1) throw new Error('unknown record');
    const current = keyFromStored(stored.current);
    const target = keyFromStored(stored.target);
    if ((stored.current && !current) || (stored.target && !target)) throw new Error('damaged key');
    return { record: { current, target, replace: stored.replace === true }, damaged: false };
  } catch {
    return { record: NO_ENCRYPTION, damaged: true };
  }
}
