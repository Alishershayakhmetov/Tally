import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createTask, todayFor } from '@/db/repos/tasks';
import { DEFAULT_INCREMENTS, type TaskFormValues } from '@/domain/input';
import { ALL_WEEKDAYS_MASK } from '@/domain/periods';
import { TaskForm } from '@/features/tasks/TaskForm';
import { TASK_COLORS, TASK_EMOJIS } from '@/theme';

const INITIAL: TaskFormValues = {
  name: '',
  emoji: TASK_EMOJIS[0],
  color: TASK_COLORS[4],
  measure: 'count',
  unitLabel: '',
  target: '',
  increments: DEFAULT_INCREMENTS.join(', '),
  recurrence: 'none',
  weekdayMask: ALL_WEEKDAYS_MASK,
  endDate: null,
  dayStartMin: null,
  reminderTime: null,
};

export default function NewTaskScreen() {
  const { t } = useTranslation();
  const [startDate] = useState(() => todayFor(null));
  return (
    <TaskForm
      initial={INITIAL}
      startDate={startDate}
      submitLabel={t('form.create')}
      onSubmit={(value) => {
        const id = createTask(value);
        router.replace({ pathname: '/task/[id]', params: { id } });
      }}
    />
  );
}
