import { planMerge, type Backup, type LocalVersions } from './backup';
import { DEFAULT_SETTINGS } from './settings';

// Sync through one file in the user's Dropbox (SPEC Phase 9). The file is a
// backup (domain/backup.ts), so both sides merge with the backup's rule: rows
// match by id, the newer updated_at wins, tombstones carry deletions. A device
// downloads the file, merges it in, and uploads its own data only when the file
// lacks something, against the revision it downloaded.

/** In the app's own folder (Apps/<app name>/), the only place the app can see. */
export const SYNC_FILE_PATH = '/tally-sync.json';

/** Compact JSON: the whole history goes up and down on every change. */
export function serializeSyncFile(backup: Backup): string {
  return JSON.stringify(backup);
}

export function backupVersions(backup: Backup): LocalVersions {
  return {
    tasks: new Map(backup.tasks.map((t) => [t.id, t.updatedAt])),
    entries: new Map(backup.entries.map((e) => [e.id, e.updatedAt])),
    settings: new Map(backup.settings.map((s) => [s.key, s.updatedAt])),
  };
}

const SYNCED_SETTINGS = new Set(Object.keys(DEFAULT_SETTINGS));

/**
 * Whether the file is missing rows this device has, or holds older versions of
 * them. Settings the file format doesn't know are left out, the way reading a
 * file drops them, or the device would upload on every sync.
 */
export function remoteIsBehind(local: Backup, remote: Backup | null): boolean {
  if (!remote) return true;
  const plan = planMerge(
    { ...local, settings: local.settings.filter((s) => SYNCED_SETTINGS.has(s.key)) },
    backupVersions(remote),
  );
  return plan.tasks.length + plan.entries.length + plan.settings.length > 0;
}
