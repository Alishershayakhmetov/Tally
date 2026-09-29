import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLive } from '@/db/live';
import { getTask, type TaskWithTotal } from '@/db/repos/tasks';
import {
  discardTimer,
  getActiveTimer,
  pauseActiveTimer,
  resumeActiveTimer,
  startTimer,
  stopTimer,
} from '@/db/repos/timers';
import { formatDuration } from '@/domain/measure';
import { elapsedMs } from '@/domain/timer';
import { now } from '@/lib/clock';
import { confirmDestructive } from '@/lib/confirm';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

/** Re-renders every second while `active`, so the display keeps up. */
export function useTicker(active: boolean): number {
  const [tick, setTick] = useState(() => now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick(now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return active ? now() : tick;
}

/**
 * Pausing can unmount this before the wake lock finishes activating; without
 * suppressDeactivateWarnings the release then throws (seen on web; possible on Android).
 */
function KeepScreenOn() {
  useKeepAwake('stopwatch', { suppressDeactivateWarnings: true });
  return null;
}

type Props = {
  task: TaskWithTotal;
  disabled: boolean;
  onLogged: (entryId: string, seconds: number) => void;
};

export function Stopwatch({ task, disabled, onLogged }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const timer = useLive(getActiveTimer);
  const other = useLive(() => (timer && timer.taskId !== task.id ? getTask(timer.taskId) : undefined));
  const mine = timer?.taskId === task.id ? timer : undefined;
  const running = mine?.runningSince != null;
  const nowMs = useTicker(running);

  if (other) {
    return <Text style={styles.note}>{t('counter.otherTimer', { name: other.name })}</Text>;
  }

  if (!mine) {
    return (
      <Pressable
        onPress={() => startTimer(task.id)}
        disabled={disabled}
        style={[styles.primary, { backgroundColor: task.color }, disabled && styles.disabled]}
        accessibilityRole="button"
      >
        <Text style={styles.primaryText}>⏱ {t('counter.start')}</Text>
      </Pressable>
    );
  }

  async function discard() {
    if (await confirmDestructive(t('counter.discardTitle'), t('counter.discardBody'), t('counter.discard'))) {
      discardTimer();
    }
  }

  function stop() {
    const logged = stopTimer(task.dayStartMin);
    if (logged) onLogged(logged.entryId, logged.seconds);
  }

  return (
    <View style={styles.panel} accessibilityLabel={t('counter.timerLabel')}>
      {running ? <KeepScreenOn /> : null}
      <Text style={styles.elapsed} accessibilityRole="timer">
        {formatDuration(Math.floor(elapsedMs(mine, nowMs) / 1000))}
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => (running ? pauseActiveTimer() : resumeActiveTimer())}
          style={styles.secondary}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{running ? t('counter.pause') : t('counter.resume')}</Text>
        </Pressable>
        <Pressable
          onPress={stop}
          style={[styles.primary, styles.grow, { backgroundColor: task.color }]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{t('counter.stop')}</Text>
        </Pressable>
      </View>
      <Pressable onPress={discard} hitSlop={8} accessibilityRole="button">
        <Text style={styles.discard}>{t('counter.discard')}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    panel: {
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    elapsed: {
      fontSize: 48,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignSelf: 'stretch',
    },
    grow: {
      flex: 1,
    },
    primary: {
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      alignItems: 'center',
    },
    primaryText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    secondary: {
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.xl,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    secondaryText: {
      color: c.text,
      fontSize: 16,
      fontWeight: '600',
    },
    disabled: {
      opacity: 0.4,
    },
    discard: {
      color: c.danger,
      fontSize: 14,
      fontWeight: '600',
    },
    note: {
      textAlign: 'center',
      fontSize: 14,
      color: c.textMuted,
    },
  });
}
