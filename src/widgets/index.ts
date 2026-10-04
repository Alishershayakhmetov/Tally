// Home-screen widgets (Phase 7) exist on Android (index.android.ts) and iOS
// (index.ios.ts). Elsewhere, such as the web build, these do nothing.
//
// Keep these files out of folders named android/ or ios/: React Native's
// Gradle plugin ignores such paths when deciding whether to rebuild the JS
// bundle, so edits there silently ship the old code.

/** Registers the widget's background handler. Called from the app entry (index.ts). */
export function registerWidgetHandlers(): void {}

/** Keeps placed widgets in step with the data. Call once the database is open; returns a cleanup. */
export function startWidgets(): () => void {
  return () => {};
}
