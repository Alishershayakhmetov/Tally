import { httpFetch, REDIRECT_URI } from './env';
import type { RemoteFile } from './engine';

// Dropbox over plain HTTPS (no SDK). Sign-in is OAuth 2 with PKCE, so the app
// holds no secret: the app key below is public by design. The app is created
// in the Dropbox App Console with "App folder" access and the
// files.content.read / files.content.write permissions, and this redirect URI.

/**
 * The author's Dropbox app. To use your own, set EXPO_PUBLIC_DROPBOX_APP_KEY (in .env, see
 * .env.example): Expo inlines it when the app is bundled, so it must be written exactly like this.
 */
export const DROPBOX_APP_KEY = process.env.EXPO_PUBLIC_DROPBOX_APP_KEY || 'yonuwxw6yypcgfh';
/** Where the sign-in comes back to: a URL scheme on the phone, a local address in the Windows app. */
export const DROPBOX_REDIRECT_URI = REDIRECT_URI;

const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API_URL = 'https://api.dropboxapi.com/2';
const CONTENT_URL = 'https://content.dropboxapi.com/2';

/**
 * - expired: the access token ran out (refresh and retry);
 * - revoked: the refresh token no longer works (the user removed the app, or it was disconnected);
 * - scope: the app in the App Console lacks a permission;
 */
export type DropboxErrorKind = 'expired' | 'revoked' | 'scope' | 'network' | 'rateLimit' | 'server';

export class DropboxError extends Error {
  constructor(
    readonly kind: DropboxErrorKind,
    detail: string,
  ) {
    super(`Dropbox ${kind}: ${detail}`);
    this.name = 'DropboxError';
  }
}

export type AccessToken = { token: string; /** Real-clock epoch ms. */ expiresAt: number };
export type DropboxAccount = { name: string; email: string };

/** "a=1&b=2", for form bodies and the authorize URL. */
function encodeForm(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export function authorizeUrl(challenge: string, state: string): string {
  return `${AUTHORIZE_URL}?${encodeForm({
    client_id: DROPBOX_APP_KEY,
    response_type: 'code',
    redirect_uri: DROPBOX_REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // A refresh token, so the app stays connected after the 4-hour access token expires.
    token_access_type: 'offline',
    state,
  })}`;
}

/** The query of a URL as a map; RN's URL class doesn't implement searchParams. */
export function queryParams(url: string): Map<string, string> {
  const params = new Map<string, string>();
  const query = url.split('#')[0].split('?')[1] ?? '';
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.split('=');
    const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));
    params.set(decode(key), decode(value));
  }
  return params;
}

export type AuthRedirect = { ok: true; code: string } | { ok: false; reason: 'denied' | 'mismatch' };

/** Reads taskcounter://dropbox-auth?code=…&state=… (or ?error=access_denied). */
export function parseAuthRedirect(url: string, expectedState: string): AuthRedirect {
  const params = queryParams(url);
  if (params.get('state') !== expectedState) return { ok: false, reason: 'mismatch' };
  const code = params.get('code');
  if (code) return { ok: true, code };
  return { ok: false, reason: params.get('error') === 'access_denied' ? 'denied' : 'mismatch' };
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await httpFetch(url, init);
  } catch (error) {
    throw new DropboxError('network', error instanceof Error ? error.message : String(error));
  }
}

async function bodyText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/** Maps an error response that the caller didn't handle itself. */
async function failure(response: Response): Promise<DropboxError> {
  const text = await bodyText(response);
  const detail = `${response.status} ${text.slice(0, 200)}`;
  if (response.status === 401) {
    if (text.includes('missing_scope')) return new DropboxError('scope', detail);
    if (text.includes('expired_access_token')) return new DropboxError('expired', detail);
    return new DropboxError('revoked', detail);
  }
  if (response.status === 400 && text.includes('invalid_grant')) return new DropboxError('revoked', detail);
  if (response.status === 429) return new DropboxError('rateLimit', detail);
  return new DropboxError('server', detail);
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };

function toAccessToken(body: TokenResponse, now: number): AccessToken {
  return { token: body.access_token, expiresAt: now + body.expires_in * 1000 };
}

async function postToken(fields: Record<string, string>): Promise<TokenResponse> {
  const response = await send(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encodeForm(fields),
  });
  if (!response.ok) throw await failure(response);
  return (await response.json()) as TokenResponse;
}

/** Trades the code from the redirect for tokens; `verifier` proves this app started the sign-in. */
export async function exchangeCode(
  code: string,
  verifier: string,
): Promise<{ access: AccessToken; refreshToken: string }> {
  const startedAt = Date.now();
  const body = await postToken({
    code,
    grant_type: 'authorization_code',
    code_verifier: verifier,
    client_id: DROPBOX_APP_KEY,
    redirect_uri: DROPBOX_REDIRECT_URI,
  });
  if (!body.refresh_token) throw new DropboxError('server', 'no refresh token in the response');
  return { access: toAccessToken(body, startedAt), refreshToken: body.refresh_token };
}

export async function refreshAccess(refreshToken: string): Promise<AccessToken> {
  const startedAt = Date.now();
  const body = await postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: DROPBOX_APP_KEY,
  });
  return toAccessToken(body, startedAt);
}

/** Signs this app out of the account; the file stays in Dropbox. */
export async function revokeToken(token: string): Promise<void> {
  const response = await send(`${API_URL}/auth/token/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await failure(response);
}

export async function getAccount(token: string): Promise<DropboxAccount> {
  const response = await send(`${API_URL}/users/get_current_account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as { name?: { display_name?: string }; email?: string };
  return { name: body.name?.display_name ?? '', email: body.email ?? '' };
}

/** Dropbox-API-Arg must be ASCII, so anything else is escaped as \uXXXX. */
function apiArg(arg: unknown): string {
  return JSON.stringify(arg).replace(
    /[^\x20-\x7e]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

export async function downloadFile(token: string, path: string): Promise<RemoteFile | null> {
  const response = await send(`${CONTENT_URL}/files/download`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': apiArg({ path }) },
  });
  if (response.status === 409) {
    const text = await bodyText(response);
    if (text.includes('not_found')) return null;
    throw new DropboxError('server', `409 ${text.slice(0, 200)}`);
  }
  if (!response.ok) throw await failure(response);
  const meta = JSON.parse(response.headers.get('Dropbox-API-Result') ?? '{}') as { rev?: string };
  if (!meta.rev) throw new DropboxError('server', 'download without a revision');
  return { text: await response.text(), rev: meta.rev };
}

export async function uploadFile(
  token: string,
  path: string,
  text: string,
  rev: string | null,
): Promise<'ok' | 'conflict'> {
  const response = await send(`${CONTENT_URL}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': apiArg({
        path,
        // "update" only replaces the revision that was downloaded; "add" only creates.
        mode: rev ? { '.tag': 'update', update: rev } : { '.tag': 'add' },
        autorename: false,
        mute: true,
        strict_conflict: true,
      }),
    },
    body: text,
  });
  if (response.status === 409) {
    const body = await bodyText(response);
    if (body.includes('conflict')) return 'conflict';
    throw new DropboxError('server', `409 ${body.slice(0, 200)}`);
  }
  if (!response.ok) throw await failure(response);
  return 'ok';
}
