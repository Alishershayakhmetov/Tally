import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TaskBadge } from '@/components/TaskBadge';
import { TaskCard } from '@/components/TaskCard';
import { useLive } from '@/db/live';
import { getTask, reorderTasks } from '@/db/repos/tasks';
import { getActiveTimer } from '@/db/repos/timers';
import { useSettings } from '@/db/settings';
import { formatDuration } from '@/domain/measure';
import { moveItem } from '@/domain/order';
import { elapsedMs } from '@/domain/timer';
import { useTicker } from '@/features/counter/Stopwatch';
import { listTaskViews, type TaskView } from '@/features/tasks/taskViews';
import { useNow } from '@/lib/clock';
import { useThemedStyles } from '@/lib/theme';
import { useWeekStart } from '@/lib/weekStart';
import { radius, spacing, type Colors } from '@/theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const weekStart = useWeekStart();
  const nowMs = useNow();
  const views = useLive(() => listTaskViews(nowMs, settings, weekStart));
  const [reordering, setReordering] = useState(false);

  const active = views.filter((v) => v.lifecycle === 'active');
  const finished = views.filter((v) => v.lifecycle === 'finished');
  const archived = views.filter((v) => v.lifecycle === 'archived');

  /** Moves one active task; only it gets a new sort order (domain/order.ts). */
  function move(index: number, direction: -1 | 1) {
    const order = active.map((v) => ({ id: v.task.id, sortOrder: v.task.sortOrder }));
    reorderTasks(moveItem(order, index, direction));
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityRole="button">
              <Text style={styles.headerAction}>{t('home.openSettings')}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 112 }]}>
        <TimerBanner />
        {views.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('home.emptyBody')}</Text>
          </View>
        ) : null}
        {active.length >= 2 || reordering ? (
          <View style={styles.listHeader}>
            {reordering ? <Text style={styles.reorderHint}>{t('home.reorderHint')}</Text> : null}
            <Pressable
              onPress={() => setReordering((on) => !on)}
              hitSlop={8}
              accessibilityRole="button"
              aria-pressed={reordering}
            >
              <Text style={styles.listAction}>{reordering ? t('home.reorderDone') : t('home.reorder')}</Text>
            </Pressable>
          </View>
        ) : null}
        {reordering
          ? active.map((view, index) => (
              <ReorderRow
                key={view.task.id}
                view={view}
                first={index === 0}
                last={index === active.length - 1}
                onMove={(direction) => move(index, direction)}
              />
            ))
          : active.map((view) => <TaskCard key={view.task.id} view={view} />)}
        {reordering ? null : (
          <>
            <Section title={t('home.finished')} views={finished} initiallyOpen />
            <Section title={t('home.archived')} views={archived} initiallyOpen={false} />
          </>
        )}
      </ScrollView>
      {reordering ? null : (
        <Pressable
          onPress={() => router.push('/task/new')}
          style={({ pressed }) => [
            styles.fab,
            { bottom: insets.bottom + spacing.xl },
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('home.newTask')}
        >
          <Text style={styles.fabText}>＋ {t('home.newTask')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ReorderRow(props: {
  view: TaskView;
  first: boolean;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { task } = props.view;
  return (
    <View style={styles.reorderRow}>
      <TaskBadge emoji={task.emoji} name={task.name} color={task.color} size={36} />
      <Text style={styles.reorderName} numberOfLines={1}>
        {task.name}
      </Text>
      <MoveButton
        symbol="↑"
        label={t('home.moveUp', { name: task.name })}
        disabled={props.first}
        onPress={() => props.onMove(-1)}
      />
      <MoveButton
        symbol="↓"
        label={t('home.moveDown', { name: task.name })}
        disabled={props.last}
        onPress={() => props.onMove(1)}
      />
    </View>
  );
}

function MoveButton(props: { symbol: string; label: string; disabled: boolean; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [
        styles.moveButton,
        props.disabled && styles.moveDisabled,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      aria-disabled={props.disabled}
    >
      <Text style={styles.moveSymbol}>{props.symbol}</Text>
    </Pressable>
  );
}

/** A running stopwatch stays visible from Home so it's never forgotten. */
function TimerBanner() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const timer = useLive(getActiveTimer);
  const task = useLive(() => (timer ? getTask(timer.taskId) : undefined));
  const running = timer?.runningSince != null;
  const nowMs = useTicker(running);
  if (!timer || !task) return null;
  const time = formatDuration(Math.floor(elapsedMs(timer, nowMs) / 1000));
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
      style={[styles.timerBanner, { borderColor: task.color }]}
      accessibilityRole="button"
    >
      <Text style={styles.timerText}>
        {running ? '⏱' : '⏸'} {t('home.timerBanner', { name: task.name, time })}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  views,
  initiallyOpen,
}: {
  title: string;
  views: TaskView[];
  initiallyOpen: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(initiallyOpen);
  if (views.length === 0) return null;
  let content: ReactNode = null;
  if (open) content = views.map((view) => <TaskCard key={view.task.id} view={view} />);
  return (
    <>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.sectionHeader}
        accessibilityRole="button"
        aria-expanded={open}
      >
        <Text style={styles.sectionTitle}>
          {title} · {views.length}
        </Text>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {content}
    </>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    timerBanner: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: 2,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    timerText: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    headerAction: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    list: {
      padding: spacing.lg,
      gap: spacing.md,
      flexGrow: 1,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xxl,
    },
    emptyEmoji: {
      fontSize: 48,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    emptyText: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: spacing.md,
    },
    reorderHint: {
      flex: 1,
      fontSize: 13,
      color: c.textMuted,
    },
    listAction: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
      textDecorationLine: 'underline',
    },
    reorderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      paddingVertical: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    reorderName: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    moveButton: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    moveDisabled: {
      opacity: 0.3,
    },
    moveSymbol: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.md,
      paddingVertical: spacing.xs,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    chevron: {
      fontSize: 16,
      color: c.textMuted,
    },
    fab: {
      position: 'absolute',
      right: spacing.xl,
      backgroundColor: c.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      elevation: 4,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    },
    pressed: {
      opacity: 0.8,
    },
    fabText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
