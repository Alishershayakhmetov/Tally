import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TaskBadge } from '@/components/TaskBadge';
import { createTask } from '@/db/repos/tasks';
import { formatSigned } from '@/domain/format';
import {
  DEFAULT_INCREMENTS,
  parseIncrements,
  validateTaskForm,
  type TaskFormErrors,
  type TaskFormValues,
} from '@/domain/input';
import { colors, radius, spacing, TASK_COLORS, TASK_EMOJIS } from '@/theme';

const INITIAL: TaskFormValues = {
  name: '',
  emoji: TASK_EMOJIS[0],
  color: TASK_COLORS[4],
  unitLabel: '',
  target: '',
  increments: DEFAULT_INCREMENTS.join(', '),
};

export default function NewTaskScreen() {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<TaskFormErrors>({});
  const incrementsPreview = parseIncrements(values.increments);

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  }

  function save() {
    const result = validateTaskForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const id = createTask(result.value);
    router.replace({ pathname: '/task/[id]', params: { id } });
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.preview}>
        <TaskBadge emoji={values.emoji} name={values.name || '?'} color={values.color} size={56} />
        <Text style={styles.previewName} numberOfLines={1}>
          {values.name.trim() || 'New task'}
        </Text>
      </View>

      <Field label="Name" error={errors.name}>
        <TextInput
          value={values.name}
          onChangeText={(t) => set('name', t)}
          placeholder="Push-ups"
          placeholderTextColor={colors.textMuted}
          autoFocus
          maxLength={60}
          style={styles.input}
          accessibilityLabel="Name"
        />
      </Field>

      <Field label="Target" error={errors.target} hint="The total you want to reach.">
        <View style={styles.targetRow}>
          <TextInput
            value={values.target}
            onChangeText={(t) => set('target', t)}
            placeholder="1000"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            style={[styles.input, styles.targetInput]}
            accessibilityLabel="Target"
          />
          <TextInput
            value={values.unitLabel}
            onChangeText={(t) => set('unitLabel', t)}
            placeholder="unit, e.g. push-ups"
            placeholderTextColor={colors.textMuted}
            maxLength={30}
            style={[styles.input, styles.unitInput]}
            accessibilityLabel="Unit"
          />
        </View>
        {errors.unitLabel ? <Text style={styles.error}>{errors.unitLabel}</Text> : null}
      </Field>

      <Field label="Icon">
        <View style={styles.chips}>
          {TASK_EMOJIS.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => set('emoji', values.emoji === emoji ? null : emoji)}
              style={[styles.emojiChip, values.emoji === emoji && { borderColor: values.color }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: values.emoji === emoji }}
              accessibilityLabel={`Icon ${emoji}`}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="Color">
        <View style={styles.chips}>
          {TASK_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => set('color', color)}
              style={[
                styles.swatch,
                { backgroundColor: color },
                values.color === color && styles.swatchSelected,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: values.color === color }}
              accessibilityLabel={`Color ${color}`}
            />
          ))}
        </View>
      </Field>

      <Field
        label="Counter buttons"
        error={errors.increments}
        hint="Up to 6 whole numbers, separated by commas. Negative ones subtract."
      >
        <TextInput
          value={values.increments}
          onChangeText={(t) => set('increments', t)}
          placeholder="-1, 1, 5, 10"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Counter buttons"
        />
        {incrementsPreview.ok ? (
          <View style={styles.chips}>
            {incrementsPreview.value.map((n) => (
              <View
                key={n}
                style={[
                  styles.incrementChip,
                  n > 0 ? { backgroundColor: values.color } : { borderColor: values.color, borderWidth: 1.5 },
                ]}
              >
                <Text style={[styles.incrementText, { color: n > 0 ? '#FFFFFF' : values.color }]}>
                  {formatSigned(n)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Field>

      <Pressable
        onPress={save}
        style={({ pressed }) => [styles.save, { backgroundColor: values.color }, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.saveText}>Create task</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    padding: spacing.lg,
    gap: spacing.xl,
  },
  preview: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  previewName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  targetRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // minWidth 0 lets inputs shrink below their intrinsic width in a row.
  targetInput: {
    flex: 2,
    minWidth: 0,
    fontVariant: ['tabular-nums'],
  },
  unitInput: {
    flex: 3,
    minWidth: 0,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  emojiChip: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 24,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: colors.surface,
    outlineWidth: 2,
    outlineColor: colors.text,
    outlineStyle: 'solid',
  },
  incrementChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  incrementText: {
    fontSize: 14,
    fontWeight: '700',
  },
  save: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
