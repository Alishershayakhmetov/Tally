import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CalendarDialog } from '@/components/CalendarDialog';
import { ColorPickerDialog } from '@/components/ColorPickerDialog';
import {
  DurationUnitPicker,
  durationKeyboard,
  unitHint,
  unitPlaceholder,
} from '@/components/DurationUnitPicker';
import { EmojiPickerDialog } from '@/components/EmojiPickerDialog';
import { ReminderTimePicker, shiftReminderTime } from '@/components/ReminderTimePicker';
import { Segmented } from '@/components/Segmented';
import { TaskBadge } from '@/components/TaskBadge';
import { TimeStepper } from '@/components/TimeStepper';
import { WeekdayPicker } from '@/components/WeekdayPicker';
import { useSettings } from '@/db/settings';
import { formatSigned } from '@/domain/format';
import { MAX_NOTE_LENGTH } from '@/domain/notes';
import {
  parseIncrements,
  validateTaskForm,
  type InputError,
  type TaskFormErrors,
  type TaskFormValues,
  type ValidTaskForm,
} from '@/domain/input';
import { switchDurationUnit, type DurationUnit, type Measure } from '@/domain/measure';
import type { Recurrence } from '@/domain/periods';
import { clampDayStart, formatMinutes } from '@/domain/settings';
import { formatDate, formatError } from '@/i18n/format';
import { remindersSupported, useNotificationPermission } from '@/notifications/scheduler';
import { readableOn, textOn, visibleOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { useWeekStart } from '@/lib/weekStart';
import { radius, spacing, TASK_COLORS, TASK_EMOJIS, type Colors } from '@/theme';

const DEFAULT_REMINDER_TIME = '19:00';

type Props = {
  initial: TaskFormValues;
  /** The task's start date: the earliest allowed end date. */
  startDate: string;
  submitLabel: string;
  onSubmit: (value: ValidTaskForm) => void;
  /** Existing entries would change meaning if a task switched between count and time. */
  measureLocked?: boolean;
  /** Shown above the form, inside its scroll view (the template picker). */
  header?: ReactNode;
  footer?: ReactNode;
  /** When this changes, the form reloads `initial` (a template was picked). */
  resetKey?: string;
};

export function TaskForm({
  initial,
  startDate,
  submitLabel,
  onSubmit,
  measureLocked = false,
  header,
  footer,
  resetKey,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useThemedStyles(makeStyles);
  const settings = useSettings();
  const weekStart = useWeekStart();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<TaskFormErrors>({});
  // Adjusting state during render (not in an effect) when the key changes, as React recommends.
  const [loadedKey, setLoadedKey] = useState(resetKey);
  if (resetKey !== loadedKey) {
    setLoadedKey(resetKey);
    setValues(initial);
    setErrors({});
  }
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [permission, requestPermission] = useNotificationPermission();
  const incrementsPreview = parseIncrements(values.increments);
  const accentText = readableOn(values.color, colors.surface, colors.text);
  /** Outlines in the task colour (selected icon, minus buttons) stay visible on the card, even for light colours. */
  const outline = visibleOn(values.color, colors.surface);
  /** The quick icon row; the picker has the full set. */
  const quickEmojis: readonly string[] = TASK_EMOJIS;
  /** A colour from the picker that isn't one of the built-ins gets its own swatch. */
  const customColor = !(TASK_COLORS as readonly string[]).includes(values.color);
  const isTime = values.measure === 'duration';

  function setReminder(on: boolean) {
    set('reminderTime', on ? DEFAULT_REMINDER_TIME : null);
    if (on) void requestPermission();
  }

  const reminderHint = !remindersSupported
    ? t('form.reminderWeb')
    : permission === 'denied'
      ? t('form.reminderDenied')
      : t('form.reminderHint');

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    update(key, () => value);
  }

  /** Derives the new value from the latest state, so taps between renders don't overwrite each other. */
  function update<K extends keyof TaskFormValues>(key: K, next: (v: TaskFormValues) => TaskFormValues[K]) {
    setValues((v) => ({ ...v, [key]: next(v) }));
    setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  }

  /** A number typed so far keeps its digits; a time like 1:30:00 is converted when it can be. */
  function changeTargetUnit(next: DurationUnit) {
    setValues((v) => ({ ...v, target: switchDurationUnit(v.target, v.targetUnit, next), targetUnit: next }));
    setErrors((e) => ('target' in e ? { ...e, target: undefined } : e));
  }

  function submit() {
    const result = validateTaskForm(values, startDate);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit(result.value);
  }

  const targetHint: Record<Recurrence, string> = {
    none: t('form.targetTotal'),
    daily: t('form.targetDaily'),
    weekly: t('form.targetWeekly'),
    monthly: t('form.targetMonthly'),
  };

  return (
    // Scrolls the focused field above the keyboard. The offset also keeps what sits under a field
    // in view, such as the preview of the counter buttons.
    <KeyboardAwareScrollView
      contentContainerStyle={[styles.form, { paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={KEYBOARD_OFFSET}
    >
      {header}
      <View style={styles.preview}>
        <TaskBadge emoji={values.emoji} name={values.name || '?'} color={values.color} size={56} />
        <Text style={styles.previewName} numberOfLines={1}>
          {values.name.trim() || t('screens.newTask')}
        </Text>
      </View>

      <Field label={t('form.name')} error={errors.name}>
        <TextInput
          value={values.name}
          onChangeText={(text) => set('name', text)}
          placeholder={t('form.namePlaceholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={60}
          style={styles.input}
          accessibilityLabel={t('form.name')}
        />
      </Field>

      <Field label={t('form.description')} hint={t('form.descriptionHint')}>
        <TextInput
          value={values.description}
          onChangeText={(text) => set('description', text)}
          placeholder={t('form.descriptionPlaceholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={MAX_NOTE_LENGTH}
          multiline
          textAlignVertical="top"
          style={[styles.input, styles.descriptionInput]}
          accessibilityLabel={t('form.description')}
        />
      </Field>

      <Field label={t('form.measure')}>
        <View pointerEvents={measureLocked ? 'none' : 'auto'} style={measureLocked && styles.locked}>
          <Segmented<Measure>
            accessibilityLabel={t('form.measure')}
            value={values.measure}
            onChange={(measure) => set('measure', measure)}
            options={[
              { value: 'count', label: t('form.measureCount') },
              { value: 'duration', label: t('form.measureTime') },
            ]}
          />
        </View>
      </Field>

      <Field label={t('form.goal')}>
        <Segmented<Recurrence>
          accessibilityLabel={t('form.goal')}
          value={values.recurrence}
          onChange={(recurrence) => set('recurrence', recurrence)}
          options={[
            { value: 'none', label: t('form.goalTotal') },
            { value: 'daily', label: t('form.goalDaily') },
            { value: 'weekly', label: t('form.goalWeekly') },
            { value: 'monthly', label: t('form.goalMonthly') },
          ]}
        />
      </Field>

      <Field
        label={t('form.target')}
        error={errors.target ?? errors.unitLabel}
        hint={
          isTime
            ? `${targetHint[values.recurrence]} ${unitHint(t, values.targetUnit) ?? t('form.targetTimeHint')}`
            : targetHint[values.recurrence]
        }
      >
        <View style={styles.targetRow}>
          <TextInput
            value={values.target}
            onChangeText={(text) => set('target', text)}
            placeholder={
              isTime
                ? (unitPlaceholder(t, values.targetUnit) ?? t('form.targetPlaceholderTime'))
                : t('form.targetPlaceholder')
            }
            placeholderTextColor={colors.textMuted}
            keyboardType={isTime ? durationKeyboard(values.targetUnit) : 'number-pad'}
            style={[styles.input, styles.targetInput]}
            accessibilityLabel={t('form.target')}
          />
          {isTime ? null : (
            <TextInput
              value={values.unitLabel}
              onChangeText={(text) => set('unitLabel', text)}
              placeholder={t('form.unitPlaceholder')}
              placeholderTextColor={colors.textMuted}
              maxLength={30}
              style={[styles.input, styles.unitInput]}
              accessibilityLabel={t('form.unit')}
            />
          )}
        </View>
        {isTime ? <DurationUnitPicker value={values.targetUnit} onChange={changeTargetUnit} /> : null}
      </Field>

      {values.recurrence === 'daily' ? (
        <Field label={t('form.days')} error={errors.weekdayMask} hint={t('form.daysHint')}>
          <WeekdayPicker
            mask={values.weekdayMask}
            weekStart={weekStart}
            accent={values.color}
            onToggle={(bit) => update('weekdayMask', (v) => v.weekdayMask ^ bit)}
          />
        </Field>
      ) : null}

      <Field
        label={values.recurrence === 'none' ? t('form.deadline') : t('form.endsOn')}
        error={errors.endDate}
      >
        <View style={styles.dateRow}>
          <Pressable
            onPress={() => setCalendarOpen(true)}
            style={[styles.input, styles.dateButton]}
            accessibilityRole="button"
            accessibilityLabel={values.recurrence === 'none' ? t('form.deadline') : t('form.endsOn')}
          >
            <Text style={values.endDate ? styles.dateText : styles.datePlaceholder}>
              {values.endDate ? formatDate(t, values.endDate, startDate) : t('form.pickDate')}
            </Text>
          </Pressable>
          {values.endDate ? (
            <Pressable
              onPress={() => set('endDate', null)}
              style={styles.clearButton}
              accessibilityRole="button"
              accessibilityLabel={t('form.clearDate')}
            >
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          ) : null}
        </View>
      </Field>

      <Field label={t('form.dayStart')} error={errors.dayStartMin} hint={t('form.dayStartHint')}>
        <Segmented<'default' | 'custom'>
          accessibilityLabel={t('form.dayStart')}
          value={values.dayStartMin === null ? 'default' : 'custom'}
          onChange={(mode) => set('dayStartMin', mode === 'default' ? null : settings.dayStartMin)}
          options={[
            {
              value: 'default',
              label: t('form.dayStartDefault', { time: formatMinutes(settings.dayStartMin) }),
            },
            { value: 'custom', label: t('form.dayStartCustom') },
          ]}
        />
        {values.dayStartMin !== null ? (
          <TimeStepper
            minutes={values.dayStartMin}
            onStep={(delta) => update('dayStartMin', (v) => clampDayStart((v.dayStartMin ?? 0) + delta))}
            earlierLabel={t('form.earlier')}
            laterLabel={t('form.later')}
          />
        ) : null}
      </Field>

      <Field label={t('form.reminder')} error={errors.reminderTime} hint={reminderHint}>
        <Segmented<'off' | 'on'>
          accessibilityLabel={t('form.reminder')}
          value={values.reminderTime === null ? 'off' : 'on'}
          onChange={(mode) => setReminder(mode === 'on')}
          options={[
            { value: 'off', label: t('form.reminderOff') },
            { value: 'on', label: t('form.reminderOn') },
          ]}
        />
        {values.reminderTime !== null ? (
          <ReminderTimePicker
            value={values.reminderTime}
            onShift={(delta) =>
              update('reminderTime', (v) => shiftReminderTime(v.reminderTime ?? DEFAULT_REMINDER_TIME, delta))
            }
          />
        ) : null}
      </Field>

      <Field label={t('form.icon')}>
        <View style={styles.chips}>
          {[
            ...(values.emoji && !quickEmojis.includes(values.emoji) ? [values.emoji] : []),
            ...quickEmojis,
          ].map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => set('emoji', values.emoji === emoji ? null : emoji)}
              style={[styles.emojiChip, values.emoji === emoji && { borderColor: outline }]}
              accessibilityRole="radio"
              aria-checked={values.emoji === emoji}
              accessibilityLabel={t('form.iconLabel', { emoji })}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setIconPickerOpen(true)}
            style={[styles.emojiChip, styles.moreChip]}
            accessibilityRole="button"
            accessibilityLabel={t('form.iconMore')}
          >
            <Text style={styles.moreText}>{t('form.iconMoreShort')}</Text>
          </Pressable>
        </View>
      </Field>

      <Field label={t('form.color')}>
        <View style={styles.chips}>
          {[...TASK_COLORS, ...(customColor ? [values.color] : [])].map((color) => (
            <Pressable
              key={color}
              onPress={() => set('color', color)}
              style={[
                styles.swatch,
                { backgroundColor: color },
                values.color === color && styles.swatchSelected,
              ]}
              accessibilityRole="radio"
              aria-checked={values.color === color}
              accessibilityLabel={t('form.colorLabel', { color })}
            />
          ))}
          <Pressable
            onPress={() => setColorPickerOpen(true)}
            style={[styles.swatch, styles.pickSwatch]}
            accessibilityRole="button"
            accessibilityLabel={t('colorPicker.open')}
          >
            <Text style={styles.pickText}>＋</Text>
          </Pressable>
        </View>
      </Field>

      <Field
        label={t('form.buttons')}
        error={errors.increments}
        hint={isTime ? t('form.buttonsHintTime') : t('form.buttonsHint')}
      >
        <TextInput
          value={values.increments}
          onChangeText={(text) => set('increments', text)}
          placeholder="-1, 1, 5, 10"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel={t('form.buttonsLabel')}
        />
        {incrementsPreview.ok ? (
          <View style={styles.chips}>
            {incrementsPreview.value.map((n) => (
              <View
                key={n}
                style={[
                  styles.incrementChip,
                  n > 0 ? { backgroundColor: values.color } : { borderColor: outline, borderWidth: 1.5 },
                ]}
              >
                <Text style={[styles.incrementText, { color: n > 0 ? textOn(values.color) : accentText }]}>
                  {formatSigned(n)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Field>

      <Pressable
        onPress={submit}
        style={({ pressed }) => [styles.save, { backgroundColor: values.color }, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={[styles.saveText, { color: textOn(values.color) }]}>{submitLabel}</Text>
      </Pressable>

      {footer}

      {iconPickerOpen ? (
        <EmojiPickerDialog
          value={values.emoji}
          color={values.color}
          onSelect={(emoji) => set('emoji', emoji)}
          onClose={() => setIconPickerOpen(false)}
        />
      ) : null}
      {colorPickerOpen ? (
        <ColorPickerDialog
          value={values.color}
          onSelect={(color) => set('color', color)}
          onClose={() => setColorPickerOpen(false)}
        />
      ) : null}
      {calendarOpen ? (
        <CalendarDialog
          visible
          value={values.endDate}
          minDate={startDate}
          weekStart={weekStart}
          accent={values.color}
          onSelect={(date) => set('endDate', date)}
          onClose={() => setCalendarOpen(false)}
        />
      ) : null}
    </KeyboardAwareScrollView>
  );
}

/** Space kept between the focused field and the keyboard, in dp. */
const KEYBOARD_OFFSET = 96;

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: InputError;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Text style={styles.error}>{formatError(t, error)}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
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
      color: c.text,
    },
    field: {
      gap: spacing.sm,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    hint: {
      fontSize: 13,
      color: c.textMuted,
    },
    error: {
      fontSize: 13,
      color: c.danger,
    },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: 16,
      color: c.text,
    },
    descriptionInput: {
      minHeight: 96,
      maxHeight: 220,
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
    dateRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    dateButton: {
      flex: 1,
      minWidth: 0,
    },
    dateText: {
      fontSize: 16,
      color: c.text,
    },
    datePlaceholder: {
      fontSize: 16,
      color: c.textMuted,
    },
    clearButton: {
      width: 48,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearText: {
      fontSize: 22,
      color: c.textMuted,
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
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: {
      fontSize: 24,
    },
    moreChip: {
      width: 'auto',
      paddingHorizontal: spacing.md,
      borderColor: c.border,
      borderStyle: 'dashed',
    },
    moreText: {
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    pickSwatch: {
      borderWidth: 1.5,
      borderColor: c.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pickText: {
      fontSize: 20,
      color: c.text,
    },
    swatch: {
      width: 40,
      height: 40,
      borderRadius: radius.pill,
    },
    locked: {
      opacity: 0.5,
    },
    swatchSelected: {
      borderWidth: 3,
      borderColor: c.surface,
      outlineWidth: 2,
      outlineColor: c.text,
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
}
