import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { isLongNote } from '@/domain/notes';
import { useThemedStyles } from '@/lib/theme';
import { spacing, type Colors } from '@/theme';

type Props = {
  note: string;
  /** The italic quote style of the screen it sits in. */
  style: StyleProp<TextStyle>;
  /** Opens the long note in its sheet; only offered for a long note. */
  onShowAll: () => void;
  /** Wrap it in quotation marks (an entry's note); a task's description isn't quoted. */
  quoted?: boolean;
};

/** An entry's note: short ones in full, long ones as a two-line preview with "Show all". */
export function NoteText({ note, style, onShowAll, quoted = true }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const text = quoted ? `“${note}”` : note;
  // The preview runs lines together, so a blank line doesn't use up its two.
  const preview = text.replace(/\s*\n\s*/g, ' ');
  if (!isLongNote(note)) return <Text style={style}>{text}</Text>;
  return (
    <View style={styles.wrap}>
      <Text style={style} numberOfLines={2}>
        {preview}
      </Text>
      <Text style={styles.link} onPress={onShowAll} accessibilityRole="button" suppressHighlighting>
        {t('notes.showAll')} ›
      </Text>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.xs,
      alignItems: 'flex-start',
    },
    link: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      paddingVertical: spacing.xs,
    },
  });
}
