import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { parseReminderTime } from '@/domain/reminders';
import { formatMinutes } from '@/domain/settings';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

const MINUTES_PER_DAY = 1440;
const MINUTE_STEP = 15;

/** Wraps around midnight: 23:45 + 15 min → 00:00. */
export function shiftReminderTime(time: string, deltaMinutes: number): string {
  const minutes = parseReminderTime(time) ?? 0;
  return formatMinutes((((minutes + deltaMinutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY);
}

type Props = {
  value: string;
  /** Receives a shift in minutes; the owner applies it to its latest value. */
  onShift: (deltaMinutes: number) => void;
};

export function ReminderTimePicker({ value, onShift }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [hours, minutes] = value.split(':');
  return (
    <View style={styles.row}>
      <Unit
        value={hours}
        onEarlier={() => onShift(-60)}
        onLater={() => onShift(60)}
        earlierLabel={t('form.hourEarlier')}
        laterLabel={t('form.hourLater')}
      />
      <Text style={styles.colon}>:</Text>
      <Unit
        value={minutes}
        onEarlier={() => onShift(-MINUTE_STEP)}
        onLater={() => onShift(MINUTE_STEP)}
        earlierLabel={t('form.minuteEarlier')}
        laterLabel={t('form.minuteLater')}
      />
    </View>
  );
}

function Unit(props: {
  value: string;
  onEarlier: () => void;
  onLater: () => void;
  earlierLabel: string;
  laterLabel: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.unit}>
      <Pressable
        onPress={props.onEarlier}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={props.earlierLabel}
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <Text style={styles.value}>{props.value}</Text>
      <Pressable
        onPress={props.onLater}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={props.laterLabel}
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
      gap: spacing.sm,
    },
    unit: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    button: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: {
      fontSize: 22,
      color: c.text,
    },
    value: {
      minWidth: 36,
      textAlign: 'center',
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    colon: {
      fontSize: 22,
      fontWeight: '700',
      color: c.text,
    },
  });
}
