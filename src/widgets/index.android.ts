import { AppState, TurboModuleRegistry } from 'react-native';

import { subscribeDataChanges } from '@/db/live';
import { WIDGET_NAME } from '@/features/widget/snapshot';

// Android widget (react-native-android-widget). Taps run widgetTaskHandler
// headless, so + is logged even with the app closed; while the app runs, every
// data change redraws the placed widgets.

type Library = typeof import('react-native-android-widget');
type Handler = typeof import('./androidTaskHandler');

/**
 * The library throws on import when its native module is missing (Expo Go),
 * so it's only required once the module is known to exist.
 */
function load(): { library: Library; handler: Handler } | null {
  if (!TurboModuleRegistry.get('AndroidWidget')) return null;
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native module exists
    library: require('react-native-android-widget') as Library,
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native module exists
    handler: require('./androidTaskHandler') as Handler,
  };
}

export function registerWidgetHandlers(): void {
  const loaded = load();
  loaded?.library.registerWidgetTaskHandler(loaded.handler.widgetTaskHandler);
}

const REFRESH_DEBOUNCE_MS = 500;

export function startWidgets(): () => void {
  const loaded = load();
  if (!loaded) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const refresh = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      loaded.library
        .requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: loaded.handler.renderTallyWidget })
        .catch((error: unknown) => console.warn('Widget update failed', error));
    }, REFRESH_DEBOUNCE_MS);
  };
  const unsubscribe = subscribeDataChanges(refresh);
  const appState = AppState.addEventListener('change', (state) => state === 'active' && refresh());
  refresh();
  return () => {
    unsubscribe();
    appState.remove();
    if (timer) clearTimeout(timer);
  };
}
