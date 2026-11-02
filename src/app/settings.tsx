import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '@/components/Segmented';
import { TimeStepper } from '@/components/TimeStepper';
import { getSettings, updateSetting, useSettings } from '@/db/settings';
import { currentLogicalDate, deviceUtcOffsetMin } from '@/domain/days';
import { formatClock } from '@/domain/format';
import type { WeekStartPref } from '@/domain/periods';
import { clampDayStart, type LanguagePref, type ThemePref } from '@/domain/settings';
import { BackupSection } from '@/features/backup/BackupSection';
import { DropboxSection } from '@/features/sync/DropboxSection';
import { syncSupported, useSyncState } from '@/features/sync/dropboxSync';
import { setClockOffsetMs, useClockOffsetMs, useNow } from '@/lib/clock';
import { tapFeedback } from '@/lib/haptics';
import { useNotificationPermission } from '@/notifications/scheduler';
import { useColors, useThemedStyles } from '@/lib/theme';
import { localeFirstWeekday } from '@/lib/weekStart';
import { radius, spacing, type Colors } from '@/theme';

const HOUR_MS = 3_600_000;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const sync = useSyncState();
  const weekdaysShort = t('date.weekdaysShort', { returnObjects: true }) as string[];
  const weekdaysLong = t('date.weekdaysLong', { returnObjects: true }) as string[];

  return (
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
      <Row label={t('settings.language')}>
        <Segmented<LanguagePref>
          accessibilityLabel={t('settings.language')}
          value={settings.language}
          onChange={(value) => updateSetting('language', value)}
          options={[
            { value: 'system', label: t('settings.system') },
            { value: 'en', label: 'English' },
            { value: 'ru', label: 'Русский' },
          ]}
        />
      </Row>

      <Row label={t('settings.theme')}>
        <Segmented<ThemePref>
          accessibilityLabel={t('settings.theme')}
          value={settings.theme}
          onChange={(value) => updateSetting('theme', value)}
          options={[
            { value: 'system', label: t('settings.system') },
            { value: 'light', label: t('settings.light') },
            { value: 'dark', label: t('settings.dark') },
          ]}
        />
      </Row>

      {/* A computer can't vibrate. */}
      {Platform.OS === 'web' ? null : (
        <SwitchRow
          label={t('settings.vibration')}
          hint={t('settings.vibrationHint')}
          value={settings.vibration}
          onChange={(value) => {
            updateSetting('vibration', value);
            // A sample buzz confirms it works; turning it off stays silent.
            tapFeedback();
          }}
        />
      )}

      <Row label={t('settings.weekStart')}>
        <Segmented<WeekStartPref>
          accessibilityLabel={t('settings.weekStart')}
          value={settings.weekStart}
          onChange={(value) => updateSetting('weekStart', value)}
          options={[
            { value: 'auto', label: t('settings.auto', { day: weekdaysShort[localeFirstWeekday() ?? 1] }) },
            { value: 1, label: weekdaysLong[1] },
            { value: 0, label: weekdaysLong[0] },
          ]}
        />
      </Row>

      <Row label={t('settings.dayStart')} hint={t('settings.dayStartHint')}>
        <TimeStepper
          minutes={settings.dayStartMin}
          onStep={(delta) => updateSetting('dayStartMin', clampDayStart(getSettings().dayStartMin + delta))}
          earlierLabel={t('form.earlier')}
          laterLabel={t('form.later')}
        />
      </Row>

      <NotificationsRow />

      {syncSupported ? <DropboxSection /> : null}

      <BackupSection />

      <Text style={styles.note}>
        {sync.status === 'connected' ? t('settings.storageDropbox') : t('settings.storage')}
      </Text>

      {__DEV__ ? <DeveloperTools /> : null}
    </ScrollView>
  );
}

function NotificationsRow() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [permission, request] = useNotificationPermission();
  const status =
    permission === 'granted'
      ? t('settings.notificationsGranted')
      : permission === 'denied'
        ? t('settings.notificationsDenied')
        : permission === 'unavailable'
          ? t('settings.notificationsWeb')
          : t('settings.notificationsUndetermined');
  return (
    <Row
      label={t('settings.notifications')}
      hint={permission === 'unavailable' ? undefined : t('settings.reminderNote')}
    >
      <View style={styles.statusRow}>
        <Text style={styles.dev}>{permission === null ? '…' : status}</Text>
        {permission === 'undetermined' ? (
          <DevButton label={t('settings.allow')} onPress={() => void request()} />
        ) : null}
      </View>
    </Row>
  );
}

/** Shifts the app clock so day rollover can be checked without waiting for the cutoff. */
function DeveloperTools() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const settings = useSettings();
  const offset = useClockOffsetMs();
  const nowMs = useNow();
  const clock = formatClock(nowMs, deviceUtcOffsetMin(new Date(nowMs)));
  const logicalToday = currentLogicalDate(new Date(nowMs), settings.dayStartMin);

  return (
    <Row label={t('settings.developer')}>
      <Text style={styles.dev}>{t('settings.clock', { time: `${logicalToday} · ${clock}` })}</Text>
      <Text style={styles.dev}>{t('settings.clockOffset', { hours: Math.round(offset / HOUR_MS) })}</Text>
      <View style={styles.devButtons}>
        <DevButton label={t('settings.plusHour')} onPress={() => setClockOffsetMs(offset + HOUR_MS)} />
        <DevButton label={t('settings.plusDay')} onPress={() => setClockOffsetMs(offset + 24 * HOUR_MS)} />
        <DevButton label={t('settings.resetClock')} onPress={() => setClockOffsetMs(0)} />
      </View>
    </Row>
  );
}

function DevButton({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={styles.devButton} accessibilityRole="button">
      <Text style={styles.devButtonText}>{label}</Text>
    </Pressable>
  );
}

function SwitchRow(props: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const { label, hint, value, onChange } = props;
  const styles = useThemedStyles(makeStyles);
  const c = useColors();
  return (
    <View style={styles.row}>
      <View style={styles.switchLine}>
        <Text style={[styles.label, styles.grow]}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: c.textMuted, true: c.primary }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={c.textMuted}
          accessibilityLabel={label}
        />
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    content: {
      padding: spacing.lg,
      gap: spacing.xl,
    },
    row: {
      gap: spacing.sm,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    switchLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    grow: {
      flex: 1,
    },
    hint: {
      fontSize: 13,
      color: c.textMuted,
    },
    note: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: 'center',
    },
    dev: {
      fontSize: 14,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    devButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    devButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    devButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
  });
}
