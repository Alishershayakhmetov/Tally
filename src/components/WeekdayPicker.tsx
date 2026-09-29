import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { orderedWeekdays, weekdayBit, type Weekday } from '@/domain/periods';
import { readableOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, type Colors } from '@/theme';

type Props = {
  mask: number;
  weekStart: Weekday;
  accent: string;
  /** Receives the tapped day's bit; the owner applies it to its latest state. */
  onToggle: (bit: number) => void;
};

export function WeekdayPicker({ mask, weekStart, accent, onToggle }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const short = t('date.weekdaysShort', { returnObjects: true }) as string[];
  const long = t('date.weekdaysLong', { returnObjects: true }) as string[];
  return (
    <View style={styles.row}>
      {orderedWeekdays(weekStart).map((day) => {
        const bit = weekdayBit(day);
        const on = (mask & bit) !== 0;
        return (
          <Pressable
            key={day}
            onPress={() => onToggle(bit)}
            style={[styles.day, on ? { backgroundColor: accent, borderColor: accent } : null]}
            accessibilityRole="checkbox"
            aria-checked={on}
            accessibilityLabel={long[day]}
          >
            <Text
              style={[
                styles.label,
                { color: on ? '#FFFFFF' : readableOn(accent, colors.surface, colors.text) },
              ]}
            >
              {short[day]}
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
      gap: 6,
    },
    day: {
      flex: 1,
      minWidth: 0,
      height: 40,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
    },
  });
}
