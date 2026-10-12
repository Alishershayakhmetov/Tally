import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import Sortable from 'react-native-sortables';

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

/** A card on Home's draggable list: its place, and how to move it one step (screen readers). */
export type CardReorder = { index: number; count: number; onMove: (direction: -1 | 1) => void };

export function TaskCard({ view, reorder }: { view: TaskView; reorder?: CardReorder }) {
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
  const open = () => router.push({ pathname: '/task/[id]', params: { id: task.id } });
  const label = [
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
    .join(', ');

  const body = (
    <>
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
    </>
  );

  if (reorder) {
    return (
      <SortableCard label={label} name={task.name} reorder={reorder} onOpen={open}>
        {body}
      </SortableCard>
    );
  }
  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [styles.card, !active && styles.inactive, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {body}
    </Pressable>
  );
}

/**
 * A card inside Sortable.Grid (Home): a tap opens the task, a long press picks
 * it up to drag. Taps go through Sortable.Touchable so they don't fight the
 * drag gesture. Screen readers get "move up/down" actions instead of dragging.
 */
function SortableCard(props: {
  label: string;
  name: string;
  reorder: CardReorder;
  onOpen: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [pressed, setPressed] = useState(false);
  const { index, count, onMove } = props.reorder;
  const actions = [
    { name: 'activate' },
    ...(index > 0 ? [{ name: 'moveUp', label: t('home.moveUp', { name: props.name }) }] : []),
    ...(index < count - 1 ? [{ name: 'moveDown', label: t('home.moveDown', { name: props.name }) }] : []),
  ];

  function onAction(event: AccessibilityActionEvent) {
    const action = event.nativeEvent.actionName;
    if (action === 'activate') props.onOpen();
    else if (action === 'moveUp') onMove(-1);
    else if (action === 'moveDown') onMove(1);
  }

  return (
    <Sortable.Touchable
      onTap={props.onOpen}
      onTouchesDown={() => setPressed(true)}
      onTouchesUp={() => setPressed(false)}
      style={[styles.card, pressed && styles.held]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={t('home.dragHint')}
      accessibilityActions={actions}
      onAccessibilityAction={onAction}
    >
      {props.children}
    </Sortable.Touchable>
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
    // A draggable card stays opaque while held, so it doesn't fade once it's lifted.
    held: {
      backgroundColor: c.track,
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
