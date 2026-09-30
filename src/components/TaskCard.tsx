import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatProgressLine } from '@/domain/format';
import { formatAmount } from '@/domain/measure';
import {
  deadlineText,
  endedStatusText,
  showsStreakBadge,
  statusText,
  streakLabel,
  windowLabel,
} from '@/features/tasks/goalText';
import type { TaskView } from '@/features/tasks/taskViews';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

import { ProgressBar } from './ProgressBar';
import { TaskBadge } from './TaskBadge';

export function TaskCard({ view }: { view: TaskView }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { task, goal, lifecycle, summary } = view;
  const { progress, restDay } = goal;
  const active = lifecycle === 'active';

  // An ended repeating goal has no meaningful current period, so show its all-time total.
  const progressLine =
    !active && task.recurrence !== 'none'
      ? `${t('goal.allTime', { amount: formatAmount(task.measure, task.total) })}${task.unitLabel ? ` · ${task.unitLabel}` : ''}`
      : formatProgressLine(progress.total, progress.target, task.unitLabel, task.measure);
  const badge = showsStreakBadge(view);
  const subline = active
    ? [windowLabel(t, task.recurrence), deadlineText(t, view), badge ? `🔥 ${view.streak.current}` : null]
        .filter(Boolean)
        .join(' · ')
    : lifecycle === 'finished'
      ? endedStatusText(t, view)
      : [t('goal.archivedLabel'), endedStatusText(t, view)].join(' · ');
  const fraction = summary && summary.total > 0 ? summary.met / summary.total : progress.fraction;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
      style={({ pressed }) => [styles.card, !active && styles.inactive, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={[
        task.name,
        progressLine,
        active
          ? [windowLabel(t, task.recurrence), deadlineText(t, view), badge ? streakLabel(t, view) : null]
              .filter(Boolean)
              .join(', ')
          : subline,
        active ? statusText(t, view) : null,
      ]
        .filter(Boolean)
        .join(', ')}
    >
      <View style={styles.row}>
        <TaskBadge emoji={task.emoji} name={task.name} color={task.color} />
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {task.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {progressLine}
          </Text>
          {subline ? (
            <Text style={styles.sub} numberOfLines={1}>
              {subline}
            </Text>
          ) : null}
        </View>
        {active ? (
          restDay && !progress.done ? (
            <Text style={styles.remaining}>{t('goal.restDay')}</Text>
          ) : progress.done ? (
            <Text style={[styles.status, styles.done]}>✓ {progress.percent}%</Text>
          ) : (
            <View style={styles.statusBox}>
              <Text style={styles.status}>{progress.percent}%</Text>
              <Text style={styles.remaining}>
                {t('goal.left', { amount: formatAmount(task.measure, progress.remaining) })}
              </Text>
            </View>
          )
        ) : null}
      </View>
      <ProgressBar fraction={fraction} color={task.color} />
    </Pressable>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    inactive: {
      opacity: 0.75,
    },
    pressed: {
      opacity: 0.6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    text: {
      flex: 1,
      gap: 2,
    },
    name: {
      fontSize: 17,
      fontWeight: '600',
      color: c.text,
    },
    meta: {
      fontSize: 14,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    sub: {
      fontSize: 13,
      color: c.textMuted,
    },
    statusBox: {
      alignItems: 'flex-end',
    },
    status: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    done: {
      color: c.positive,
    },
    remaining: {
      fontSize: 12,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
  });
}
