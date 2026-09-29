import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import type { EntrySource } from '@/db/schema';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

/** Marks entries that didn't come from the counter buttons. */
export function SourceTag({ source }: { source: EntrySource }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  if (source === 'button') return null;
  return <Text style={styles.tag}>{source === 'timer' ? t('counter.timerTag') : t('counter.typed')}</Text>;
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
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
