import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { openDatabase } from '@/db/client';
import { getSettings, useSettings } from '@/db/settings';
import i18n, { resolveLanguage } from '@/i18n';
import { useColors } from '@/lib/theme';
import { startReminders } from '@/notifications/scheduler';
import { lightColors, spacing } from '@/theme';

type DbState = { status: 'opening' } | { status: 'ready' } | { status: 'failed'; message: string };

export default function RootLayout() {
  const [db, setDb] = useState<DbState>({ status: 'opening' });

  useEffect(() => {
    openDatabase().then(
      async () => {
        await i18n.changeLanguage(resolveLanguage(getSettings().language));
        setDb({ status: 'ready' });
      },
      (error: unknown) =>
        setDb({ status: 'failed', message: error instanceof Error ? error.message : String(error) }),
    );
  }, []);

  if (db.status === 'failed') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Could not open the database</Text>
        <Text style={styles.errorText}>{db.message}</Text>
      </View>
    );
  }
  if (db.status === 'opening') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={lightColors.primary} />
      </View>
    );
  }
  return <AppShell />;
}

function AppShell() {
  const { t } = useTranslation();
  const language = useSettings().language;
  const colors = useColors();

  useEffect(() => {
    void i18n.changeLanguage(resolveLanguage(language));
  }, [language]);

  // Tapping a reminder opens its task; deferred so the navigator is mounted on a cold start.
  useEffect(
    () =>
      startReminders((taskId) =>
        setTimeout(() => router.push({ pathname: '/task/[id]', params: { id: taskId } }), 0),
      ),
    [],
  );

  const navigationTheme = useMemo(() => {
    const base = colors.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [colors]);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: t('screens.home') }} />
        <Stack.Screen name="settings" options={{ title: t('screens.settings') }} />
        <Stack.Screen name="task/new" options={{ title: t('screens.newTask'), presentation: 'modal' }} />
        <Stack.Screen name="task/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="task/[id]/edit" options={{ title: t('screens.editTask') }} />
        <Stack.Screen name="task/[id]/history" options={{ title: t('screens.history') }} />
        <Stack.Screen name="task/[id]/stats" options={{ title: t('screens.stats') }} />
        <Stack.Screen name="task/[id]/tap" options={{ title: t('screens.tap') }} />
      </Stack>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: lightColors.background,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: lightColors.danger,
  },
  errorText: {
    fontSize: 14,
    color: lightColors.textMuted,
    textAlign: 'center',
  },
});
