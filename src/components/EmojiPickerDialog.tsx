import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EMOJI_CATEGORIES, normalizeEmoji, type EmojiCategoryId } from '@/domain/emoji';
import { textOn, visibleOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

type Props = {
  /** The task's icon now, highlighted in the grid. */
  value: string | null;
  /** The task colour, for the selection ring and buttons. */
  color: string;
  /** null means no icon (the badge shows the name's first letter). */
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
};

/**
 * The full icon choice (Phase 8): a grid per category, plus any emoji typed
 * from the keyboard. The typed field sits at the top so the keyboard never
 * covers it. Mount only while open.
 */
export function EmojiPickerDialog({ value, color, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const colors = useColors();
  const [category, setCategory] = useState<EmojiCategoryId>(
    () => EMOJI_CATEGORIES.find((c) => value !== null && c.emojis.includes(value))?.id ?? 'sport',
  );
  const [typed, setTyped] = useState('');
  const [invalid, setInvalid] = useState(false);
  const emojis = EMOJI_CATEGORIES.find((c) => c.id === category)?.emojis ?? [];

  function choose(emoji: string | null) {
    onSelect(emoji);
    onClose();
  }

  function submitTyped() {
    const emoji = normalizeEmoji(typed);
    if (emoji === null) setInvalid(true);
    else choose(emoji);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('amount.close')} />
      <View style={styles.dialog} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{t('icons.title')}</Text>

          <View style={styles.typedRow}>
            <TextInput
              value={typed}
              onChangeText={(text) => {
                setTyped(text);
                setInvalid(false);
              }}
              onSubmitEditing={submitTyped}
              placeholder={t('icons.customPlaceholder')}
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              returnKeyType="done"
              style={styles.input}
              accessibilityLabel={t('icons.custom')}
            />
            <Pressable
              onPress={submitTyped}
              disabled={typed.trim() === ''}
              style={[styles.use, { backgroundColor: color }, typed.trim() === '' && styles.disabled]}
              accessibilityRole="button"
            >
              <Text style={[styles.useText, { color: textOn(color) }]}>{t('icons.use')}</Text>
            </Pressable>
          </View>
          {invalid ? <Text style={styles.error}>{t('icons.invalid')}</Text> : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabs}
            accessibilityRole="tablist"
          >
            {EMOJI_CATEGORIES.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.id)}
                style={[styles.tab, c.id === category && styles.tabSelected]}
                accessibilityRole="tab"
                aria-selected={c.id === category}
              >
                <Text style={[styles.tabText, c.id === category && styles.tabTextSelected]}>
                  {t(`icons.categories.${c.id}`)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
            {emojis.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => choose(emoji)}
                style={({ pressed }) => [
                  styles.cell,
                  emoji === value && { borderColor: visibleOn(color, colors.surface) },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                aria-selected={emoji === value}
                accessibilityLabel={t('form.iconLabel', { emoji })}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable onPress={() => choose(null)} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('icons.none')}</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
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
    // Anchored near the top, like the other dialogs, so the keyboard stays below the typed field.
    dialog: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      paddingTop: 72,
      paddingBottom: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '100%',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    typedRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 18,
      color: c.text,
    },
    use: {
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      justifyContent: 'center',
    },
    useText: {
      fontSize: 15,
      fontWeight: '700',
    },
    disabled: {
      opacity: 0.4,
    },
    error: {
      color: c.danger,
      fontSize: 14,
    },
    tabs: {
      gap: spacing.xs,
    },
    tab: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: c.track,
    },
    tabSelected: {
      backgroundColor: c.text,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    tabTextSelected: {
      color: c.surface,
    },
    gridScroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    cell: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      backgroundColor: c.track,
    },
    emoji: {
      fontSize: 28,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    secondary: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    secondaryText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
  });
}
