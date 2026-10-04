import { requireOptionalNativeModule } from 'expo';
import type { WidgetTimelineEntry } from 'expo-widgets';
import { AppState } from 'react-native';

import { subscribeDataChanges } from '@/db/live';
import type { WidgetTap } from '@/domain/widget';
import { logWidgetTaps } from '@/features/widget/log';
import { buildWidgetSnapshot, WIDGET_NAME } from '@/features/widget/snapshot';
import { getClockOffsetMs, now } from '@/lib/clock';

import type { IosWidgetProps } from './IosWidget';

// iOS widget (expo-widgets). The widget can't reach the database: the app
// pushes it a timeline of snapshots, and + presses wait in the widget's props
// until the app runs again and logs them.

type WidgetModule = typeof import('./IosWidget');
type Library = typeof import('expo-widgets');

/** expo-widgets needs its native module (missing in Expo Go), so the widget is only loaded when it exists. */
function load(): { widget: WidgetModule['TallyWidget']; library: Library } | null {
  if (!requireOptionalNativeModule('ExpoWidgets')) return null;
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native module exists
    widget: (require('./IosWidget') as WidgetModule).TallyWidget,
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native module exists
    library: require('expo-widgets') as Library,
  };
}

/** iOS needs no background handler: the widget updates its own props on a press. */
export function registerWidgetHandlers(): void {}

/** Snapshots for now and the next few day boundaries, so "today" resets without the app. */
const TIMELINE_ENTRIES = 4;

function timeline(nowMs: number): WidgetTimelineEntry<IosWidgetProps>[] {
  const entries: WidgetTimelineEntry<IosWidgetProps>[] = [];
  let at = nowMs;
  for (let i = 0; i < TIMELINE_ENTRIES; i++) {
    const snapshot = buildWidgetSnapshot(at);
    // Timestamps here include the dev clock offset; the system schedules on the real clock.
    entries.push({ date: new Date(at - getClockOffsetMs()), props: { snapshot, taps: [] } });
    if (snapshot.nextChangeAt === null) break;
    at = snapshot.nextChangeAt;
  }
  return entries;
}

const tapKey = (tap: WidgetTap) => `${tap.taskId}:${tap.at}`;
/** Presses already logged in this app session, in case the widget still lists them. */
const logged = new Set<string>();

/**
 * Logs presses the widget kept, then replaces its timeline with fresh
 * snapshots and no pending presses. A press made between reading and
 * replacing the timeline is lost; the window is a few milliseconds.
 */
async function sync(widget: WidgetModule['TallyWidget']): Promise<void> {
  const entries = await widget.getTimeline();
  const taps = new Map<string, WidgetTap>();
  for (const entry of entries) {
    for (const tap of entry.props?.taps ?? []) {
      if (!logged.has(tapKey(tap))) taps.set(tapKey(tap), tap);
    }
  }
  if (taps.size > 0) {
    logWidgetTaps([...taps.values()]);
    taps.forEach((_, key) => logged.add(key));
  }
  widget.updateTimeline(timeline(now()));
}

const SYNC_DEBOUNCE_MS = 500;

export function startWidgets(): () => void {
  const loaded = load();
  if (!loaded) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const schedule = (delayMs = SYNC_DEBOUNCE_MS) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      queue = queue
        .then(() => sync(loaded.widget))
        .catch((error: unknown) => console.warn('Widget sync failed', error));
    }, delayMs);
  };
  const unsubscribe = subscribeDataChanges(() => schedule());
  const appState = AppState.addEventListener('change', (state) => state === 'active' && schedule(0));
  // Fires only while the app is running; presses made while it's closed are found on the next sync.
  const interactions = loaded.library.addUserInteractionListener((event) => {
    if (event.source === WIDGET_NAME) schedule(0);
  });
  schedule(0);
  return () => {
    unsubscribe();
    appState.remove();
    interactions.remove();
    if (timer) clearTimeout(timer);
  };
}
