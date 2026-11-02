'use strict';

// Runs before the page, with access to Electron, and hands the page a small,
// fixed set of functions as `window.tallyDesktop` (see src/desktop/bridge.ts
// in the app). Nothing else of Electron or Node reaches the page.

const { contextBridge, ipcRenderer } = require('electron');

/** Synchronous call into the main process; rethrows its errors here. */
function call(channel, ...args) {
  const answer = ipcRenderer.sendSync(channel, ...args);
  if (answer.error !== undefined) {
    const error = new Error(answer.error);
    if (answer.code) error.code = answer.code;
    throw error;
  }
  return answer.value;
}

// Must match REDIRECT_URI in src/signIn.js.
const REDIRECT_URI = 'http://localhost:53682/dropbox-auth';

contextBridge.exposeInMainWorld('tallyDesktop', {
  platform: process.platform,
  db: {
    open: (name) => void call('db:open', String(name)),
    exec: (sql) => void call('db:exec', String(sql)),
    run: (sql, params, raw) => call('db:run', String(sql), params ?? [], Boolean(raw)),
  },
  secrets: {
    get: (key) => call('secrets:get', String(key)),
    set: (key, value) => void call('secrets:set', String(key), String(value)),
    delete: (key) => void call('secrets:delete', String(key)),
  },
  files: {
    save: (fileName, text) => ipcRenderer.invoke('files:save', String(fileName), String(text)),
  },
  http: (request) => ipcRenderer.invoke('http:request', request),
  signIn: {
    redirectUri: REDIRECT_URI,
    start: (url) => ipcRenderer.invoke('signin:start', String(url)),
    cancel: () => void call('signin:cancel'),
  },
});
