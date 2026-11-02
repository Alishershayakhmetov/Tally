import { parseBackup, parseBackupValue, type Backup, type MergeSummary } from '@/domain/backup';
import {
  decryptEnvelope,
  encryptToEnvelope,
  EnvelopeError,
  readEnvelope,
  type SyncKey,
  type SyncRandom,
} from '@/domain/syncCrypto';
import { remoteIsBehind, serializeSyncFile } from '@/domain/sync';

// One sync round, with the cloud and the database passed in so tests can use
// fakes. Download → merge into this device → upload only if the file lacks
// something or isn't in the form it should have. The upload names the revision
// that was downloaded; if another device uploaded in between, it's a conflict
// and the round starts over.

export type RemoteFile = { text: string; rev: string };

export type SyncRemote = {
  /** null when there's no file yet. */
  download(): Promise<RemoteFile | null>;
  /** `rev` null creates the file. 'conflict' when the file changed (or appeared) since. */
  upload(text: string, rev: string | null): Promise<'ok' | 'conflict'>;
};

export type SyncLocal = {
  read(): Backup;
  merge(remote: Backup): MergeSummary;
};

/**
 * How the file in the cloud is protected, from this device's point of view.
 * Both keys are null when encryption is off.
 */
export type SyncPolicy = {
  /** The key the file in the cloud is expected to be sealed with now, null if it's expected to be plain. */
  read: SyncKey | null;
  /** The key to seal it with from now on, null for a plain file. It differs from `read` while encryption is being turned on, off or changed. */
  write: SyncKey | null;
  /** Start over: ignore what the cloud file holds (unreadable, or its password is lost) and overwrite it. */
  replace: boolean;
};

export const PLAIN_POLICY: SyncPolicy = { read: null, write: null, replace: false };

export type SyncOutcome = {
  /** What the file brought to this device, summed over retries. */
  pulled: MergeSummary;
  pushed: boolean;
};

export type SyncFailure =
  | 'fileInvalid'
  | 'newerFormat'
  | 'conflict'
  /** The file is encrypted and this device has no password for it. */
  | 'passwordRequired'
  /** The file is encrypted with a different password than this device's (it was changed elsewhere). */
  | 'passwordChanged'
  /** This device expects an encrypted file, but the cloud one is plain. */
  | 'cloudNotEncrypted';

/** The file can't be used as it is, or other devices kept winning the race. */
export class SyncError extends Error {
  constructor(readonly reason: SyncFailure) {
    super(`Sync failed: ${reason}`);
    this.name = 'SyncError';
  }
}

const MAX_ATTEMPTS = 3;

type Form = { kind: 'plain' } | { kind: 'encrypted'; salt: string };

function failure(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  return new SyncError(
    error instanceof EnvelopeError && error.problem === 'newer' ? 'newerFormat' : 'fileInvalid',
  );
}

/** Opens a downloaded file with whatever keys this device has. Never guesses: a file it can't read stays untouched. */
async function decode(text: string, policy: SyncPolicy): Promise<{ backup: Backup; form: Form }> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SyncError('fileInvalid');
  }
  let envelope;
  try {
    envelope = readEnvelope(raw);
  } catch (error) {
    throw failure(error);
  }

  if (!envelope) {
    // A plain file. A device that expects encryption mustn't take it for granted: anyone who can
    // write to the Dropbox could put one there. Turning encryption on or off is the exception.
    if (policy.read && policy.write) throw new SyncError('cloudNotEncrypted');
    const parsed = parseBackupValue(raw);
    if (!parsed.ok) throw new SyncError(parsed.error === 'newerFormat' ? 'newerFormat' : 'fileInvalid');
    return { backup: parsed.backup, form: { kind: 'plain' } };
  }

  // Either key may be the file's: a change that was uploaded but not yet recorded here has the new one.
  const key = [policy.read, policy.write].find((k) => k !== null && k.salt === envelope.header.salt);
  if (!key) throw new SyncError(policy.read ? 'passwordChanged' : 'passwordRequired');
  let plaintext: string;
  try {
    plaintext = await decryptEnvelope(envelope, key);
  } catch {
    // The right password for this file, but the data doesn't open: damaged or tampered with.
    throw new SyncError('fileInvalid');
  }
  const parsed = parseBackup(plaintext);
  if (!parsed.ok) throw new SyncError('fileInvalid');
  return { backup: parsed.backup, form: { kind: 'encrypted', salt: envelope.header.salt } };
}

function isTargetForm(form: Form, write: SyncKey | null): boolean {
  return write === null ? form.kind === 'plain' : form.kind === 'encrypted' && form.salt === write.salt;
}

export async function syncOnce(
  remote: SyncRemote,
  local: SyncLocal,
  policy: SyncPolicy = PLAIN_POLICY,
  random?: SyncRandom,
): Promise<SyncOutcome> {
  const pulled: MergeSummary = { tasksAdded: 0, entriesAdded: 0, updated: 0 };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const file = await remote.download();
    let theirs: Backup | null = null;
    let inTargetForm = false;
    if (file && !policy.replace) {
      const decoded = await decode(file.text, policy);
      theirs = decoded.backup;
      inTargetForm = isTargetForm(decoded.form, policy.write);
      const summary = local.merge(theirs);
      pulled.tasksAdded += summary.tasksAdded;
      pulled.entriesAdded += summary.entriesAdded;
      pulled.updated += summary.updated;
    }
    const mine = local.read();
    if (inTargetForm && !remoteIsBehind(mine, theirs)) return { pulled, pushed: false };

    let body: string;
    if (policy.write) {
      if (!random) throw new Error('A random source is needed to encrypt');
      body = await encryptToEnvelope(serializeSyncFile(mine), policy.write, random);
    } else {
      body = serializeSyncFile(mine);
    }
    if ((await remote.upload(body, file?.rev ?? null)) === 'ok') return { pulled, pushed: true };
  }
  throw new SyncError('conflict');
}
