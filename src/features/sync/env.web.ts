import { getDesktop } from '@/desktop/bridge';

// The Windows app: the sign-in comes back to a local address that the main
// process listens on, and requests to Dropbox are made by the main process too
// (the page would need Dropbox's CORS headers, and the main process only talks
// to Dropbox's hosts). A plain browser has no bridge and no sign-in.

export const REDIRECT_URI = getDesktop()?.signIn.redirectUri ?? 'http://localhost:53682/dropbox-auth';

export async function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  const desktop = getDesktop();
  if (!desktop) return fetch(url, init);
  const { status, headers, body } = await desktop.http({
    url,
    method: init?.method,
    headers: init?.headers as Record<string, string> | undefined,
    body: typeof init?.body === 'string' ? init.body : undefined,
  });
  // A body is not allowed on some statuses (204, 205, 304), so an empty one is left out.
  return new Response(body || null, { status, headers });
}
