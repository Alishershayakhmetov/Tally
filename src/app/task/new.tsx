import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { createTask, getTask, todayFor } from '@/db/repos/tasks';
import { DEFAULT_INCREMENTS, type TaskFormValues } from '@/domain/input';
import { ALL_WEEKDAYS_MASK } from '@/domain/periods';
import { TEMPLATES, templateForm, type TemplateId } from '@/domain/templates';
import { restartFormValues } from '@/features/tasks/formValues';
import { TaskForm } from '@/features/tasks/TaskForm';
import { TemplatePicker } from '@/features/tasks/TemplatePicker';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, TASK_COLORS, TASK_EMOJIS, type Colors } from '@/theme';

const BLANK: TaskFormValues = {
  name: '',
  emoji: TASK_EMOJIS[0],
  color: TASK_COLORS[4],
  measure: 'count',
  unitLabel: '',
  target: '',
  targetUnit: 'format',
  increments: DEFAULT_INCREMENTS.join(', '),
  recurrence: 'none',
  weekdayMask: ALL_WEEKDAYS_MASK,
  endDate: null,
  dayStartMin: null,
  reminderTime: null,
  description: '',
};

/** `from` (a finished task's id) opens a copy of it for "Do it again" instead of the templates. */
export default function NewTaskScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [source] = useState(() => (from ? getTask(from) : undefined));
  const [startDate] = useState(() => todayFor(source?.dayStartMin ?? null));
  const [templateId, setTemplateId] = useState<TemplateId | null>(null);
  const template = TEMPLATES.find((item) => item.id === templateId);
  const initial = source
    ? restartFormValues(source, startDate)
    : template
      ? templateForm(
          template,
          { name: t(`templates.${template.id}.name`), unit: t(`templates.${template.id}.unit`) },
          startDate,
        )
      : BLANK;

  return (
    <TaskForm
      initial={initial}
      resetKey={source?.id ?? templateId ?? 'blank'}
      startDate={startDate}
      submitLabel={t('form.create')}
      header={
        source ? (
          <Text style={styles.restart}>{t('restart.note', { name: source.name })}</Text>
        ) : (
          <TemplatePicker selected={templateId} onSelect={setTemplateId} />
        )
      }
      onSubmit={(value) => {
        const id = createTask(value);
        router.replace({ pathname: '/task/[id]', params: { id } });
      }}
    />
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    restart: {
      fontSize: 14,
      color: c.text,
      backgroundColor: c.track,
      borderRadius: radius.md,
      padding: spacing.md,
    },
  });
}
