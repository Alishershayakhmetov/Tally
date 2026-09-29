import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { openDatabase } from '@/db/client';
import { colors, spacing } from '@/theme';

type DbState = { status: 'opening' } | { status: 'ready' } | { status: 'failed'; message: string };

export default function RootLayout() {
  const [db, setDb] = useState<DbState>({ status: 'opening' });

  useEffect(() => {
    openDatabase().then(
      () => setDb({ status: 'ready' }),
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
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Task Counter' }} />
        <Stack.Screen name="task/new" options={{ title: 'New task', presentation: 'modal' }} />
        <Stack.Screen name="task/[id]" options={{ title: '' }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.danger,
  },
  errorText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
