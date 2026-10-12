import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseAmount, type Result } from '@/domain/input';
import { switchDurationUnit, type DurationUnit, type Measure } from '@/domain/measure';
import { formatError } from '@/i18n/format';
import { textOn } from '@/lib/contrast';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

import { DurationUnitPicker, durationKeyboard, unitHint, unitPlaceholder } from './DurationUnitPicker';
import { NoteField } from './NoteField';

type Props = {
  title: string;
  /**
   * Time amounts are typed as minutes, m:ss or h:mm:ss, or as a plain number of
   * the hours, minutes or seconds the user picks, and submitted in seconds.
   */
  measure: Measure;
  /** Pre-filled text when editing an entry. */
  initialText?: string;
  /** Replace the amount hint (for the time format) and parsing, e.g. for a countdown length. */
  hint?: string;
  parse?: (text: string, unit: DurationUnit) => Result<number>;
  /** Shows the ± button; false for values that can't be negative. */
  signed?: boolean;
  submitLabel: string;
  color: string;
  /** Shows a note field (with quick chips) under the amount. */
  note?: { initial: string | null; suggestions: readonly string[] };
  /** `note` is the typed text when the note field is shown, otherwise null. */
  onSubmit: (amount: number, note: string | null) => void;
  onClose: () => void;
};

/** Android's numeric keypad has no ":", so time entry uses the full keyboard there. */
export function numberKeyboard(measure: Measure): KeyboardTypeOptions {
  if (Platform.OS === 'ios') return 'numbers-and-punctuation';
  return measure === 'duration' ? 'default' : 'numeric';
}

/** Mount it only while open, so each opening starts from `initialText`. */
export function AmountDialog({
  title,
  measure,
  initialText = '',
  hint,
  parse,
  signed = true,
  submitLabel,
  color,
  note,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialText);
  const [unit, setUnit] = useState<DurationUnit>('format');
  const [noteText, setNoteText] = useState(note?.initial ?? '');
  const [touched, setTouched] = useState(false);
  const parsed = parse ? parse(text, unit) : parseAmount(text, measure, unit);
  const isTime = measure === 'duration';
  const formatHint = hint ?? (isTime ? t('amount.hintTime') : t('amount.hint'));
  const timeUnitHint = isTime ? unitHint(t, unit) : null;

  function changeUnit(next: DurationUnit) {
    setText((current) => switchDurationUnit(current, unit, next));
    setUnit(next);
  }

  function submit() {
    setTouched(true);
    if (!parsed.ok) return;
    onSubmit(parsed.value, note ? noteText : null);
    onClose();
  }

  function toggleSign() {
    const trimmed = text.trim();
    setText(trimmed.startsWith('-') || trimmed.startsWith('−') ? trimmed.slice(1) : `-${trimmed}`);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('amount.close')} />
      {/*
        Keeps the card above the keyboard. When it doesn't fit there, its middle scrolls,
        while the field stays at the top and the buttons at the bottom.
      */}
      <KeyboardAvoidingView behavior="padding" style={styles.avoider} pointerEvents="box-none">
        <View
          style={[styles.dialog, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.lg }]}
          pointerEvents="box-none"
        >
          <View style={styles.card}>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.cardContent}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.hint}>
                {timeUnitHint ? (signed ? `${timeUnitHint} ${t('amount.hint')}` : timeUnitHint) : formatHint}
              </Text>
              <View style={styles.inputRow}>
                {signed ? (
                  <Pressable
                    onPress={toggleSign}
                    style={styles.signButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('amount.toggleSign')}
                  >
                    <Text style={styles.signText}>±</Text>
                  </Pressable>
                ) : null}
                <TextInput
                  value={text}
                  onChangeText={setText}
                  onSubmitEditing={submit}
                  autoFocus
                  selectTextOnFocus
                  placeholder={
                    (isTime ? unitPlaceholder(t, unit) : null) ??
                    (isTime ? t('amount.placeholderTime') : t('amount.placeholder'))
                  }
                  placeholderTextColor={styles.placeholder.color}
                  keyboardType={isTime ? durationKeyboard(unit) : numberKeyboard(measure)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  style={styles.input}
                  accessibilityLabel={t('amount.label')}
                  testID="amount-input"
                />
              </View>
              {touched && !parsed.ok ? (
                <Text style={styles.error}>{formatError(t, parsed.error)}</Text>
              ) : null}
              {isTime ? <DurationUnitPicker value={unit} onChange={changeUnit} /> : null}
              {note ? (
                <NoteField value={noteText} onChange={setNoteText} suggestions={note.suggestions} />
              ) : null}
            </ScrollView>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button">
                <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                style={[styles.primary, { backgroundColor: color }]}
                accessibilityRole="button"
                testID="amount-submit"
              >
                <Text style={[styles.primaryText, { color: textOn(color) }]}>{submitLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.scrim,
    },
    avoider: {
      ...StyleSheet.absoluteFill,
    },
    dialog: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '100%',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    body: {
      flexGrow: 0,
      flexShrink: 1,
    },
    cardContent: {
      padding: spacing.xl,
      paddingBottom: spacing.sm,
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
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
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
