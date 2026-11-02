// The Windows app (desktop/) runs this app's web build in an Electron window.
// Its preload script puts `tallyDesktop` on the window: the few things a web
// page can't do itself. Everywhere else (phones, a plain browser) it's absent.

export type DbRunResult = {
  changes: number;
  lastInsertRowId: number;
  /** Row objects, or arrays of values when `raw` was asked for. Empty for statements that return nothing. */
  rows: unknown[];
};

export type HttpRequest = { url: string; method?: string; headers?: Record<string, string>; body?: string };
export type HttpResponse = { status: number; headers: [string, string][]; body: string };

export type DesktopBridge = {
  platform: 'win32' | 'darwin' | 'linux';
  /** SQLite in the main process (better-sqlite3). Synchronous, so the app's synchronous queries keep working. */
  db: {
    open(name: string): void;
    exec(sql: string): void;
    run(sql: string, params: unknown, raw: boolean): DbRunResult;
  };
  /** Small secrets (the Dropbox token), encrypted by the OS through Electron's safeStorage. */
  secrets: {
    get(key: string): string | null;
    set(key: string, value: string): void;
    delete(key: string): void;
  };
  /** Requests to Dropbox, made by the main process (no CORS), and only to Dropbox's hosts. */
  http(request: HttpRequest): Promise<HttpResponse>;
  /** The system's Save As window: resolves with the saved path, or null when the user cancelled. */
  files: {
    save(fileName: string, text: string): Promise<string | null>;
  };
  /** Opens the system browser on `url` and resolves with the redirect back to a local address, or null if cancelled. */
  signIn: {
    redirectUri: string;
    start(url: string): Promise<string | null>;
    cancel(): void;
  };
};

declare global {
  var tallyDesktop: DesktopBridge | undefined;
}

/** The bridge, or null outside the Windows app. */
export function getDesktop(): DesktopBridge | null {
  return globalThis.tallyDesktop ?? null;
}

export const isDesktop = (): boolean => getDesktop() !== null;
