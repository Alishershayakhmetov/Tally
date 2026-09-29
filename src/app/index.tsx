import { router, Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TaskCard } from '@/components/TaskCard';
import { useLive } from '@/db/live';
import { useSettings } from '@/db/settings';
import { listTaskViews, type TaskView } from '@/features/tasks/taskViews';
import { useNow } from '@/lib/clock';
import { useThemedStyles } from '@/lib/theme';
import { useWeekStart } from '@/lib/weekStart';
import { radius, spacing, type Colors } from '@/theme';

export default function HomeScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const weekStart = useWeekStart();
  const nowMs = useNow();
  const views = useLive(() => listTaskViews(nowMs, settings, weekStart));

  const active = views.filter((v) => v.lifecycle === 'active');
  const finished = views.filter((v) => v.lifecycle === 'finished');
  const archived = views.filter((v) => v.lifecycle === 'archived');

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityRole="button">
              <Text style={styles.headerAction}>{t('home.openSettings')}</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 112 }]}>
        {views.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('home.emptyBody')}</Text>
          </View>
        ) : null}
        {active.map((view) => (
          <TaskCard key={view.task.id} view={view} />
        ))}
        <Section title={t('home.finished')} views={finished} initiallyOpen />
        <Section title={t('home.archived')} views={archived} initiallyOpen={false} />
      </ScrollView>
      <Pressable
        onPress={() => router.push('/task/new')}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + spacing.xl },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('home.newTask')}
      >
        <Text style={styles.fabText}>＋ {t('home.newTask')}</Text>
      </Pressable>
    </View>
  );
}

function Section({
  title,
  views,
  initiallyOpen,
}: {
  title: string;
  views: TaskView[];
  initiallyOpen: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(initiallyOpen);
  if (views.length === 0) return null;
  let content: ReactNode = null;
  if (open) content = views.map((view) => <TaskCard key={view.task.id} view={view} />);
  return (
    <>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={styles.sectionHeader}
        accessibilityRole="button"
        aria-expanded={open}
      >
        <Text style={styles.sectionTitle}>
          {title} · {views.length}
        </Text>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {content}
    </>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    headerAction: {
      color: c.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    list: {
      padding: spacing.lg,
      gap: spacing.md,
      flexGrow: 1,
    },
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xxl,
    },
    emptyEmoji: {
      fontSize: 48,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    emptyText: {
      fontSize: 15,
      color: c.textMuted,
      textAlign: 'center',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.md,
      paddingVertical: spacing.xs,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    chevron: {
      fontSize: 16,
      color: c.textMuted,
    },
    fab: {
      position: 'absolute',
      right: spacing.xl,
      backgroundColor: c.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.lg,
      elevation: 4,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    },
    pressed: {
      opacity: 0.8,
    },
    fabText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
  });
}
