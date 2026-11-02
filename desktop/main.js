'use strict';

// Tally for Windows. The Expo web build (web/, made by scripts/build-web.mjs)
// runs in a window and is served from app://tally/. What a web page can't do
// is done here: SQLite (better-sqlite3), encrypted secrets, requests to
// Dropbox, and the Dropbox sign-in through the system browser.

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell } = require('electron');

const database = require('./src/database');
const dropboxHttp = require('./src/dropboxHttp');
const secrets = require('./src/secrets');
const signIn = require('./src/signIn');

const ORIGIN = 'app://tally';
const WEB_ROOT = path.join(__dirname, 'web');

// Always %APPDATA%\Tally, whether run from source or installed. (By default
// Electron names the folder after package.json, and that changes with how it's run.)
// Automated tests use a throwaway folder and a debugging port instead.
app.setPath('userData', process.env.TALLY_USER_DATA ?? path.join(app.getPath('appData'), 'Tally'));
if (process.env.TALLY_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.TALLY_DEBUG_PORT);
  // A window covered by others, or on a locked screen, would stop painting and screenshots would hang.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Everything the page loads comes from the app itself. The inline styles are
// react-native-web's; Dropbox is reached through the main process, so the page
// needs no network access of its own.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

async function serveWeb(request) {
  const url = new URL(request.url);
  let relative = decodeURIComponent(url.pathname);
  if (relative.endsWith('/')) relative += 'index.html';
  let file = path.normalize(path.join(WEB_ROOT, relative));
  if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + path.sep)) {
    return new Response('Forbidden', { status: 403 });
  }
  let data;
  try {
    data = await fs.promises.readFile(file);
  } catch {
    // A route such as /task/abc is the single-page app's, not a file.
    if (path.extname(file)) return new Response('Not found', { status: 404 });
    file = path.join(WEB_ROOT, 'index.html');
    data = await fs.promises.readFile(file);
  }
  return new Response(data, {
    headers: {
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Security-Policy': CSP,
    },
  });
}

/** Only the app's own page may call the bridge. */
function trusted(event) {
  return event.senderFrame?.url.startsWith(`${ORIGIN}/`) ?? false;
}

/** A synchronous IPC handler: always answers { value } or { error }, so the page never hangs. */
function handleSync(channel, work) {
  ipcMain.on(channel, (event, ...args) => {
    if (!trusted(event)) {
      event.returnValue = { error: 'Untrusted sender' };
      return;
    }
    try {
      event.returnValue = { value: work(...args) ?? null };
    } catch (error) {
      event.returnValue = {
        error: error instanceof Error ? error.message : String(error),
        code: error?.code,
      };
    }
  });
}

/** The sign-in page opens in the user's own browser. Tests log the address instead. */
function openInBrowser(url) {
  const log = process.env.TALLY_TEST_BROWSER_LOG;
  if (log) {
    fs.appendFileSync(
      log,
      `${url}
`,
    );
    return Promise.resolve();
  }
  return shell.openExternal(url);
}

function registerIpc(getWindow) {
  handleSync('db:open', (name) => database.open(app.getPath('userData'), name));
  handleSync('db:exec', (sql) => database.exec(sql));
  handleSync('db:run', (sql, params, raw) => database.run(sql, params, raw));
  handleSync('secrets:get', (key) => secrets.get(key));
  handleSync('secrets:set', (key, value) => secrets.set(key, value));
  handleSync('secrets:delete', (key) => secrets.remove(key));
  handleSync('signin:cancel', () => signIn.cancel());

  ipcMain.handle('files:save', async (event, fileName, text) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    const name = path.basename(String(fileName));
    // Tests name a folder instead of answering the window.
    let target = process.env.TALLY_TEST_SAVE_DIR && path.join(process.env.TALLY_TEST_SAVE_DIR, name);
    if (!target) {
      const window = getWindow();
      const options = {
        defaultPath: path.join(app.getPath('documents'), name),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      };
      const { canceled, filePath } = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (canceled || !filePath) return null;
      target = filePath;
    }
    await fs.promises.writeFile(target, text, 'utf8');
    return target;
  });

  ipcMain.handle('http:request', (event, request) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    return dropboxHttp.request(request);
  });

  ipcMain.handle('signin:start', (event, url) => {
    if (!trusted(event)) throw new Error('Untrusted sender');
    return signIn.start(url, {
      open: openInBrowser,
      onDone: () => {
        // Bring Tally back in front of the browser.
        const window = getWindow();
        if (!window) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      },
    });
  });
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 900,
    minWidth: 380,
    minHeight: 560,
    title: 'Tally',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#F5F6F8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const { webContents } = mainWindow;
  const openExternally = (url) => {
    if (/^https:\/\//.test(url)) void shell.openExternal(url);
  };
  webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`${ORIGIN}/`)) return;
    event.preventDefault();
    openExternally(url);
  });
  if (!app.isPackaged) {
    webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        (input.key === 'F12' || (input.control && input.shift && input.key === 'I'))
      ) {
        webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }
  // The classic Windows scrollbar is wide and heavy next to the app's own look.
  webContents.on('did-finish-load', () => {
    void webContents.insertCSS(
      '::-webkit-scrollbar{width:10px;height:10px}' +
        '::-webkit-scrollbar-thumb{background:rgba(120,130,150,.45);border-radius:5px;border:2px solid transparent;background-clip:content-box}' +
        '::-webkit-scrollbar-thumb:hover{background:rgba(120,130,150,.7);background-clip:content-box}' +
        '::-webkit-scrollbar-track{background:transparent}' +
        // A scrollbar takes room on the right only, which pushes centred content off-centre.
        // Reserving the same room on the left keeps it centred. .r-1rnoaur is react-native-web's
        // `overflow-y: auto`, the class of every vertical ScrollView.
        '.r-1rnoaur{scrollbar-gutter:stable both-edges}',
    );
  });
  void mainWindow.loadURL(`${ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    );
    protocol.handle('app', serveWeb);
    registerIpc(() => mainWindow);
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => database.close());
}
