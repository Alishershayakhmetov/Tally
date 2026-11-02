import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { REDIRECT_URI } from './env';

// The phone's side of the Dropbox connection: the keystore and the sign-in in the
// system browser. platform.web.ts is the Windows app's.

export const syncSupported = true;

export const secrets = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  delete: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
};

/** On Android the browser's "closed" signal can arrive just before the redirect. */
const REDIRECT_GRACE_MS = 1_500;

/** Listens for the redirect too, in case the browser reports "closed" first. */
function watchRedirect(): { take: () => Promise<string | null>; stop: () => void } {
  let url: string | null = null;
  let arrived: (() => void) | null = null;
  const subscription = Linking.addEventListener('url', (event) => {
    if (!event.url.startsWith(REDIRECT_URI)) return;
    url = event.url;
    arrived?.();
  });
  return {
    take: async () => {
      if (!url) {
        await new Promise<void>((resolve) => {
          arrived = resolve;
          setTimeout(resolve, REDIRECT_GRACE_MS);
        });
      }
      return url;
    },
    stop: () => subscription.remove(),
  };
}

/** Opens `authorizeUrl` and resolves with the URL Dropbox redirected to, or null if the user backed out. */
export async function signIn(authorizeUrl: string): Promise<string | null> {
  const redirect = watchRedirect();
  try {
    const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, REDIRECT_URI);
    return result.type === 'success' ? result.url : await redirect.take();
  } finally {
    redirect.stop();
  }
}

/** The phone's browser has its own close button, so there's nothing to cancel from here. */
export const cancelSignIn: (() => void) | null = null;
