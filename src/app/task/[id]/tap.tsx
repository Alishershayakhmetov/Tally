import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLive } from '@/db/live';
import { getTask } from '@/db/repos/tasks';
import { useSettings } from '@/db/settings';
import { formatProgressLine } from '@/domain/format';
import { useCounter } from '@/features/counter/useCounter';
import { windowLabel } from '@/features/tasks/goalText';
import { buildTaskView, type TaskView } from '@/features/tasks/taskViews';
import { useNow } from '@/lib/clock';
import { inkOn } from '@/lib/contrast';
import { useThemedStyles } from '@/lib/theme';
import { useWeekStart } from '@/lib/weekStart';
import { radius, spacing, type Colors } from '@/theme';

// Tap mode (Phase 6): the whole screen is one +1 button, for logging in the
// middle of a set (tap with your nose during push-ups). Taps go through the
// same counter as the buttons, so fast taps merge into one entry.

export default function TapScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const settings = useSettings();
  const weekStart = useWeekStart();
  const nowMs = useNow();
  const view = useLive(() => {
    const task = getTask(id);
    return task ? buildTaskView(task, nowMs, settings, weekStart) : undefined;
  });

  if (!view) {
    return (
      <View style={styles.missing}>
        <Text style={styles.muted}>{t('counter.missing')}</Text>
      </View>
    );
  }
  return <TapCounter view={view} />;
}

function TapCounter({ view }: { view: TaskView }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  useKeepAwake('tap-mode', { suppressDeactivateWarnings: true });
  const { task, goal, lifecycle } = view;
  const { progress } = goal;
  const { logButton } = useCounter(task, progress.total);
  /** Net taps since this screen opened. */
  const [set, setSet] = useState(0);
  const canLog = lifecycle === 'active';
  const ink = inkOn(task.color, '#FFFFFF', '#111111');

  function tap(delta: 1 | -1) {
    logButton(delta);
    setSet((n) => n + delta);
  }

  const period = windowLabel(t, task.recurrence);
  const progressLine = formatProgressLine(progress.total, progress.target, task.unitLabel, task.measure);

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + spacing.lg }]}>
      <Pressable
        onPress={() => tap(1)}
        disabled={!canLog}
        style={({ pressed }) => [
          styles.area,
          { backgroundColor: task.color },
          pressed && styles.pressed,
          !canLog && styles.disabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('counter.add', { count: 1 })}
        accessibilityHint={t('tap.areaHint', { n: set })}
        testID="tap-area"
      >
        <Text style={[styles.name, { color: ink }]} numberOfLines={1}>
          {task.emoji ? `${task.emoji} ${task.name}` : task.name}
        </Text>
        <Text style={[styles.setLabel, { color: ink }]}>{t('tap.thisSet')}</Text>
        <Text style={[styles.set, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>
          {set}
        </Text>
        <Text style={[styles.progress, { color: ink }]}>
          {progress.done ? '✓ ' : ''}
          {period ? `${period[0].toUpperCase()}${period.slice(1)}: ` : ''}
          {progressLine}
        </Text>
        {set === 0 ? <Text style={[styles.hint, { color: ink }]}>{t('tap.hint')}</Text> : null}
      </Pressable>
      <View style={styles.bar}>
        <Pressable
          onPress={() => tap(-1)}
          disabled={!canLog}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={t('counter.subtract', { count: 1 })}
        >
          <Text style={styles.secondaryText}>−1</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.secondary, styles.grow, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{t('tap.done')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.background,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.md,
    },
    missing: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },
    muted: {
      fontSize: 16,
      color: c.textMuted,
    },
    area: {
      flex: 1,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.sm,
    },
    pressed: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.4,
    },
    name: {
      fontSize: 18,
      fontWeight: '700',
    },
    setLabel: {
      marginTop: spacing.lg,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    set: {
      fontSize: 140,
      lineHeight: 160,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    progress: {
      fontSize: 17,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    hint: {
      marginTop: spacing.lg,
      fontSize: 15,
      textAlign: 'center',
    },
    bar: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    grow: {
      flex: 1,
    },
    secondary: {
      minWidth: 88,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingVertical: spacing.lg,
      alignItems: 'center',
    },
    secondaryText: {
      fontSize: 18,
      fontWeight: '700',
      color: c.text,
    },
  });
}
