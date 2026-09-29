import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

type Option<T> = { value: T; label: string };

type Props<T> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && styles.selected]}
            accessibilityRole="radio"
            aria-checked={selected}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      backgroundColor: c.track,
      borderRadius: radius.md,
      padding: 3,
      gap: 3,
    },
    option: {
      flex: 1,
      minWidth: 0,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.sm,
      alignItems: 'center',
    },
    selected: {
      backgroundColor: c.surface,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textMuted,
    },
    selectedLabel: {
      color: c.text,
    },
  });
}
