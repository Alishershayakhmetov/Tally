import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TaskWithTotal } from '@/db/repos/tasks';
import { formatProgressLine, formatStatusLine } from '@/domain/format';
import { computeProgress } from '@/domain/progress';
import { colors, radius, spacing } from '@/theme';

import { ProgressBar } from './ProgressBar';
import { TaskBadge } from './TaskBadge';

export function TaskCard({ task }: { task: TaskWithTotal }) {
  const progress = computeProgress(task.total, task.target);
  const progressLine = formatProgressLine(task.total, task.target, task.unitLabel);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${task.name}, ${progressLine}, ${formatStatusLine(task.total, task.target)}`}
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
        </View>
        {progress.done ? (
          <Text style={[styles.status, { color: colors.positive }]}>✓ {progress.percent}%</Text>
        ) : (
          <View style={styles.statusBox}>
            <Text style={styles.status}>{progress.percent}%</Text>
            <Text style={styles.remaining}>{progress.remaining} left</Text>
          </View>
        )}
      </View>
      <ProgressBar fraction={progress.fraction} color={task.color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
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
    color: colors.text,
  },
  meta: {
    fontSize: 14,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  statusBox: {
    alignItems: 'flex-end',
  },
  status: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  remaining: {
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
});
