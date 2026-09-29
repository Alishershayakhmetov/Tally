import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountDialog } from '@/components/AmountDialog';
import { ProgressBar } from '@/components/ProgressBar';
import { TaskBadge } from '@/components/TaskBadge';
import { UndoBar } from '@/components/UndoBar';
import { useLive } from '@/db/live';
import { listRecentEntries } from '@/db/repos/entries';
import { getTask, softDeleteTask, type TaskWithTotal } from '@/db/repos/tasks';
import type { Entry } from '@/db/schema';
import { getGlobalDayStartMin } from '@/db/settings';
import { effectiveDayStart } from '@/domain/days';
import { formatClock, formatCount, formatDayLabel, formatSigned, formatStatusLine } from '@/domain/format';
import { computeProgress } from '@/domain/progress';
import { useCounter } from '@/features/counter/useCounter';
import { confirmDestructive } from '@/lib/confirm';
import { useLogicalToday } from '@/lib/useLogicalToday';
import { colors, radius, spacing } from '@/theme';

export default function CounterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = useLive(() => getTask(id));

  if (!task) {
    return (
      <View style={styles.missing}>
        <Text style={styles.muted}>This task no longer exists.</Text>
      </View>
    );
  }
  return <Counter task={task} />;
}

function Counter({ task }: { task: TaskWithTotal }) {
  const insets = useSafeAreaInsets();
  const recent = useLive(() => listRecentEntries(task.id));
  const { logButton, logManual, deleteEntry, undo, dismissUndo, lastChange } = useCounter(task);
  const [dialogOpen, setDialogOpen] = useState(false);

  const today = useLogicalToday(effectiveDayStart(task.dayStartMin, getGlobalDayStartMin()));

  const progress = computeProgress(task.total, task.target);
  const columns = task.increments.length <= 4 ? 2 : 3;
  const unit = task.unitLabel ? ` ${task.unitLabel}` : '';

  async function confirmDeleteTask() {
    const ok = await confirmDestructive(
      `Delete “${task.name}”?`,
      'The task and its history will be removed from this device.',
      'Delete',
    );
    if (!ok) return;
    softDeleteTask(task.id);
    router.back();
  }

  async function confirmDeleteEntry(entry: Entry) {
    const ok = await confirmDestructive(
      `Delete ${formatSigned(entry.amount)}${unit}?`,
      `Logged ${formatDayLabel(entry.localDate, today).toLowerCase()} at ${formatClock(entry.occurredAt, entry.utcOffsetMin)}.`,
      'Delete',
    );
    if (ok) deleteEntry(entry.id);
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: task.name,
          headerRight: () => (
            <Pressable onPress={confirmDeleteTask} hitSlop={12} accessibilityRole="button">
              <Text style={styles.headerAction}>Delete</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        <View style={styles.hero}>
          <TaskBadge emoji={task.emoji} name={task.name} color={task.color} size={52} />
          <Text
            style={[styles.total, task.total < 0 && { color: colors.danger }]}
            accessibilityLabel={`Total ${task.total}`}
          >
            {formatCount(task.total)}
          </Text>
          <Text style={styles.muted}>
            of {task.target}
            {unit}
          </Text>
          <View style={styles.barWrap}>
            <ProgressBar fraction={progress.fraction} color={task.color} height={12} />
          </View>
          <Text style={[styles.status, progress.done && { color: colors.positive }]}>
            {progress.done ? '✓ ' : ''}
            {formatStatusLine(task.total, task.target)}
          </Text>
        </View>

        <View style={styles.pad}>
          {task.increments.map((delta) => (
            <Pressable
              key={delta}
              onPress={() => logButton(delta)}
              style={({ pressed }) => [
                styles.padButton,
                { flexBasis: columns === 2 ? '47%' : '30%' },
                delta > 0
                  ? { backgroundColor: task.color }
                  : { borderColor: task.color, borderWidth: 2, backgroundColor: colors.surface },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${delta > 0 ? 'Add' : 'Subtract'} ${Math.abs(delta)}`}
            >
              <Text style={[styles.padText, { color: delta > 0 ? '#FFFFFF' : task.color }]}>
                {formatSigned(delta)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => setDialogOpen(true)}
          style={({ pressed }) => [styles.enterAmount, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={[styles.enterAmountText, { color: task.color }]}>Enter amount…</Text>
        </Pressable>

        <View style={styles.recent}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {recent.length === 0 ? (
            <Text style={styles.muted}>Nothing logged yet.</Text>
          ) : (
            <>
              {recent.map((entry) => (
                <Pressable
                  key={entry.id}
                  onLongPress={() => confirmDeleteEntry(entry)}
                  style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}
                  accessibilityHint="Long-press to delete"
                >
                  <Text style={[styles.entryAmount, entry.amount < 0 && { color: colors.danger }]}>
                    {formatSigned(entry.amount)}
                  </Text>
                  <Text style={styles.entryWhen}>
                    {formatDayLabel(entry.localDate, today)} ·{' '}
                    {formatClock(entry.occurredAt, entry.utcOffsetMin)}
                  </Text>
                  {entry.source === 'manual' ? <Text style={styles.entryTag}>typed</Text> : null}
                </Pressable>
              ))}
              <Text style={styles.hint}>Long-press an entry to delete it.</Text>
            </>
          )}
        </View>
      </ScrollView>

      {lastChange ? (
        <UndoBar
          message={`${formatSigned(lastChange.amount)}${unit} logged`}
          resetKey={`${lastChange.entryId}:${lastChange.amount}`}
          bottomInset={insets.bottom}
          onUndo={undo}
          onTimeout={dismissUndo}
        />
      ) : null}

      <AmountDialog
        visible={dialogOpen}
        unitLabel={task.unitLabel}
        color={task.color}
        onSubmit={logManual}
        onClose={() => setDialogOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAction: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  total: {
    fontSize: 72,
    fontWeight: '800',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    lineHeight: 84,
  },
  muted: {
    fontSize: 16,
    color: colors.textMuted,
  },
  barWrap: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  status: {
    marginTop: spacing.xs,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
  },
  padButton: {
    flexGrow: 1,
    height: 76,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padText: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pressed: {
    opacity: 0.75,
  },
  enterAmount: {
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  enterAmountText: {
    fontSize: 16,
    fontWeight: '700',
  },
  recent: {
    gap: spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  entryPressed: {
    backgroundColor: colors.track,
  },
  entryAmount: {
    minWidth: 64,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  entryWhen: {
    flex: 1,
    fontSize: 14,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  entryTag: {
    fontSize: 12,
    color: colors.textMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
  hint: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
