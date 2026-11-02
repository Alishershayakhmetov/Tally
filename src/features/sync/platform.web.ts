import { getDesktop } from '@/desktop/bridge';

// The Windows app's side of the Dropbox connection (see platform.ts for the
// phone's): secrets encrypted by Windows, and the sign-in through the system
// browser, answered at a local address by the main process. In a plain browser
// there is no bridge, and sync is simply not offered.

export const syncSupported = getDesktop() !== null;

function bridge() {
  const desktop = getDesktop();
  if (!desktop) throw new Error('Dropbox sync is only available in the Windows app');
  return desktop;
}

export const secrets = {
  get: async (key: string): Promise<string | null> => bridge().secrets.get(key),
  set: async (key: string, value: string): Promise<void> => bridge().secrets.set(key, value),
  delete: async (key: string): Promise<void> => bridge().secrets.delete(key),
};

export const signIn = (authorizeUrl: string): Promise<string | null> => bridge().signIn.start(authorizeUrl);

/** The browser tab can't tell the app that it was closed, so the user can cancel from the app instead. */
export const cancelSignIn: (() => void) | null = () => getDesktop()?.signIn.cancel();
