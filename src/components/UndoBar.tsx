import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

const VISIBLE_MS = 4000;

type Props = {
  message: string;
  /** Changes whenever the message should stay up for another full period. */
  resetKey: string;
  bottomInset: number;
  onUndo: () => void;
  onTimeout: () => void;
};

export function UndoBar({ message, resetKey, bottomInset, onUndo, onTimeout }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);

  useEffect(() => {
    const timer = setTimeout(onTimeout, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [resetKey, onTimeout]);

  return (
    <View style={[styles.bar, { bottom: bottomInset + spacing.lg }]} accessibilityLiveRegion="polite">
      <Text style={styles.message} numberOfLines={1}>
        {message}
      </Text>
      <Pressable onPress={onUndo} hitSlop={12} accessibilityRole="button">
        <Text style={styles.undo}>{t('common.undo')}</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    bar: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      backgroundColor: c.snackbar,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    message: {
      flex: 1,
      color: c.snackbarText,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    undo: {
      color: c.snackbarAction,
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
