import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseAmount } from '@/domain/input';
import { formatError } from '@/i18n/format';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

type Props = {
  title: string;
  /** Pre-filled text when editing an entry. */
  initialText?: string;
  submitLabel: string;
  color: string;
  onSubmit: (amount: number) => void;
  onClose: () => void;
};

/** Mount it only while open, so each opening starts from `initialText`. */
export function AmountDialog({ title, initialText = '', submitLabel, color, onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [text, setText] = useState(initialText);
  const [touched, setTouched] = useState(false);
  const parsed = parseAmount(text);

  function submit() {
    setTouched(true);
    if (!parsed.ok) return;
    onSubmit(parsed.value);
    onClose();
  }

  function toggleSign() {
    const trimmed = text.trim();
    setText(trimmed.startsWith('-') || trimmed.startsWith('−') ? trimmed.slice(1) : `-${trimmed}`);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('amount.close')} />
      <View style={styles.dialog} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{t('amount.hint')}</Text>
          <View style={styles.inputRow}>
            <Pressable
              onPress={toggleSign}
              style={styles.signButton}
              accessibilityRole="button"
              accessibilityLabel={t('amount.toggleSign')}
            >
              <Text style={styles.signText}>±</Text>
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={submit}
              autoFocus
              selectTextOnFocus
              placeholder={t('amount.placeholder')}
              placeholderTextColor={styles.placeholder.color}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
              returnKeyType="done"
              style={styles.input}
              accessibilityLabel={t('amount.label')}
            />
          </View>
          {touched && !parsed.ok ? <Text style={styles.error}>{formatError(t, parsed.error)}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              style={[styles.primary, { backgroundColor: color }]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>{submitLabel}</Text>
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
    hint: {
      fontSize: 14,
      color: c.textMuted,
    },
    placeholder: {
      color: c.textMuted,
    },
    inputRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    signButton: {
      width: 52,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signText: {
      fontSize: 22,
      color: c.text,
    },
    input: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: 22,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    error: {
      color: c.danger,
      fontSize: 14,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    secondary: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    secondaryText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textMuted,
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
