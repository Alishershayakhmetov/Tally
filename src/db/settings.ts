import { isValidDayStart, parseSettings, type Settings } from '@/domain/settings';
import { now } from '@/lib/clock';

import { getDb } from './client';
import { notifyDataChanged, useLive } from './live';
import { settings as settingsTable } from './schema';
import { REGROUP_DEFAULT_CUTOFF_TASKS_SQL } from './sql';

let cache: Settings | null = null;

export function getSettings(): Settings {
  cache ??= parseSettings(
    new Map(
      getDb()
        .select()
        .from(settingsTable)
        .all()
        .map((row) => [row.key, row.value]),
    ),
  );
  return cache;
}

/** Drops the cache after settings rows were written outside updateSetting (a backup import). */
export function reloadSettings(): void {
  cache = null;
}

export function useSettings(): Settings {
  return useLive(getSettings);
}

export function getGlobalDayStartMin(): number {
  return getSettings().dayStartMin;
}

/** Changing the global cutoff re-groups every task that follows it (SPEC §3.5). */
export function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  if (key === 'dayStartMin' && !isValidDayStart(value as number)) {
    throw new RangeError(`invalid day start ${String(value)}`);
  }
  const db = getDb();
  const updatedAt = now();
  db.transaction((tx) => {
    tx.insert(settingsTable)
      .values({ key, value: String(value), updatedAt })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: String(value), updatedAt } })
      .run();
    if (key === 'dayStartMin') {
      db.$client.runSync(REGROUP_DEFAULT_CUTOFF_TASKS_SQL, { ':day_start_min': value as number });
    }
  });
  cache = null;
  notifyDataChanged();
}
