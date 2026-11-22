import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AmountDialog } from '@/components/AmountDialog';
import { NoteSheet } from '@/components/NoteSheet';
import { NoteText } from '@/components/NoteText';
import { useLive } from '@/db/live';
import { listEntries, softDeleteEntry, updateEntry } from '@/db/repos/entries';
import { getTask, todayFor } from '@/db/repos/tasks';
import type { Entry } from '@/db/schema';
import { formatClock } from '@/domain/format';
import { formatAmount, formatSignedAmount } from '@/domain/measure';
import { isQuotaDay } from '@/domain/periods';
import { SourceTag } from '@/features/counter/SourceTag';
import { useNoteSuggestions } from '@/features/counter/useNoteSuggestions';
import { formatDay } from '@/i18n/format';
import { useNow } from '@/lib/clock';
import { confirmDestructive } from '@/lib/confirm';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

type DaySection = { date: string; total: number; data: Entry[] };

/** Entries arrive newest first; consecutive entries of one logical day form a section. */
function groupByDay(entries: Entry[]): DaySection[] {
  const sections: DaySection[] = [];
  for (const entry of entries) {
    let section = sections.find((s) => s.date === entry.localDate);
    if (!section) {
      section = { date: entry.localDate, total: 0, data: [] };
      sections.push(section);
    }
    section.total += entry.amount;
    section.data.push(entry);
  }
  return sections.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const nowMs = useNow();
  const task = useLive(() => getTask(id));
  const entries = useLive(() => listEntries(id));
  const [editing, setEditing] = useState<Entry | null>(null);
  const [reading, setReading] = useState<Entry | null>(null);
  const noteSuggestions = useNoteSuggestions();
  if (!task) return null;

  const today = todayFor(task.dayStartMin, nowMs);
  const unit = task.unitLabel ? ` ${task.unitLabel}` : '';
  const signed = (n: number) => formatSignedAmount(task.measure, n);

  async function confirmDelete(entry: Entry) {
    const ok = await confirmDestructive(
      t('counter.deleteEntryTitle', { amount: `${signed(entry.amount)}${unit}` }),
      t('counter.deleteEntryBody', {
        day: formatDay(t, entry.localDate, today).toLowerCase(),
        time: formatClock(entry.occurredAt, entry.utcOffsetMin),
      }),
      t('common.delete'),
    );
    if (ok) softDeleteEntry(entry.id);
  }

  return (
    <View style={styles.screen}>
      <SectionList
        sections={groupByDay(entries)}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={entries.length > 0 ? <Text style={styles.hint}>{t('history.hint')}</Text> : null}
        ListEmptyComponent={<Text style={styles.empty}>{t('history.empty')}</Text>}
        renderSectionHeader={({ section }) => {
          const met =
            task.recurrence === 'daily' &&
            isQuotaDay(task.weekdayMask, section.date) &&
            section.total >= task.target;
          return (
            <View style={styles.dayHeader}>
              <Text style={styles.dayLabel}>{formatDay(t, section.date, today)}</Text>
              <Text
                style={[styles.dayTotal, met && { color: colors.positive }]}
                accessibilityLabel={met ? `${signed(section.total)}, ${t('history.met')}` : undefined}
              >
                {met ? '✓ ' : ''}
                {signed(section.total)}
              </Text>
            </View>
          );
        }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setEditing(item)}
            onLongPress={() => confirmDelete(item)}
            style={({ pressed }) => [styles.entry, pressed && styles.entryPressed]}
            accessibilityRole="button"
            accessibilityHint={t('history.hint')}
          >
            <View style={styles.row}>
              <Text style={[styles.amount, item.amount < 0 && { color: colors.danger }]}>
                {signed(item.amount)}
              </Text>
              <Text style={styles.time}>{formatClock(item.occurredAt, item.utcOffsetMin)}</Text>
              <SourceTag source={item.source} />
            </View>
            {item.note ? (
              <NoteText note={item.note} style={styles.note} onShowAll={() => setReading(item)} />
            ) : null}
          </Pressable>
        )}
      />
      {reading?.note ? (
        <NoteSheet
          subtitle={`${signed(reading.amount)} · ${formatDay(t, reading.localDate, today)} · ${formatClock(reading.occurredAt, reading.utcOffsetMin)}`}
          note={reading.note}
          color={task.color}
          onEdit={() => setEditing(reading)}
          onClose={() => setReading(null)}
        />
      ) : null}
      {editing ? (
        <AmountDialog
          title={t('amount.editTitle')}
          measure={task.measure}
          initialText={formatAmount(task.measure, editing.amount)}
          submitLabel={t('common.save')}
          color={task.color}
          note={{ initial: editing.note, suggestions: noteSuggestions }}
          onSubmit={(amount, note) => updateEntry(editing.id, { amount, note })}
          onClose={() => setEditing(null)}
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
    content: {
      padding: spacing.lg,
      gap: spacing.xs,
    },
    hint: {
      fontSize: 13,
      color: c.textMuted,
      marginBottom: spacing.sm,
    },
    empty: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
      marginTop: spacing.xxl,
    },
    dayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginTop: spacing.lg,
      marginBottom: spacing.xs,
    },
    dayLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    dayTotal: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    note: {
      fontSize: 14,
      fontStyle: 'italic',
      color: c.textMuted,
    },
    amount: {
      minWidth: 64,
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    time: {
      flex: 1,
      fontSize: 14,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    tag: {
      fontSize: 12,
      color: c.textMuted,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.xs,
    },
  });
}
