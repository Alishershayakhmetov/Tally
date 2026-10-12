import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { textOn } from '@/lib/contrast';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

import { NoteField } from './NoteField';

type Props = {
  /** What the note is for: "+10 · Today 18:42". */
  subtitle: string;
  initial: string | null;
  suggestions: readonly string[];
  color: string;
  /** null removes the note. */
  onSave: (note: string | null) => void;
  onClose: () => void;
};

/** Mount only while open, so each opening starts from `initial`. */
export function NoteDialog({ subtitle, initial, suggestions, color, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [text, setText] = useState(initial ?? '');

  function save(note: string | null) {
    onSave(note);
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('amount.close')} />
      <View style={styles.dialog} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{initial ? t('notes.editTitle') : t('notes.addTitle')}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <NoteField
            value={text}
            onChange={setText}
            suggestions={suggestions}
            autoFocus
            onSubmitEditing={() => save(text)}
          />
          <View style={styles.actions}>
            {initial ? (
              <Pressable onPress={() => save(null)} style={styles.secondary} accessibilityRole="button">
                <Text style={styles.remove}>{t('notes.remove')}</Text>
              </Pressable>
            ) : null}
            <View style={styles.spacer} />
            <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => save(text)}
              style={[styles.primary, { backgroundColor: color }]}
              accessibilityRole="button"
            >
              <Text style={[styles.primaryText, { color: textOn(color) }]}>{t('common.save')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.scrim,
    },
    // Anchored near the top so the on-screen keyboard never covers it.
    dialog: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      paddingTop: 120,
      paddingHorizontal: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.xl,
      gap: spacing.md,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    subtitle: {
      fontSize: 14,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    spacer: {
      flex: 1,
    },
    secondary: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    secondaryText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textMuted,
    },
    remove: {
      fontSize: 16,
      fontWeight: '600',
      color: c.danger,
    },
    primary: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    primaryText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
}
