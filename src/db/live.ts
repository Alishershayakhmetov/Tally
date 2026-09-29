import { useMemo, useSyncExternalStore } from 'react';

// Every write goes through a repository, and every repository write calls
// notifyDataChanged(). Screens read through useLive(), which re-runs its
// query after each change. Reads are synchronous SQLite calls, so this is
// cheap for a personal-sized database.

let version = 0;
const listeners = new Set<() => void>();

export function notifyDataChanged(): void {
  version++;
  listeners.forEach((listener) => listener());
}

export function subscribeDataChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion(): number {
  return version;
}

/** `read` receives the data version so memoization is keyed on it explicitly. */
export function useLive<T>(read: (dataVersion: number) => T): T {
  const dataVersion = useSyncExternalStore(subscribeDataChanges, getVersion, getVersion);
  return useMemo(() => read(dataVersion), [read, dataVersion]);
}
