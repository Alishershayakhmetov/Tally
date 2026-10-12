import { StyleSheet, View } from 'react-native';

import { visibleOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, type Colors } from '@/theme';

type Props = { fraction: number; color: string; height?: number };

export function ProgressBar({ fraction, color, height = 8 }: Props) {
  const styles = useThemedStyles(makeStyles);
  const colors = useColors();
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <View
      style={[styles.track, { height }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <View
        style={[styles.fill, { width: `${percent}%`, backgroundColor: visibleOn(color, colors.surface) }]}
      />
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    track: {
      width: '100%',
      backgroundColor: c.track,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: radius.pill,
    },
  });
}
