import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TaskBadge } from '@/components/TaskBadge';
import { TEMPLATES, type TemplateId } from '@/domain/templates';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

type Props = {
  /** null = the blank form. */
  selected: TemplateId | null;
  onSelect: (id: TemplateId | null) => void;
};

/** A row of starter goals; picking one fills the form below, which stays editable. */
export function TemplatePicker({ selected, onSelect }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('templates.title')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('templates.title')}
      >
        <Option
          label={t('templates.blank')}
          summary={t('templates.blankSummary')}
          badge={<Text style={styles.plus}>＋</Text>}
          selected={selected === null}
          onPress={() => onSelect(null)}
        />
        {TEMPLATES.map((template) => (
          <Option
            key={template.id}
            label={t(`templates.${template.id}.name`)}
            summary={t(`templates.${template.id}.summary`)}
            badge={<TaskBadge emoji={template.emoji} name="" color={template.color} size={36} />}
            selected={selected === template.id}
            onPress={() => onSelect(template.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Option(props: {
  label: string;
  summary: string;
  badge: ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.option, props.selected && styles.selected]}
      accessibilityRole="radio"
      aria-checked={props.selected}
      accessibilityLabel={`${props.label}, ${props.summary}`}
    >
      {props.badge}
      <Text style={styles.label} numberOfLines={1}>
        {props.label}
      </Text>
      <Text style={styles.summary} numberOfLines={2}>
        {props.summary}
      </Text>
    </Pressable>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.sm,
      marginHorizontal: -spacing.lg,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      paddingHorizontal: spacing.lg,
    },
    row: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    option: {
      width: 116,
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    selected: {
      borderColor: c.text,
      borderWidth: 2,
      padding: spacing.md - 1,
    },
    plus: {
      width: 36,
      height: 36,
      lineHeight: 36,
      textAlign: 'center',
      fontSize: 20,
      color: c.text,
      borderRadius: 18,
      backgroundColor: c.track,
      overflow: 'hidden',
    },
    label: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    summary: {
      fontSize: 12,
      color: c.textMuted,
    },
  });
}
