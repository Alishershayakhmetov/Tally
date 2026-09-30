import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { getSettings } from '@/db/settings';

const supported = Platform.OS !== 'web';

/** Read on every call, so the Settings switch applies immediately. Off by default. */
function enabled(): boolean {
  return supported && getSettings().vibration;
}

export function tapFeedback(): void {
  if (enabled()) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function goalReachedFeedback(): void {
  if (enabled()) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
