'use strict';

// Dropbox sign-in without a custom URL scheme: the system browser goes to
// Dropbox, which sends it back to http://localhost:<port>/dropbox-auth, where a
// tiny server waits for exactly one request. The redirect URI has to be added
// in the Dropbox App Console exactly as written here.

const http = require('node:http');

const PORT = 53682;
const PATH = '/dropbox-auth';
const REDIRECT_URI = `http://localhost:${PORT}${PATH}`;
const AUTHORIZE_PREFIX = 'https://www.dropbox.com/oauth2/authorize?';
const TIMEOUT_MS = 5 * 60_000;

const PAGE = `<!doctype html><meta charset="utf-8"><title>Tally</title>
<style>body{font:18px system-ui,sans-serif;max-width:30em;margin:20vh auto;padding:0 1em;color:#111}</style>
<h1>Tally</h1>
<p>Done. You can close this tab and go back to Tally.</p>
<p>Готово. Можно закрыть вкладку и вернуться в Tally.</p>`;

/** @type {{ finish: (url: string | null) => void } | null} */
let pending = null;

function cancel() {
  pending?.finish(null);
}

/**
 * Opens `authorizeUrl` with `open` (the system browser) and resolves with the
 * redirect URL (code and state in its query), or null when cancelled or timed
 * out. `onDone` runs when the sign-in ends, either way.
 */
function start(authorizeUrl, { open, onDone }) {
  if (typeof authorizeUrl !== 'string' || !authorizeUrl.startsWith(AUTHORIZE_PREFIX)) {
    return Promise.reject(new Error('Not a Dropbox sign-in address'));
  }
  cancel();
  return new Promise((resolve, reject) => {
    const servers = [];
    let timer = null;
    let settled = false;

    function closeServers() {
      // After the answer has gone out to the browser.
      setTimeout(() => servers.forEach((server) => server.close()), 500);
    }

    function finish(url) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pending = null;
      closeServers();
      onDone?.();
      resolve(url);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      pending = null;
      closeServers();
      reject(error);
    }

    function listener(request, response) {
      const url = new URL(request.url ?? '/', REDIRECT_URI);
      if (url.pathname !== PATH) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
      });
      response.end(PAGE);
      if (url.searchParams.has('code') || url.searchParams.has('error')) {
        finish(`${url.origin}${url.pathname}${url.search}`);
      }
    }

    function listen(host, required) {
      const server = http.createServer(listener);
      server.on('error', (error) => {
        // IPv6 may be switched off; IPv4 is what's required.
        if (!required) return;
        fail(error.code === 'EADDRINUSE' ? new Error(`Port ${PORT} is in use by another program`) : error);
      });
      server.listen(PORT, host);
      servers.push(server);
    }

    pending = { finish };
    listen('127.0.0.1', true);
    listen('::1', false);
    timer = setTimeout(() => finish(null), TIMEOUT_MS);
    Promise.resolve()
      .then(() => open(authorizeUrl))
      .catch(() => finish(null));
  });
}

module.exports = { start, cancel, REDIRECT_URI };
