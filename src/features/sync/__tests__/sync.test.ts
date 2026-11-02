import { serializeSyncFile } from '@/domain/sync';

import { redirectSystemPath } from '../../../app/+native-intent';
import {
  authorizeUrl,
  downloadFile,
  DROPBOX_APP_KEY,
  DROPBOX_REDIRECT_URI,
  DropboxError,
  exchangeCode,
  parseAuthRedirect,
  queryParams,
  refreshAccess,
  uploadFile,
} from '../dropbox';
import { SyncError, syncOnce } from '../engine';
import { Device, FakeDropbox, backup, entry, ids, task } from '../__fakes__/fakes';
import { base64Url, challengeFor } from '../pkce';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async (_algorithm: string, data: string) =>
    jest.requireActual<typeof import('crypto')>('crypto').createHash('sha256').update(data).digest('base64'),
  getRandomBytes: (n: number) => new Uint8Array(n),
}));

// ---------------------------------------------------------------------------
// Two devices and a Dropbox, all in memory

describe('syncOnce', () => {
  it('creates the file from the first device', async () => {
    const dropbox = new FakeDropbox();
    const phone = new Device(backup({ tasks: [task('a', 10)], entries: [entry('e1', 'a', 5, 10)] }));
    await expect(syncOnce(dropbox, phone)).resolves.toMatchObject({ pushed: true });
    expect(dropbox.file?.rev).toBe('rev-1');
  });

  it('merges two devices both ways, the later edit winning', async () => {
    const dropbox = new FakeDropbox();
    const shared = task('a', 10);
    const phone = new Device(backup({ tasks: [shared], entries: [entry('e1', 'a', 5, 10)] }));
    await syncOnce(dropbox, phone);

    // The tablet starts with its own task, and later renames the shared one.
    const tablet = new Device(backup({ tasks: [task('b', 20)] }));
    const pulled = await syncOnce(dropbox, tablet);
    expect(pulled).toEqual({ pulled: { tasksAdded: 1, entriesAdded: 1, updated: 0 }, pushed: true });
    tablet.merge(backup({ tasks: [{ ...shared, name: 'renamed', updatedAt: 30 }] }));
    await syncOnce(dropbox, tablet);

    // Meanwhile the phone logged an entry, older than the rename.
    phone.merge(backup({ entries: [entry('e2', 'a', 7, 25)] }));
    await syncOnce(dropbox, phone);
    await syncOnce(dropbox, tablet);

    expect(ids(phone)).toEqual(ids(tablet));
    expect(ids(phone)).toEqual({ tasks: ['a@30', 'b@20'], entries: ['e1:5', 'e2:7'] });
    expect(phone.data.tasks.find((t) => t.id === 'a')?.name).toBe('renamed');
  });

  it('carries a deletion to the other device', async () => {
    const dropbox = new FakeDropbox();
    const phone = new Device(backup({ tasks: [task('a', 10)] }));
    const tablet = new Device(backup({}));
    await syncOnce(dropbox, phone);
    await syncOnce(dropbox, tablet);
    tablet.merge(backup({ tasks: [task('a', 50, { deletedAt: 50 })] }));
    await syncOnce(dropbox, tablet);
    await syncOnce(dropbox, phone);
    expect(phone.data.tasks[0].deletedAt).toBe(50);
  });

  it('downloads without uploading when nothing changed here', async () => {
    const dropbox = new FakeDropbox();
    const phone = new Device(backup({ tasks: [task('a', 10)] }));
    await syncOnce(dropbox, phone);
    await expect(syncOnce(dropbox, phone)).resolves.toMatchObject({ pushed: false });
    expect(dropbox.uploads).toBe(1);
  });

  it('starts over when another device uploads in between, and keeps both changes', async () => {
    const dropbox = new FakeDropbox();
    const phone = new Device(backup({ tasks: [task('a', 10)] }));
    await syncOnce(dropbox, phone);
    phone.merge(backup({ entries: [entry('e1', 'a', 1, 20)] }));

    // The tablet's upload lands between the phone's download and upload.
    const tablet = backup({ tasks: [task('a', 10)], entries: [entry('e2', 'a', 2, 21)] });
    dropbox.beforeUpload = () => {
      dropbox.beforeUpload = null;
      dropbox.file = { text: serializeSyncFile(tablet), rev: 'tablet' };
    };
    await expect(syncOnce(dropbox, phone)).resolves.toMatchObject({ pushed: true });
    expect(dropbox.conflicts).toBe(1);
    const final = new Device(backup({}));
    await syncOnce(dropbox, final);
    expect(ids(final).entries).toEqual(['e1:1', 'e2:2']);
  });

  it('gives up after repeated conflicts', async () => {
    const dropbox = new FakeDropbox();
    dropbox.upload = async () => 'conflict';
    await expect(syncOnce(dropbox, new Device(backup({ tasks: [task('a', 1)] })))).rejects.toEqual(
      new SyncError('conflict'),
    );
  });

  it('never overwrites a file it cannot read', async () => {
    const dropbox = new FakeDropbox();
    dropbox.file = { text: '{"app":"tally","format":1,"tasks":"nope"}', rev: 'r1' };
    const phone = new Device(backup({ tasks: [task('a', 1)] }));
    await expect(syncOnce(dropbox, phone)).rejects.toEqual(new SyncError('fileInvalid'));
    dropbox.file = { text: JSON.stringify({ app: 'tally', format: 99 }), rev: 'r2' };
    await expect(syncOnce(dropbox, phone)).rejects.toEqual(new SyncError('newerFormat'));
    expect(dropbox.uploads).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Dropbox over HTTP, with fetch faked

type Call = { url: string; init: RequestInit };

function fakeFetch(...responses: Response[]): Call[] {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new TypeError('Network request failed');
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

describe('Dropbox sign-in', () => {
  it('asks for a code with PKCE and a refresh token, coming back to the app', () => {
    const params = queryParams(authorizeUrl('CHALLENGE', 'STATE'));
    expect(Object.fromEntries(params)).toEqual({
      client_id: DROPBOX_APP_KEY,
      response_type: 'code',
      redirect_uri: 'taskcounter://dropbox-auth',
      code_challenge: 'CHALLENGE',
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      state: 'STATE',
    });
  });

  it('accepts the code only with the state it sent', () => {
    expect(parseAuthRedirect(`${DROPBOX_REDIRECT_URI}?code=abc%2Bd&state=s1`, 's1')).toEqual({
      ok: true,
      code: 'abc+d',
    });
    expect(parseAuthRedirect(`${DROPBOX_REDIRECT_URI}?code=abc&state=other`, 's1')).toEqual({
      ok: false,
      reason: 'mismatch',
    });
    expect(parseAuthRedirect(`${DROPBOX_REDIRECT_URI}?error=access_denied&state=s1`, 's1')).toEqual({
      ok: false,
      reason: 'denied',
    });
  });

  it('makes the RFC 7636 challenge', async () => {
    // RFC 7636, appendix B
    await expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).resolves.toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('encodes base64url without padding', () => {
    for (const size of [0, 1, 2, 3, 16, 31, 32]) {
      const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 37 + 11) % 256);
      expect(base64Url(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
    }
    expect(base64Url(new Uint8Array(32))).toHaveLength(43);
  });

  it('trades the code for tokens, sending the verifier', async () => {
    const calls = fakeFetch(json(200, { access_token: 'AT', expires_in: 14400, refresh_token: 'RT' }));
    const before = Date.now();
    const tokens = await exchangeCode('CODE', 'VERIFIER');
    expect(tokens.refreshToken).toBe('RT');
    expect(tokens.access.token).toBe('AT');
    expect(tokens.access.expiresAt).toBeGreaterThanOrEqual(before + 14_400_000);
    expect(calls[0].url).toBe('https://api.dropboxapi.com/oauth2/token');
    expect(Object.fromEntries(queryParams(`?${calls[0].init.body as string}`))).toEqual({
      code: 'CODE',
      grant_type: 'authorization_code',
      code_verifier: 'VERIFIER',
      client_id: DROPBOX_APP_KEY,
      redirect_uri: 'taskcounter://dropbox-auth',
    });
  });

  it('reports a refresh token Dropbox no longer accepts as revoked', async () => {
    fakeFetch(
      json(400, { error: 'invalid_grant', error_description: 'refresh token is invalid or revoked' }),
    );
    await expect(refreshAccess('RT')).rejects.toMatchObject({ kind: 'revoked' });
  });
});

describe('Dropbox files', () => {
  it('downloads the file with its revision, or null when there is none', async () => {
    const calls = fakeFetch(
      new Response('{"app":"tally"}', {
        status: 200,
        headers: { 'Dropbox-API-Result': JSON.stringify({ rev: '015abc', name: 'tally-sync.json' }) },
      }),
      json(409, { error_summary: 'path/not_found/..', error: { '.tag': 'path' } }),
    );
    await expect(downloadFile('AT', '/tally-sync.json')).resolves.toEqual({
      text: '{"app":"tally"}',
      rev: '015abc',
    });
    await expect(downloadFile('AT', '/tally-sync.json')).resolves.toBeNull();
    expect(calls[0].url).toBe('https://content.dropboxapi.com/2/files/download');
    expect(calls[0].init.headers).toMatchObject({
      Authorization: 'Bearer AT',
      'Dropbox-API-Arg': '{"path":"/tally-sync.json"}',
    });
  });

  it('uploads against the downloaded revision, or as a new file', async () => {
    const calls = fakeFetch(
      json(200, { rev: '2' }),
      json(200, { rev: '1' }),
      json(409, { error_summary: 'path/conflict/file/..', error: { '.tag': 'path' } }),
    );
    await expect(uploadFile('AT', '/tally-sync.json', 'отжимания 💪', '015abc')).resolves.toBe('ok');
    await expect(uploadFile('AT', '/tally-sync.json', '{}', null)).resolves.toBe('ok');
    await expect(uploadFile('AT', '/tally-sync.json', '{}', 'old')).resolves.toBe('conflict');
    const arg = (call: Call) => JSON.parse((call.init.headers as Record<string, string>)['Dropbox-API-Arg']);
    expect(arg(calls[0])).toEqual({
      path: '/tally-sync.json',
      mode: { '.tag': 'update', update: '015abc' },
      autorename: false,
      mute: true,
      strict_conflict: true,
    });
    expect(arg(calls[1]).mode).toEqual({ '.tag': 'add' });
    expect(calls[0].init.body).toBe('отжимания 💪');
  });

  it('sorts errors into what the app does about them', async () => {
    fakeFetch(
      json(401, { error_summary: 'expired_access_token/', error: { '.tag': 'expired_access_token' } }),
      json(401, { error_summary: 'missing_scope/', error: { '.tag': 'missing_scope' } }),
      json(429, { error_summary: 'too_many_requests/' }),
      json(500, {}),
    );
    const kinds: string[] = [];
    for (let i = 0; i < 5; i++) {
      await downloadFile('AT', '/tally-sync.json').catch((error: DropboxError) => kinds.push(error.kind));
    }
    expect(kinds).toEqual(['expired', 'scope', 'rateLimit', 'server', 'network']);
  });
});

describe('the sign-in redirect', () => {
  it('is not a screen: ignored while the app runs, Settings after a restart', () => {
    const url = `${DROPBOX_REDIRECT_URI}?code=abc&state=s`;
    expect(redirectSystemPath({ path: url, initial: false })).toBeNull();
    expect(redirectSystemPath({ path: url, initial: true })).toBe('/settings');
    expect(redirectSystemPath({ path: 'taskcounter://task/abc', initial: false })).toBe(
      'taskcounter://task/abc',
    );
  });
});
