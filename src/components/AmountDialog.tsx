import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { parseAmount } from '@/domain/input';
import { colors, radius, spacing } from '@/theme';

type Props = {
  visible: boolean;
  unitLabel: string | null;
  color: string;
  onSubmit: (amount: number) => void;
  onClose: () => void;
};

export function AmountDialog({ visible, unitLabel, color, onSubmit, onClose }: Props) {
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const parsed = parseAmount(text);

  function close() {
    setText('');
    setTouched(false);
    onClose();
  }

  function submit() {
    setTouched(true);
    if (!parsed.ok) return;
    onSubmit(parsed.value);
    close();
  }

  function toggleSign() {
    const trimmed = text.trim();
    setText(trimmed.startsWith('-') || trimmed.startsWith('−') ? trimmed.slice(1) : `-${trimmed}`);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close" />
      <View style={styles.dialog} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>Enter amount</Text>
          <Text style={styles.hint}>
            Use a negative number to correct a mistake{unitLabel ? ` (${unitLabel})` : ''}.
          </Text>
          <View style={styles.inputRow}>
            <Pressable
              onPress={toggleSign}
              style={styles.signButton}
              accessibilityRole="button"
              accessibilityLabel="Toggle minus sign"
            >
              <Text style={styles.signText}>±</Text>
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={submit}
              autoFocus
              placeholder="e.g. 37"
              placeholderTextColor={colors.textMuted}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
              returnKeyType="done"
              style={styles.input}
              accessibilityLabel="Amount"
            />
          </View>
          {touched && !parsed.ok ? <Text style={styles.error}>{parsed.error}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={close} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              style={[styles.primary, { backgroundColor: color }]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Add</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
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
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  hint: {
    fontSize: 14,
    color: colors.textMuted,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  signButton: {
    width: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signText: {
    fontSize: 22,
    color: colors.text,
  },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 22,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  error: {
    color: colors.danger,
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
    color: colors.textMuted,
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
