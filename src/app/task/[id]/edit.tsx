import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLive } from '@/db/live';
import { getTask, setArchived, softDeleteTask, updateTask, type TaskWithTotal } from '@/db/repos/tasks';
import { taskFormValues } from '@/features/tasks/formValues';
import { TaskForm } from '@/features/tasks/TaskForm';
import { confirmDestructive } from '@/lib/confirm';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

export default function EditTaskScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = useLive(() => getTask(id));
  if (!task) return null;

  async function confirmDelete(task: TaskWithTotal) {
    const ok = await confirmDestructive(
      t('form.deleteTitle', { name: task.name }),
      t('form.deleteBody'),
      t('common.delete'),
    );
    if (!ok) return;
    softDeleteTask(task.id);
    router.dismissTo('/');
  }

  const archived = task.archivedAt !== null;
  return (
    <TaskForm
      initial={taskFormValues(task)}
      startDate={task.startDate}
      measureLocked
      submitLabel={t('form.save')}
      onSubmit={(value) => {
        updateTask(task.id, value);
        router.back();
      }}
      footer={
        <View style={styles.footer}>
          <Pressable
            onPress={() => {
              setArchived(task.id, !archived);
              router.back();
            }}
            style={styles.secondary}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>{archived ? t('form.unarchive') : t('form.archive')}</Text>
          </Pressable>
          <Pressable onPress={() => confirmDelete(task)} style={styles.secondary} accessibilityRole="button">
            <Text style={styles.dangerText}>{t('form.delete')}</Text>
          </Pressable>
        </View>
      }
    />
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    footer: {
      gap: spacing.sm,
    },
    secondary: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    secondaryText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
    },
    dangerText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.danger,
    },
  });
}
