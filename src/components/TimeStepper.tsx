import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_DAY_START_MIN } from '@/domain/days';
import { DAY_START_STEP_MIN, formatMinutes } from '@/domain/settings';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

type Props = {
  minutes: number;
  /** Receives ±15; the owner applies it to its latest value and clamps it. */
  onStep: (deltaMinutes: number) => void;
  earlierLabel: string;
  laterLabel: string;
};

/** 00:00–12:00 in 15-minute steps (SPEC §3.5). */
export function TimeStepper({ minutes, onStep, earlierLabel, laterLabel }: Props) {
  const styles = useThemedStyles(makeStyles);
  const canGoEarlier = minutes > 0;
  const canGoLater = minutes < MAX_DAY_START_MIN;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onStep(-DAY_START_STEP_MIN)}
        disabled={!canGoEarlier}
        style={[styles.button, !canGoEarlier && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={earlierLabel}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <Text style={styles.value} accessibilityLiveRegion="polite">
        {formatMinutes(minutes)}
      </Text>
      <Pressable
        onPress={() => onStep(DAY_START_STEP_MIN)}
        disabled={!canGoLater}
        style={[styles.button, !canGoLater && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={laterLabel}
      >
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    button: {
      width: 48,
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: {
      opacity: 0.4,
    },
    buttonText: {
      fontSize: 22,
      color: c.text,
    },
    value: {
      minWidth: 72,
      textAlign: 'center',
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
  });
}
