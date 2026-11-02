// A stand-in for the parts of Dropbox that Tally uses, for the end-to-end tests.
// It answers the way Dropbox's documented API does (the same status codes, error
// bodies and headers that src/features/sync/dropbox.ts reads), so the app's whole
// sync path runs against it: sign-in, token refresh, download with its revision,
// and an upload that is refused when the file changed since it was downloaded.
//
// The app is pointed at it through TALLY_TEST_DROPBOX_ORIGIN (desktop/src/dropboxHttp.js).

import { createServer } from 'node:http';

export async function startFakeDropbox() {
  /** @type {{ rev: string, text: string } | null} */
  let file = null;
  let revCounter = 0;
  let tokenCounter = 0;
  const tokens = new Set();
  const log = [];

  const state = {
    /** The file as Dropbox holds it (what anyone with access to the account would see). */
    get file() {
      return file;
    },
    set file(value) {
      file = value;
    },
    log,
    uploads: 0,
    downloads: 0,
    /** Every revision of the file ever uploaded, oldest first: Dropbox's version history. */
    history: [],
    /** Refuse the next token refresh as if the user had removed the app from their account. */
    revokeAll() {
      tokens.clear();
      state.revoked = true;
    },
    revoked: false,
  };

  function json(response, status, body, headers = {}) {
    response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    response.end(JSON.stringify(body));
  }

  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const url = new URL(request.url ?? '/', 'http://fake');
      log.push(`${request.method} ${url.pathname}`);

      if (url.pathname === '/oauth2/token') {
        const form = new URLSearchParams(body);
        if (form.get('grant_type') === 'authorization_code') {
          if (!form.get('code')?.startsWith('ok-') || !form.get('code_verifier')) {
            return json(response, 400, {
              error: 'invalid_grant',
              error_description: "code doesn't exist or has expired",
            });
          }
          const token = `at-${++tokenCounter}`;
          tokens.add(token);
          state.revoked = false;
          return json(response, 200, {
            access_token: token,
            expires_in: 14400,
            refresh_token: `rt-${tokenCounter}`,
          });
        }
        if (form.get('grant_type') === 'refresh_token') {
          if (state.revoked) return json(response, 400, { error: 'invalid_grant' });
          const token = `at-${++tokenCounter}`;
          tokens.add(token);
          return json(response, 200, { access_token: token, expires_in: 14400 });
        }
        return json(response, 400, { error: 'unsupported_grant_type' });
      }

      const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
      if (!bearer || !tokens.has(bearer)) {
        return json(response, 401, {
          error_summary: 'invalid_access_token/',
          error: { '.tag': 'invalid_access_token' },
        });
      }

      if (url.pathname === '/2/users/get_current_account') {
        return json(response, 200, { name: { display_name: 'Test User' }, email: 'test@example.com' });
      }
      if (url.pathname === '/2/auth/token/revoke') {
        tokens.delete(bearer);
        return json(response, 200, {});
      }

      const arg = JSON.parse(request.headers['dropbox-api-arg'] ?? '{}');
      if (url.pathname === '/2/files/download') {
        state.downloads++;
        if (!file || arg.path !== '/tally-sync.json') {
          return json(response, 409, {
            error_summary: 'path/not_found/..',
            error: { '.tag': 'path', path: { '.tag': 'not_found' } },
          });
        }
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Result': JSON.stringify({ name: 'tally-sync.json', rev: file.rev }),
        });
        return response.end(file.text);
      }
      if (url.pathname === '/2/files/upload') {
        const mode = arg.mode?.['.tag'];
        const conflict =
          (mode === 'add' && file !== null) ||
          (mode === 'update' && (file === null || file.rev !== arg.mode.update));
        if (conflict) {
          return json(response, 409, {
            error_summary: 'path/conflict/file/..',
            error: { '.tag': 'path', reason: { '.tag': 'conflict' } },
          });
        }
        state.uploads++;
        file = { rev: `rev${(++revCounter).toString(16).padStart(8, '0')}`, text: body };
        state.history.push(file);
        return json(response, 200, { name: 'tally-sync.json', rev: file.rev });
      }
      return json(response, 404, { error_summary: 'not_found/' });
    });
  });

  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    state,
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => server.close(done)),
  };
}
