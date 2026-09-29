import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { addMonths, monthGrid, orderedWeekdays, type Weekday } from '@/domain/periods';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

type Props = {
  visible: boolean;
  value: string | null;
  /** Dates before this are disabled. */
  minDate: string;
  weekStart: Weekday;
  accent: string;
  onSelect: (date: string) => void;
  onClose: () => void;
};

export function CalendarDialog({ visible, value, minDate, weekStart, accent, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [month, setMonth] = useState((value ?? minDate).slice(0, 7));
  const monthsLong = t('date.monthsLong', { returnObjects: true }) as string[];
  const weekdaysShort = t('date.weekdaysShort', { returnObjects: true }) as string[];
  const [year, monthIndex] = month.split('-').map(Number);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('amount.close')} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={styles.header}>
            <Pressable
              onPress={() => setMonth(addMonths(month, -1))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('date.previousMonth')}
            >
              <Text style={styles.nav}>‹</Text>
            </Pressable>
            <Text style={styles.title}>
              {t('date.monthYear', { month: monthsLong[monthIndex - 1], year })}
            </Text>
            <Pressable
              onPress={() => setMonth(addMonths(month, 1))}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('date.nextMonth')}
            >
              <Text style={styles.nav}>›</Text>
            </Pressable>
          </View>
          <View style={styles.week}>
            {orderedWeekdays(weekStart).map((d) => (
              <Text key={d} style={styles.weekday}>
                {weekdaysShort[d]}
              </Text>
            ))}
          </View>
          {monthGrid(month, weekStart).map((week, i) => (
            <View key={i} style={styles.week}>
              {week.map((date, j) => {
                if (date === null) return <View key={j} style={styles.cell} />;
                const disabled = date < minDate;
                const selected = date === value;
                return (
                  <Pressable
                    key={date}
                    onPress={() => {
                      onSelect(date);
                      onClose();
                    }}
                    disabled={disabled}
                    style={[styles.cell, selected && { backgroundColor: accent }]}
                    accessibilityRole="button"
                    aria-selected={selected}
                    aria-disabled={disabled}
                    accessibilityLabel={date}
                  >
                    <Text
                      style={[styles.day, disabled && styles.dayDisabled, selected && styles.daySelected]}
                    >
                      {Number(date.slice(8))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.scrim,
    },
    center: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    nav: {
      fontSize: 28,
      color: c.text,
      paddingHorizontal: spacing.md,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
    },
    week: {
      flexDirection: 'row',
    },
    weekday: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: c.textMuted,
      paddingVertical: spacing.xs,
    },
    cell: {
      flex: 1,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    day: {
      fontSize: 15,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    dayDisabled: {
      color: c.textMuted,
      opacity: 0.4,
    },
    daySelected: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
  });
}
