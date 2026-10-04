import type { WidgetInfo, WidgetRepresentation, WidgetTaskHandlerProps } from 'react-native-android-widget';

import { openDatabase } from '@/db/client';
import { getSettings } from '@/db/settings';
import { widgetRowsForHeight } from '@/domain/widget';
import { logWidgetPress } from '@/features/widget/log';
import { buildWidgetSnapshot } from '@/features/widget/snapshot';
import i18n, { resolveLanguage } from '@/i18n';
import { now } from '@/lib/clock';
import { refreshRemindersNow } from '@/notifications/scheduler';

import { LOG_ACTION, TallyWidget } from './AndroidWidget';

/** Light and dark versions for one placed widget; its height decides how many tasks fit. */
export function renderTallyWidget(info: WidgetInfo): WidgetRepresentation {
  const snapshot = buildWidgetSnapshot(now(), widgetRowsForHeight(info.height));
  return {
    light: <TallyWidget snapshot={snapshot} scheme="light" />,
    dark: <TallyWidget snapshot={snapshot} scheme="dark" />,
  };
}

/**
 * Android calls this headless, often without the app open, when a widget is
 * added, resized, refreshed (every 30 min) or tapped.
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_DELETED') return;
  await openDatabase();
  await i18n.changeLanguage(resolveLanguage(getSettings().language));

  let logged = false;
  if (props.widgetAction === 'WIDGET_CLICK' && props.clickAction === LOG_ACTION) {
    const taskId = props.clickActionData?.taskId;
    logged = typeof taskId === 'string' && logWidgetPress(taskId);
  }
  props.renderWidget(renderTallyWidget(props.widgetInfo));
  // The app may not be running to re-plan, and a met quota skips today's reminder.
  if (logged) await refreshRemindersNow();
}
