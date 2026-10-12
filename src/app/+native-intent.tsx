// Deep links pass through here before Expo Router navigates. The Dropbox
// sign-in returns to taskcounter://dropbox-auth?code=…, which is no screen:
// the sign-in code reads it from the browser session itself. Should Android
// have closed the app during sign-in, the link restarts it, and Settings is
// where the user can connect again.

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (!path.includes('dropbox-auth')) return path;
  return initial ? '/settings' : null;
}
