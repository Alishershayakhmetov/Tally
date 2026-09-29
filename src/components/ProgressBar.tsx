import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

type Props = { fraction: number; color: string; height?: number };

export function ProgressBar({ fraction, color, height = 8 }: Props) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <View
      style={[styles.track, { height }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.track,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
