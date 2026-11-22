import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MAX_NOTE_LENGTH, NOTE_PREVIEW_LENGTH } from '@/domain/notes';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

type Props = {
  value: string;
  onChange: (text: string) => void;
  /** Quick chips; tapping one replaces the text. */
  suggestions: readonly string[];
  autoFocus?: boolean;
};

/** A free-text note, a few words or several lines, plus quick chips ("Felt tired", "New record", recent notes). */
export function NoteField({ value, onChange, suggestions, autoFocus }: Props) {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const current = value.trim().toLocaleLowerCase();

  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('notes.placeholder')}
        placeholderTextColor={colors.textMuted}
        maxLength={MAX_NOTE_LENGTH}
        autoFocus={autoFocus}
        multiline
        textAlignVertical="top"
        style={styles.input}
        accessibilityLabel={t('notes.label')}
      />
      {value.length > NOTE_PREVIEW_LENGTH ? (
        <Text style={styles.count}>{t('notes.count', { count: value.length, max: MAX_NOTE_LENGTH })}</Text>
      ) : null}
      {suggestions.length > 0 ? (
        <View style={styles.chips}>
          {suggestions.map((suggestion) => {
            const selected = suggestion.toLocaleLowerCase() === current;
            return (
              <Pressable
                key={suggestion}
                onPress={() => onChange(selected ? '' : suggestion)}
                style={[styles.chip, selected && styles.chipSelected]}
                accessibilityRole="button"
                aria-selected={selected}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                  {suggestion}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.sm,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 16,
      color: c.text,
      minWidth: 0,
      minHeight: 84,
      maxHeight: 160,
    },
    count: {
      alignSelf: 'flex-end',
      fontSize: 12,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      maxWidth: '100%',
    },
    chipSelected: {
      backgroundColor: c.text,
      borderColor: c.text,
    },
    chipText: {
      fontSize: 14,
      color: c.text,
    },
    chipTextSelected: {
      color: c.surface,
      fontWeight: '600',
    },
  });
}
