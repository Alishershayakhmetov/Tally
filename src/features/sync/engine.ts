import { parseBackup, type Backup, type MergeSummary } from '@/domain/backup';
import { remoteIsBehind, serializeSyncFile } from '@/domain/sync';

// One sync round, with the cloud and the database passed in so tests can use
// fakes. Download → merge into this device → upload only if the file lacks
// something. The upload names the revision that was downloaded; if another
// device uploaded in between, it's a conflict and the round starts over.

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

export type SyncOutcome = {
  /** What the file brought to this device, summed over retries. */
  pulled: MergeSummary;
  pushed: boolean;
};

export type SyncFailure = 'fileInvalid' | 'newerFormat' | 'conflict';

/** The file can't be used, or other devices kept winning the race. */
export class SyncError extends Error {
  constructor(readonly reason: SyncFailure) {
    super(`Sync failed: ${reason}`);
    this.name = 'SyncError';
  }
}

const MAX_ATTEMPTS = 3;

export async function syncOnce(remote: SyncRemote, local: SyncLocal): Promise<SyncOutcome> {
  const pulled: MergeSummary = { tasksAdded: 0, entriesAdded: 0, updated: 0 };
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const file = await remote.download();
    let theirs: Backup | null = null;
    if (file) {
      const parsed = parseBackup(file.text);
      // A broken or newer file is never overwritten: it may hold another device's only copy.
      if (!parsed.ok) throw new SyncError(parsed.error === 'newerFormat' ? 'newerFormat' : 'fileInvalid');
      theirs = parsed.backup;
      const summary = local.merge(theirs);
      pulled.tasksAdded += summary.tasksAdded;
      pulled.entriesAdded += summary.entriesAdded;
      pulled.updated += summary.updated;
    }
    const mine = local.read();
    if (!remoteIsBehind(mine, theirs)) return { pulled, pushed: false };
    if ((await remote.upload(serializeSyncFile(mine), file?.rev ?? null)) === 'ok') {
      return { pulled, pushed: true };
    }
  }
  throw new SyncError('conflict');
}
