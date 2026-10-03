import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountDialog } from '@/components/AmountDialog';
import { NoteDialog } from '@/components/NoteDialog';
import { ProgressBar } from '@/components/ProgressBar';
import { TaskBadge } from '@/components/TaskBadge';
import { UndoBar } from '@/components/UndoBar';
import { useLive } from '@/db/live';
import { listRecentEntries, setEntryNote } from '@/db/repos/entries';
import { getTask, setArchived } from '@/db/repos/tasks';
import type { Entry } from '@/db/schema';
import { useSettings } from '@/db/settings';
import { formatClock, formatSigned } from '@/domain/format';
import { buttonAmount, formatAmount, formatSignedAmount } from '@/domain/measure';
import { defaultCountdownSeconds } from '@/domain/timer';
import { SourceTag } from '@/features/counter/SourceTag';
import { TimerPanel } from '@/features/counter/TimerPanel';
import { useCounter } from '@/features/counter/useCounter';
import { useNoteSuggestions } from '@/features/counter/useNoteSuggestions';
import {
  deadlineText,
  endedStatusText,
  endedSuccessfully,
  paceText,
  statusText,
  streakText,
  windowLabel,
} from '@/features/tasks/goalText';
import { buildTaskView, type TaskView } from '@/features/tasks/taskViews';
import { formatDate, formatDay } from '@/i18n/format';
import { useNow } from '@/lib/clock';
import { confirmDestructive } from '@/lib/confirm';
import { readableOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { useWeekStart } from '@/lib/weekStart';
import { radius, spacing, type Colors } from '@/theme';

export default function CounterScreen() {
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
  return <Counter view={view} />;
}

function Counter({ view }: { view: TaskView }) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { task, goal, lifecycle, today } = view;
  const { progress } = goal;
  const recent = useLive(() => listRecentEntries(task.id, 10));
  const { logButton, logManual, recordLogged, deleteEntry, undo, dismissUndo, lastChange } = useCounter(
    task,
    progress.total,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<Entry | null>(null);
  const noteSuggestions = useNoteSuggestions();

  const canLog = lifecycle === 'active';
  const isTime = task.measure === 'duration';
  const amount = (n: number) => formatAmount(task.measure, n);
  const signed = (n: number) => formatSignedAmount(task.measure, n);
  const columns = task.increments.length <= 4 ? 2 : 3;
  const unit = task.unitLabel ? ` ${task.unitLabel}` : '';
  const accentText = readableOn(task.color, colors.surface, colors.text);
  const deadline = deadlineText(t, view);
  const pace = paceText(t, view);
  const streak = streakText(t, view);
  const unitSuffix = task.unitLabel ? ` · ${task.unitLabel}` : '';

  // An ended repeating goal has no meaningful "today", so it shows its whole history.
  const endedRepeating = !canLog && task.recurrence !== 'none';
  const hero = endedRepeating
    ? {
        label: t('goal.allTimeLabel'),
        total: task.total,
        subline: task.unitLabel,
        fraction: view.summary && view.summary.total > 0 ? view.summary.met / view.summary.total : 0,
        status: endedStatusText(t, view),
        success: endedSuccessfully(view),
      }
    : {
        label: windowLabel(t, task.recurrence),
        total: progress.total,
        subline: `${t('counter.of', { target: amount(task.target) })}${unitSuffix}`,
        fraction: progress.fraction,
        status: !canLog
          ? endedStatusText(t, view)
          : goal.restDay && !progress.done
            ? `${t('goal.restDay')} · ${t('goal.restDayHint')}`
            : statusText(t, view),
        success: progress.done,
      };

  /** "+10 · Today · 18:42" */
  function describeEntry(entry: Entry): string {
    const time = formatClock(entry.occurredAt, entry.utcOffsetMin);
    return `${signed(entry.amount)}${unit} · ${formatDay(t, entry.localDate, today)} · ${time}`;
  }

  function noteLastChange() {
    const entry = lastChange ? recent.find((e) => e.id === lastChange.entryId) : undefined;
    dismissUndo();
    if (entry) setNoteFor(entry);
  }

  async function confirmDeleteEntry(entry: Entry) {
    const ok = await confirmDestructive(
      t('counter.deleteEntryTitle', { amount: `${signed(entry.amount)}${unit}` }),
      t('counter.deleteEntryBody', {
        day: formatDay(t, entry.localDate, today).toLowerCase(),
        time: formatClock(entry.occurredAt, entry.utcOffsetMin),
      }),
      t('common.delete'),
    );
    if (ok) deleteEntry(entry.id);
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: task.name,
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/task/[id]/edit', params: { id: task.id } })}
              hitSlop={12}
              accessibilityRole="button"
            >
              <Text style={styles.headerAction}>{t('common.edit')}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        {lifecycle === 'finished' && task.endDate ? (
          <View style={styles.bannerRow}>
            <Text style={[styles.banner, styles.bannerText]}>
              {t('counter.finishedBanner', { date: formatDate(t, task.endDate, today) })}
            </Text>
            <Pressable
              onPress={() => router.push({ pathname: '/task/new', params: { from: task.id } })}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.headerAction}>{t('restart.action')}</Text>
            </Pressable>
          </View>
        ) : null}
        {lifecycle === 'archived' ? (
          <View style={styles.bannerRow}>
            <Text style={[styles.banner, styles.bannerText]}>{t('counter.archivedBanner')}</Text>
            <Pressable onPress={() => setArchived(task.id, false)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.headerAction}>{t('form.unarchive')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.hero}>
          <TaskBadge emoji={task.emoji} name={task.name} color={task.color} size={52} />
          {hero.label ? <Text style={styles.window}>{hero.label}</Text> : null}
          <Text
            style={[styles.total, hero.total < 0 && { color: colors.danger }]}
            accessibilityLabel={t('counter.total', { count: hero.total })}
          >
            {amount(hero.total)}
          </Text>
          {hero.subline ? <Text style={styles.muted}>{hero.subline}</Text> : null}
          <View style={styles.barWrap}>
            <ProgressBar fraction={hero.fraction} color={task.color} height={12} />
          </View>
          <Text style={[styles.status, hero.success && { color: colors.positive }]}>
            {hero.success ? '✓ ' : ''}
            {hero.status}
          </Text>
          {deadline && canLog ? <Text style={styles.muted}>{deadline}</Text> : null}
          {pace ? <Text style={styles.pace}>{pace}</Text> : null}
          {task.recurrence !== 'none' && canLog ? (
            <Text style={styles.allTime}>{t('goal.allTime', { amount: amount(task.total) })}</Text>
          ) : null}
          {streak ? <Text style={styles.allTime}>{streak}</Text> : null}
        </View>

        {isTime ? (
          <TimerPanel
            task={task}
            disabled={!canLog}
            defaultCountdown={defaultCountdownSeconds({
              recurrence: task.recurrence,
              target: task.target,
              remaining: progress.remaining,
              pacePerDay: view.pace?.perDay ?? null,
            })}
            onLogged={recordLogged}
          />
        ) : null}

        <View style={[styles.pad, !canLog && styles.disabled]} pointerEvents={canLog ? 'auto' : 'none'}>
          {task.increments.map((delta) => (
            <Pressable
              key={delta}
              onPress={() => logButton(buttonAmount(task.measure, delta))}
              disabled={!canLog}
              style={({ pressed }) => [
                styles.padButton,
                { flexBasis: columns === 2 ? '47%' : '30%' },
                delta > 0
                  ? { backgroundColor: task.color }
                  : { borderColor: task.color, borderWidth: 2, backgroundColor: colors.surface },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${
                delta > 0
                  ? t('counter.add', { count: delta })
                  : t('counter.subtract', { count: Math.abs(delta) })
              }${isTime ? ` ${t('counter.min')}` : ''}`}
            >
              <Text style={[styles.padText, { color: delta > 0 ? '#FFFFFF' : accentText }]}>
                {formatSigned(delta)}
              </Text>
              {isTime ? (
                <Text style={[styles.padUnit, { color: delta > 0 ? '#FFFFFF' : accentText }]}>
                  {t('counter.min')}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>

        {canLog ? (
          <View style={styles.pills}>
            <Pressable
              onPress={() => setDialogOpen(true)}
              style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={[styles.pillText, { color: accentText }]}>{t('counter.enterAmount')}</Text>
            </Pressable>
            {isTime ? null : (
              <Pressable
                onPress={() => router.push({ pathname: '/task/[id]/tap', params: { id: task.id } })}
                style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityHint={t('tap.openHint')}
              >
                <Text style={[styles.pillText, { color: accentText }]}>{t('tap.open')}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <View style={styles.recent}>
          <Text style={styles.sectionTitle}>{t('counter.recent')}</Text>
          {recent.length === 0 ? (
            <Text style={styles.muted}>{t('counter.nothingLogged')}</Text>
          ) : (
            <>
              {recent.map((entry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => setNoteFor(entry)}
                  onLongPress={() => confirmDeleteEntry(entry)}
                  style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}
                  accessibilityRole="button"
                  accessibilityHint={t('counter.longPressHint')}
                >
                  <View style={styles.entryRow}>
                    <Text style={[styles.entryAmount, entry.amount < 0 && { color: colors.danger }]}>
                      {signed(entry.amount)}
                    </Text>
                    <Text style={styles.entryWhen}>
                      {formatDay(t, entry.localDate, today)} ·{' '}
                      {formatClock(entry.occurredAt, entry.utcOffsetMin)}
                    </Text>
                    <SourceTag source={entry.source} />
                  </View>
                  {entry.note ? <Text style={styles.note}>“{entry.note}”</Text> : null}
                </Pressable>
              ))}
              <Text style={styles.hint}>{t('counter.longPressHint')}</Text>
              <View style={styles.links}>
                <Pressable
                  onPress={() => router.push({ pathname: '/task/[id]/stats', params: { id: task.id } })}
                  style={styles.historyLink}
                  accessibilityRole="button"
                >
                  <Text style={[styles.historyLinkText, { color: accentText }]}>{t('stats.open')} ›</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/task/[id]/history', params: { id: task.id } })}
                  style={styles.historyLink}
                  accessibilityRole="button"
                >
                  <Text style={[styles.historyLinkText, { color: accentText }]}>
                    {t('counter.allHistory')} ›
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {lastChange ? (
        <UndoBar
          message={t('counter.logged', { amount: `${signed(lastChange.amount)}${unit}` })}
          resetKey={`${lastChange.entryId}:${lastChange.amount}`}
          bottomInset={insets.bottom}
          onUndo={undo}
          onTimeout={dismissUndo}
          action={{ label: t('notes.add'), onPress: noteLastChange }}
        />
      ) : null}

      {noteFor ? (
        <NoteDialog
          subtitle={describeEntry(noteFor)}
          initial={noteFor.note}
          suggestions={noteSuggestions}
          color={task.color}
          onSave={(note) => setEntryNote(noteFor.id, note)}
          onClose={() => setNoteFor(null)}
        />
      ) : null}

      {dialogOpen ? (
        <AmountDialog
          title={t('amount.title')}
          measure={task.measure}
          submitLabel={t('common.add')}
          color={task.color}
          note={{ initial: null, suggestions: noteSuggestions }}
          onSubmit={logManual}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    missing: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },
    headerAction: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    content: {
      padding: spacing.lg,
      gap: spacing.xl,
    },
    banner: {
      fontSize: 14,
      color: c.text,
      backgroundColor: c.track,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    bannerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.track,
      borderRadius: radius.md,
      paddingRight: spacing.md,
    },
    bannerText: {
      flex: 1,
    },
    hero: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingTop: spacing.sm,
    },
    window: {
      marginTop: spacing.sm,
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    total: {
      fontSize: 72,
      fontWeight: '800',
      color: c.text,
      fontVariant: ['tabular-nums'],
      lineHeight: 84,
    },
    muted: {
      fontSize: 16,
      color: c.textMuted,
    },
    barWrap: {
      alignSelf: 'stretch',
      marginTop: spacing.md,
    },
    status: {
      marginTop: spacing.xs,
      fontSize: 15,
      fontWeight: '600',
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    pace: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    allTime: {
      fontSize: 13,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    pad: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      justifyContent: 'center',
    },
    disabled: {
      opacity: 0.4,
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
    padUnit: {
      fontSize: 12,
      fontWeight: '700',
      marginTop: -2,
    },
    pressed: {
      opacity: 0.75,
    },
    pills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    pill: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.pill,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    pillText: {
      fontSize: 16,
      fontWeight: '700',
    },
    recent: {
      gap: spacing.xs,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: spacing.xs,
    },
    entry: {
      gap: spacing.xs,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    entryPressed: {
      backgroundColor: c.track,
    },
    entryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    note: {
      fontSize: 14,
      fontStyle: 'italic',
      color: c.textMuted,
    },
    entryAmount: {
      minWidth: 64,
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    entryWhen: {
      flex: 1,
      fontSize: 14,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    hint: {
      marginTop: spacing.xs,
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
    },
    links: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xl,
    },
    historyLink: {
      paddingVertical: spacing.sm,
    },
    historyLinkText: {
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
