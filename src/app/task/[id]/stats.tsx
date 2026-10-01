import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '@/components/Segmented';
import { TaskBadge } from '@/components/TaskBadge';
import { useLive } from '@/db/live';
import { dailySums } from '@/db/repos/entries';
import { getTask } from '@/db/repos/tasks';
import { useSettings } from '@/db/settings';
import { formatAmount } from '@/domain/measure';
import {
  barSeries,
  defaultGranularity,
  goalLine,
  goalRate,
  heatScale,
  niceAxis,
  summarize,
  type Bar,
  type Granularity,
} from '@/domain/stats';
import type { StreakUnit } from '@/domain/streaks';
import { BarChart } from '@/features/stats/BarChart';
import { HeatCalendar } from '@/features/stats/HeatCalendar';
import { axisTickLabel, barAxisLabel, barLongLabel } from '@/features/stats/labels';
import { buildTaskView, type TaskView } from '@/features/tasks/taskViews';
import { formatDate, formatDay } from '@/i18n/format';
import { useNow } from '@/lib/clock';
import { visibleOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { useWeekStart } from '@/lib/weekStart';
import { radius, spacing, type Colors } from '@/theme';

const UNIT_KEYS: Record<StreakUnit, string> = {
  day: 'stats.days',
  week: 'stats.weeks',
  month: 'stats.months',
};
const RATE_KEYS: Record<StreakUnit, string> = {
  day: 'goal.daysMet',
  week: 'goal.weeksMet',
  month: 'goal.monthsMet',
};

export default function StatsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const settings = useSettings();
  const weekStart = useWeekStart();
  const nowMs = useNow();
  const view = useLive(() => {
    const task = getTask(id);
    return task ? buildTaskView(task, nowMs, settings, weekStart) : undefined;
  });
  const days = useLive(() => dailySums(id));
  if (!view) return null;
  return <Stats view={view} days={days} />;
}

function Stats({ view, days }: { view: TaskView; days: { date: string; total: number }[] }) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const weekStart = useWeekStart();
  const { task, today, streak } = view;
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity(task.recurrence));
  const [pickedBar, setPickedBar] = useState<number | null>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);

  const amount = (n: number) => formatAmount(task.measure, n);
  const withUnit = (n: number) => `${amount(n)}${task.unitLabel ? ` ${task.unitLabel}` : ''}`;
  const summary = summarize(days);

  if (summary.firstDate === null) {
    return (
      <View style={styles.empty}>
        <TaskBadge emoji={task.emoji} name={task.name} color={task.color} size={52} />
        <Text style={styles.emptyText}>{t('stats.empty')}</Text>
      </View>
    );
  }

  const sums = new Map(days.map((d) => [d.date, d.total]));
  const mark = visibleOn(task.color, colors.surface);
  const bars = barSeries(granularity, today, weekStart, sums);
  const goal = goalLine(task, granularity);
  const axis = niceAxis([...bars.map((b) => b.total), goal ?? 0], task.measure);
  const selectedBar = pickedBar ?? bars.length - 1;
  const bar = bars[selectedBar];
  const barText = (b: Bar) => `${barLongLabel(t, granularity, b, today)}: ${withUnit(b.total)}`;
  const rate = goalRate(task, today, weekStart, sums, summary.firstDate);
  const unit: StreakUnit = streak.unit;
  const firstMonth = summary.firstDate < task.startDate ? summary.firstDate : task.startDate;
  const selectedDate = pickedDate ?? today;

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
      <View style={styles.titleRow}>
        <TaskBadge emoji={task.emoji} name={task.name} color={task.color} size={36} />
        <Text style={styles.taskName} numberOfLines={1}>
          {task.name}
        </Text>
      </View>

      <View style={styles.tiles}>
        <Tile label={t('stats.total')} value={amount(summary.total)} note={task.unitLabel} />
        {rate ? (
          <Tile
            label={t('stats.goalMet')}
            value={rate.count > 0 ? `${Math.round((rate.met / rate.count) * 100)}%` : '—'}
            note={t(RATE_KEYS[unit], { met: rate.met, count: rate.count })}
          />
        ) : (
          <Tile
            label={t('stats.progress')}
            value={`${view.goal.progress.percent}%`}
            note={t('stats.ofTarget', { amount: amount(task.target) })}
          />
        )}
        <Tile
          label={t('stats.bestDay')}
          value={summary.bestDay ? amount(summary.bestDay.total) : '—'}
          note={summary.bestDay ? formatDay(t, summary.bestDay.date, today) : null}
        />
        <Tile
          label={t('stats.average')}
          value={summary.averagePerActiveDay !== null ? amount(summary.averagePerActiveDay) : '—'}
          note={null}
        />
        <Tile
          label={t('stats.activeDays')}
          value={String(summary.activeDays)}
          note={t('stats.since', { date: formatDate(t, summary.firstDate, today) })}
        />
        <Tile
          label={t('stats.bestStreak')}
          value={t(UNIT_KEYS[unit], { count: streak.best })}
          note={t('stats.now', { value: t(UNIT_KEYS[unit], { count: streak.current }) })}
        />
      </View>

      <View style={styles.card}>
        <Segmented<Granularity>
          accessibilityLabel={t('stats.range')}
          value={granularity}
          onChange={(value) => {
            setGranularity(value);
            setPickedBar(null);
          }}
          options={[
            { value: 'day', label: t('stats.byDay') },
            { value: 'week', label: t('stats.byWeek') },
            { value: 'month', label: t('stats.byMonth') },
          ]}
        />
        <Text style={styles.caption}>
          {t(`stats.last.${granularity}`)}
          {goal !== null ? ` · ${t('stats.goalLine', { amount: amount(goal) })}` : ''}
        </Text>
        <Text style={styles.readout} accessibilityLiveRegion="polite">
          {barText(bar)}
          {goal !== null && bar.total >= goal ? ' ✓' : ''}
        </Text>
        <BarChart
          bars={bars}
          axis={axis}
          goal={goal}
          color={mark}
          selected={selectedBar}
          onSelect={setPickedBar}
          tickLabel={(value) => axisTickLabel(t, task.measure, value)}
          axisLabel={(b) => barAxisLabel(t, granularity, b, today)}
          accessibilityLabelFor={barText}
        />
        <Pressable onPress={() => setShowTable((v) => !v)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.link}>{showTable ? t('stats.hideTable') : t('stats.showTable')}</Text>
        </Pressable>
        {showTable ? (
          <View>
            {[...bars].reverse().map((b) => (
              <View key={b.period.start} style={styles.tableRow}>
                <Text style={styles.tableLabel}>{barLongLabel(t, granularity, b, today)}</Text>
                <Text style={styles.tableValue}>{amount(b.total)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('stats.calendar')}</Text>
        <Text style={styles.readout} accessibilityLiveRegion="polite">
          {`${formatDay(t, selectedDate, today)}: ${withUnit(sums.get(selectedDate) ?? 0)}`}
        </Text>
        <HeatCalendar
          month={month}
          minMonth={firstMonth.slice(0, 7)}
          maxMonth={today.slice(0, 7)}
          onMonthChange={(next) => {
            setMonth(next);
            setPickedDate(null);
          }}
          weekStart={weekStart}
          today={today}
          dailySums={sums}
          scale={heatScale(task, month, sums)}
          color={mark}
          selected={pickedDate ?? (month === today.slice(0, 7) ? today : null)}
          onSelect={setPickedDate}
          accessibilityLabelFor={(date, n) => `${formatDay(t, date, today)}: ${withUnit(n)}`}
          legendNote={task.recurrence === 'daily' ? t('stats.legendGoal') : null}
        />
      </View>
    </ScrollView>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string | null }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {note ? (
        <Text style={styles.tileNote} numberOfLines={2}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    content: {
      padding: spacing.lg,
      gap: spacing.lg,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
      backgroundColor: c.background,
    },
    emptyText: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    taskName: {
      flex: 1,
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    tiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    tile: {
      flexBasis: '48%',
      flexGrow: 1,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 2,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    tileLabel: {
      fontSize: 13,
      color: c.textMuted,
    },
    tileValue: {
      fontSize: 24,
      fontWeight: '700',
      color: c.text,
    },
    tileNote: {
      fontSize: 12,
      color: c.textMuted,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    caption: {
      fontSize: 13,
      color: c.textMuted,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    readout: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    link: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      textDecorationLine: 'underline',
    },
    tableRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    tableLabel: {
      fontSize: 14,
      color: c.text,
    },
    tableValue: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
  });
}
