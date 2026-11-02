import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { importBackup, readBackup } from '@/db/backup';
import { backupFileName, parseBackup, serializeBackup } from '@/domain/backup';
import { currentLogicalDate } from '@/domain/days';
import { now } from '@/lib/clock';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

import { pickBackupFile, shareBackupFile } from './files';

type Outcome = { kind: 'ok' | 'error'; text: string };

export function BackupSection() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function run(action: () => Promise<Outcome | null>) {
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await action());
    } finally {
      setBusy(false);
    }
  }

  const exportData = () =>
    run(async () => {
      try {
        const at = new Date(now());
        // The calendar date on this phone (cutoff 00:00), not a task's logical day.
        const fileName = backupFileName(currentLogicalDate(at, 0));
        const saved = await shareBackupFile(
          fileName,
          serializeBackup(readBackup(at)),
          t('backup.dialogTitle'),
        );
        if (!saved) return null;
        return { kind: 'ok', text: t('backup.exported', { file: fileName }) };
      } catch (error) {
        console.warn('Backup export failed', error);
        return { kind: 'error', text: t('backup.exportFailed') };
      }
    });

  const importData = () =>
    run(async () => {
      let text: string | null;
      try {
        text = await pickBackupFile();
      } catch (error) {
        console.warn('Reading the backup file failed', error);
        return { kind: 'error', text: t('backup.readFailed') };
      }
      if (text === null) return null;

      const parsed = parseBackup(text);
      if (!parsed.ok) {
        if (parsed.detail) console.warn('Backup rejected at', parsed.detail);
        const key = parsed.error === 'notJson' ? 'notBackup' : parsed.error;
        return { kind: 'error', text: t(`backup.${key}`) };
      }
      try {
        const summary = importBackup(parsed.backup);
        const changed = summary.tasksAdded + summary.entriesAdded + summary.updated > 0;
        return { kind: 'ok', text: changed ? t('backup.imported', summary) : t('backup.nothingNew') };
      } catch (error) {
        console.warn('Backup import failed', error);
        return { kind: 'error', text: t('backup.importFailed') };
      }
    });

  return (
    <View style={styles.section}>
      <Text style={styles.label}>{t('backup.title')}</Text>
      <View style={styles.buttons}>
        <ActionButton label={t('backup.export')} disabled={busy} onPress={exportData} />
        <ActionButton label={t('backup.import')} disabled={busy} onPress={importData} />
      </View>
      {outcome ? (
        <Text
          style={[styles.outcome, outcome.kind === 'error' && styles.error]}
          accessibilityLiveRegion="polite"
        >
          {outcome.text}
        </Text>
      ) : null}
      <Text style={styles.hint}>{t('backup.hint')}</Text>
    </View>
  );
}

function ActionButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}
      accessibilityRole="button"
      aria-disabled={disabled}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    section: {
      gap: spacing.sm,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    buttons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    button: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    dimmed: {
      opacity: 0.6,
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '600',
      // Not c.primary: blue on the dark surface is below 4.5:1.
      color: c.text,
    },
    outcome: {
      fontSize: 14,
      color: c.text,
    },
    error: {
      color: c.danger,
    },
    hint: {
      fontSize: 13,
      color: c.textMuted,
    },
  });
}
