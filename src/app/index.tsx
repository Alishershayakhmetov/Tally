import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { TaskCard } from '@/components/TaskCard';
import { TodaySummary } from '@/components/TodaySummary';
import { useLive } from '@/db/live';
import { getTask, reorderTasks } from '@/db/repos/tasks';
import { getActiveTimer } from '@/db/repos/timers';
import { useSettings } from '@/db/settings';
import { formatDuration } from '@/domain/measure';
import { moveItem, moveTo } from '@/domain/order';
import { countdownDisplay, elapsedMs } from '@/domain/timer';
import { todaySummary } from '@/domain/today';
import { formatCountdown, useTicker } from '@/features/counter/TimerPanel';
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
  const scrollableRef = useAnimatedRef<Animated.ScrollView>();

  const active = views.filter((v) => v.lifecycle === 'active');
  const finished = views.filter((v) => v.lifecycle === 'finished');
  const archived = views.filter((v) => v.lifecycle === 'archived');
  const today = todaySummary(active);
  const order = () => active.map((v) => ({ id: v.task.id, sortOrder: v.task.sortOrder }));

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
      <Animated.ScrollView
        ref={scrollableRef}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 112 }]}
      >
        <TimerBanner />
        {today ? <TodaySummary summary={today} /> : null}
        {views.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('home.emptyBody')}</Text>
          </View>
        ) : null}
        {/* Active tasks: hold a card to drag it. Only the moved task gets a new sort order (domain/order.ts). */}
        <Sortable.Grid
          data={active}
          keyExtractor={(view) => view.task.id}
          columns={1}
          rowGap={spacing.md}
          renderItem={({ item, index }) => (
            <TaskCard
              view={item}
              reorder={{
                index,
                count: active.length,
                onMove: (direction) => reorderTasks(moveItem(order(), index, direction)),
              }}
            />
          )}
          onDragEnd={({ fromIndex, toIndex }) => reorderTasks(moveTo(order(), fromIndex, toIndex))}
          scrollableRef={scrollableRef}
          dragActivationDelay={DRAG_DELAY_MS}
          activeItemScale={1.03}
          hapticsEnabled={settings.vibration}
        />
        {active.length >= 2 ? <Text style={styles.dragHint}>{t('home.dragHint')}</Text> : null}
        <Section title={t('home.finished')} views={finished} initiallyOpen />
        <Section title={t('home.archived')} views={archived} initiallyOpen={false} />
      </Animated.ScrollView>
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
    </View>
  );
}

/** A press this long picks a card up; shorter presses scroll the list or open the task. */
const DRAG_DELAY_MS = 350;

/** A running stopwatch or countdown stays visible from Home so it's never forgotten. */
function TimerBanner() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const timer = useLive(getActiveTimer);
  const task = useLive(() => (timer ? getTask(timer.taskId) : undefined));
  const running = timer?.runningSince != null;
  const nowMs = useTicker(running);
  if (!timer || !task) return null;
  const countdown = countdownDisplay(timer, nowMs);
  const time = countdown
    ? formatCountdown(countdown)
    : formatDuration(Math.floor(elapsedMs(timer, nowMs) / 1000));
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
      style={[styles.timerBanner, { borderColor: task.color }]}
      accessibilityRole="button"
    >
      <Text style={styles.timerText}>
        {running ? (countdown ? '⏳' : '⏱') : '⏸'}{' '}
        {t(countdown ? 'home.countdownBanner' : 'home.timerBanner', { name: task.name, time })}
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
    dragHint: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
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
