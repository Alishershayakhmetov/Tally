import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/db/settings';
import { darkColors, lightColors, type Colors } from '@/theme';

export function useColors(): Colors {
  const pref = useSettings().theme;
  const system = useColorScheme();
  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  return scheme === 'dark' ? darkColors : lightColors;
}

/** Builds a StyleSheet from the active colours; `factory` should be a module-level function. */
export function useThemedStyles<T>(factory: (c: Colors) => T): T {
  const colors = useColors();
  return useMemo(() => factory(colors), [factory, colors]);
}
