import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { addMonths, monthGrid, orderedWeekdays, type Weekday } from '@/domain/periods';
import { heatLevel, type HeatLevel } from '@/domain/stats';
import { heatRamp, inkOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

// A month of days shaded by amount: one hue in four steps (heatRamp in
// lib/contrast), with a 2px surface gap between cells. Level 0 (nothing, or a
// net loss) is the neutral track.

type Props = {
  month: string;
  minMonth: string;
  maxMonth: string;
  onMonthChange: (month: string) => void;
  weekStart: Weekday;
  today: string;
  dailySums: ReadonlyMap<string, number>;
  /** The amount that maps to the darkest shade. */
  scale: number;
  /** Mark colour, already checked for 3:1 against the surface. */
  color: string;
  selected: string | null;
  onSelect: (date: string) => void;
  /** "Sep 28: 40" */
  accessibilityLabelFor: (date: string, amount: number) => string;
  /** Explains the darkest shade when it means "goal met". */
  legendNote: string | null;
};

export function HeatCalendar(props: Props) {
  const { month, minMonth, maxMonth, onMonthChange, weekStart, today, dailySums, scale, color, selected } =
    props;
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const monthsLong = t('date.monthsLong', { returnObjects: true }) as string[];
  const weekdaysShort = t('date.weekdaysShort', { returnObjects: true }) as string[];
  const [year, monthIndex] = month.split('-').map(Number);
  const ramp = heatRamp(color, colors.surface, colors.scheme);
  const fill = (level: HeatLevel) => (level === 0 ? colors.track : ramp[level - 1]);
  const canGoBack = month > minMonth;
  const canGoForward = month < maxMonth;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          onPress={() => onMonthChange(addMonths(month, -1))}
          disabled={!canGoBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('date.previousMonth')}
          aria-disabled={!canGoBack}
        >
          <Text style={[styles.nav, !canGoBack && styles.navDisabled]}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{t('date.monthYear', { month: monthsLong[monthIndex - 1], year })}</Text>
        <Pressable
          onPress={() => onMonthChange(addMonths(month, 1))}
          disabled={!canGoForward}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('date.nextMonth')}
          aria-disabled={!canGoForward}
        >
          <Text style={[styles.nav, !canGoForward && styles.navDisabled]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.week}>
        {orderedWeekdays(weekStart).map((d) => (
          <Text key={d} style={styles.weekday}>
            {weekdaysShort[d]}
          </Text>
        ))}
      </View>

      {monthGrid(month, weekStart).map((week) => (
        <View key={week.find(Boolean) ?? 'empty'} style={styles.week}>
          {week.map((date, i) => {
            if (!date) return <View key={i} style={styles.cell} />;
            const amount = dailySums.get(date) ?? 0;
            const future = date > today;
            const background = fill(future ? 0 : heatLevel(amount, scale));
            return (
              <Pressable
                key={date}
                onPress={() => props.onSelect(date)}
                disabled={future}
                style={[
                  styles.cell,
                  { backgroundColor: background },
                  future && styles.future,
                  date === selected && { borderColor: colors.text, borderWidth: 2 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={props.accessibilityLabelFor(date, amount)}
                aria-selected={date === selected}
              >
                <Text
                  style={[
                    styles.day,
                    { color: inkOn(background, '#FFFFFF', colors.text) },
                    date === today && styles.today,
                  ]}
                >
                  {Number(date.slice(8))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.legendText}>{t('stats.less')}</Text>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <View key={level} style={[styles.swatch, { backgroundColor: fill(level) }]} />
        ))}
        <Text style={styles.legendText}>{t('stats.more')}</Text>
      </View>
      {props.legendNote ? <Text style={styles.note}>{props.legendNote}</Text> : null}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      gap: 2,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
    },
    nav: {
      fontSize: 28,
      lineHeight: 30,
      paddingHorizontal: spacing.md,
      color: c.text,
    },
    navDisabled: {
      opacity: 0.25,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    week: {
      flexDirection: 'row',
      gap: 2,
    },
    weekday: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      color: c.textMuted,
      paddingBottom: spacing.xs,
    },
    cell: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: radius.sm / 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    future: {
      opacity: 0.4,
    },
    day: {
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    today: {
      fontWeight: '800',
      textDecorationLine: 'underline',
    },
    legend: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 3,
      marginTop: spacing.sm,
    },
    swatch: {
      width: 14,
      height: 14,
      borderRadius: 3,
    },
    legendText: {
      fontSize: 12,
      color: c.textMuted,
      marginHorizontal: spacing.xs,
    },
    note: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'right',
    },
  });
}
