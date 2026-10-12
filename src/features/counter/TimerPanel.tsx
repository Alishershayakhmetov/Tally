import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AmountDialog } from '@/components/AmountDialog';
import { Segmented } from '@/components/Segmented';
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
import { parseCountdown } from '@/domain/input';
import { formatDuration } from '@/domain/measure';
import { countdownDisplay, elapsedMs, stepCountdown, type CountdownDisplay } from '@/domain/timer';
import { now } from '@/lib/clock';
import { confirmDestructive } from '@/lib/confirm';
import { textOn } from '@/lib/contrast';
import { goalReachedFeedback } from '@/lib/haptics';
import { useColors, useThemedStyles } from '@/lib/theme';
import { useNotificationPermission } from '@/notifications/scheduler';
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

/** "4:12" while counting down, "+0:12" in overtime. */
export function formatCountdown(display: CountdownDisplay): string {
  return display.overtime ? `+${formatDuration(display.seconds)}` : formatDuration(display.seconds);
}

/**
 * Pausing can unmount this before the wake lock finishes activating; without
 * suppressDeactivateWarnings the release then throws (seen on web; possible on Android).
 */
function KeepScreenOn() {
  useKeepAwake('stopwatch', { suppressDeactivateWarnings: true });
  return null;
}

type Mode = 'stopwatch' | 'countdown';

/** The mode and a typed length per task, kept while the app runs. */
const remembered = new Map<string, { mode: Mode; seconds: number | null }>();

const STEP_SECONDS = 60;

type Props = {
  task: TaskWithTotal;
  disabled: boolean;
  /** What a new countdown starts at, from the goal (defaultCountdownSeconds). */
  defaultCountdown: number;
  onLogged: (entryId: string, seconds: number) => void;
};

export function TimerPanel({ task, disabled, defaultCountdown, onLogged }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const colors = useColors();
  const timer = useLive(getActiveTimer);
  const other = useLive(() => (timer && timer.taskId !== task.id ? getTask(timer.taskId) : undefined));
  const mine = timer?.taskId === task.id ? timer : undefined;
  const running = mine?.runningSince != null;
  const nowMs = useTicker(running);
  const [mode, setMode] = useState<Mode>(() => remembered.get(task.id)?.mode ?? 'stopwatch');
  const [typed, setTyped] = useState<number | null>(() => remembered.get(task.id)?.seconds ?? null);
  const [editing, setEditing] = useState(false);
  const [permission, requestPermission] = useNotificationPermission();

  const display = mine ? countdownDisplay(mine, nowMs) : null;
  const overtime = display?.overtime ?? false;
  const wasOvertime = useRef(overtime);
  useEffect(() => {
    // The notification is the real alert; this is for when the screen is open.
    if (overtime && !wasOvertime.current && running) goalReachedFeedback();
    wasOvertime.current = overtime;
  }, [overtime, running]);

  if (other) {
    return <Text style={styles.note}>{t('counter.otherTimer', { name: other.name })}</Text>;
  }

  if (!mine) {
    const length = typed ?? defaultCountdown;
    const choose = (next: { mode?: Mode; seconds?: number }) => {
      const value = { mode: next.mode ?? mode, seconds: next.seconds ?? typed };
      remembered.set(task.id, value);
      setMode(value.mode);
      setTyped(value.seconds);
    };
    const less = stepCountdown(length, -STEP_SECONDS);
    const more = stepCountdown(length, STEP_SECONDS);
    const alertHint =
      permission === 'denied'
        ? t('countdown.noAlert')
        : permission === 'unavailable'
          ? t('countdown.noAlertWeb')
          : null;

    async function start() {
      if (mode === 'stopwatch') {
        startTimer(task.id);
        return;
      }
      startTimer(task.id, length * 1000);
      // Asked on the first countdown, like reminders: the alert at 0:00 is a notification.
      if (permission === 'undetermined') await requestPermission();
    }

    return (
      <View style={[styles.panel, disabled && styles.disabled]} pointerEvents={disabled ? 'none' : 'auto'}>
        <View style={styles.stretch}>
          <Segmented
            options={[
              { value: 'stopwatch', label: t('countdown.stopwatch') },
              { value: 'countdown', label: t('countdown.countdown') },
            ]}
            value={mode}
            onChange={(value) => choose({ mode: value })}
            accessibilityLabel={t('countdown.mode')}
          />
        </View>
        {mode === 'countdown' ? (
          <View style={styles.lengthRow}>
            <StepButton
              label={`−1 ${t('counter.min')}`}
              accessibilityLabel={t('countdown.less')}
              disabled={less === null}
              onPress={() => less !== null && choose({ seconds: less })}
            />
            <Pressable
              onPress={() => setEditing(true)}
              style={styles.lengthButton}
              accessibilityRole="button"
              accessibilityLabel={t('countdown.lengthLabel', { time: formatDuration(length) })}
              accessibilityHint={t('countdown.editHint')}
            >
              <Text style={styles.length}>{formatDuration(length)}</Text>
            </Pressable>
            <StepButton
              label={`+1 ${t('counter.min')}`}
              accessibilityLabel={t('countdown.more')}
              disabled={more === null}
              onPress={() => more !== null && choose({ seconds: more })}
            />
          </View>
        ) : null}
        <Pressable
          onPress={start}
          disabled={disabled}
          style={[styles.primary, styles.stretch, { backgroundColor: task.color }]}
          accessibilityRole="button"
        >
          <Text style={[styles.primaryText, { color: textOn(task.color) }]}>
            {mode === 'countdown' ? `⏳ ${t('countdown.start')}` : `⏱ ${t('counter.start')}`}
          </Text>
        </Pressable>
        {mode === 'countdown' && alertHint ? <Text style={styles.note}>{alertHint}</Text> : null}
        {editing ? (
          <AmountDialog
            title={t('countdown.length')}
            measure="duration"
            initialText={formatDuration(length)}
            hint={t('countdown.lengthHint')}
            parse={parseCountdown}
            signed={false}
            submitLabel={t('countdown.set')}
            color={task.color}
            onSubmit={(seconds) => choose({ seconds })}
            onClose={() => setEditing(false)}
          />
        ) : null}
      </View>
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

  const countdownLength = mine.countdownMs != null ? formatDuration(Math.round(mine.countdownMs / 1000)) : '';
  return (
    <View
      style={styles.panel}
      accessibilityLabel={display ? t('countdown.countdown') : t('counter.timerLabel')}
    >
      {running ? <KeepScreenOn /> : null}
      {display ? (
        <Text style={[styles.caption, overtime && { color: colors.positive }]}>
          {overtime
            ? t('countdown.overtime', { time: countdownLength })
            : t('countdown.caption', { time: countdownLength })}
        </Text>
      ) : null}
      <Text style={[styles.elapsed, overtime && { color: colors.positive }]} accessibilityRole="timer">
        {display ? formatCountdown(display) : formatDuration(Math.floor(elapsedMs(mine, nowMs) / 1000))}
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
          <Text style={[styles.primaryText, { color: textOn(task.color) }]}>{t('counter.stop')}</Text>
        </Pressable>
      </View>
      <Pressable onPress={discard} hitSlop={8} accessibilityRole="button">
        <Text style={styles.discard}>{t('counter.discard')}</Text>
      </Pressable>
    </View>
  );
}

function StepButton(props: {
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={({ pressed }) => [styles.step, props.disabled && styles.stepDisabled, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel}
      aria-disabled={props.disabled}
    >
      <Text style={styles.stepText}>{props.label}</Text>
    </Pressable>
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
    stretch: {
      alignSelf: 'stretch',
    },
    caption: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    elapsed: {
      fontSize: 48,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    lengthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    lengthButton: {
      minWidth: 120,
      alignItems: 'center',
      paddingVertical: spacing.xs,
      borderBottomWidth: 2,
      borderBottomColor: c.border,
    },
    length: {
      fontSize: 36,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    step: {
      minWidth: 72,
      minHeight: 44,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDisabled: {
      opacity: 0.3,
    },
    stepText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    pressed: {
      opacity: 0.75,
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
