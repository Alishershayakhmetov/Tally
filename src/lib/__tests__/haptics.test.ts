import * as Haptics from 'expo-haptics';

import { getSettings } from '@/db/settings';
import { DEFAULT_SETTINGS } from '@/domain/settings';

import { goalReachedFeedback, tapFeedback } from '../haptics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('@/db/settings', () => ({ getSettings: jest.fn() }));

const settings = jest.mocked(getSettings);

beforeEach(() => jest.clearAllMocks());

it('does not vibrate with default settings', () => {
  settings.mockReturnValue(DEFAULT_SETTINGS);
  tapFeedback();
  goalReachedFeedback();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
});

it('vibrates once turned on, and reads the setting on every call', () => {
  settings.mockReturnValue({ ...DEFAULT_SETTINGS, vibration: true });
  tapFeedback();
  goalReachedFeedback();
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);

  settings.mockReturnValue({ ...DEFAULT_SETTINGS, vibration: false });
  tapFeedback();
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
});
