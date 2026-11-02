// What the Dropbox client needs to know about where it runs. This is the phone
// version: a custom URL scheme for the sign-in redirect, and the plain `fetch`.
// env.web.ts is the Windows app's. Kept free of Expo modules so tests can load it.

export const REDIRECT_URI = 'taskcounter://dropbox-auth';

export function httpFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}
