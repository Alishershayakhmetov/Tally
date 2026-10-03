import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { TodaySummary as Summary } from '@/domain/today';
import type { TaskView } from '@/features/tasks/taskViews';
import { visibleOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

/** "3 of 5 daily goals done", with one segment per goal, filled in its colour once met. */
export function TodaySummary({ summary }: { summary: Summary<TaskView> }) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const { goals, done } = summary;
  const count = goals.length;
  const status =
    done === count ? `✓ ${t('today.allDone', { n: count })}` : t('today.progress', { done, count });
  const left = goals.filter((view) => !view.goal.progress.done).map((view) => view.task.name);

  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={[
        t('date.today'),
        status,
        left.length > 0 ? t('today.left', { names: left.join(', ') }) : null,
      ]
        .filter(Boolean)
        .join('. ')}
    >
      <View style={styles.row}>
        <Text style={styles.label}>{t('date.today')}</Text>
        <Text style={[styles.status, done === count && { color: colors.positive }]}>{status}</Text>
      </View>
      <View style={styles.segments}>
        {goals.map((view) => (
          <View
            key={view.task.id}
            style={[
              styles.segment,
              {
                backgroundColor: view.goal.progress.done
                  ? visibleOn(view.task.color, colors.surface)
                  : colors.track,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    status: {
      flexShrink: 1,
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    segments: {
      flexDirection: 'row',
      gap: 4,
    },
    segment: {
      flex: 1,
      height: 8,
      borderRadius: 4,
    },
  });
}
