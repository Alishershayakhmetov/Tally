import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS !== 'web';

export function tapFeedback(): void {
  if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function goalReachedFeedback(): void {
  if (enabled) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
