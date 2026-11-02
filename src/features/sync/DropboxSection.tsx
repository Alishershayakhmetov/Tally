import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { currentLogicalDate, deviceUtcOffsetMin } from '@/domain/days';
import { formatClock } from '@/domain/format';
import { formatDay } from '@/i18n/format';
import { confirmDestructive } from '@/lib/confirm';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

import {
  cancelSignIn,
  connectDropbox,
  disconnectDropbox,
  encryptCloudAgain,
  stopEncryptingHere,
  syncNow,
  useSyncState,
  type SyncState,
} from './dropboxSync';
import { EncryptionDialog } from './EncryptionDialog';

/** Settings → Dropbox sync: connect, the last sync, sync now, encryption, disconnect. */
export function DropboxSection() {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const colors = useColors();
  const sync = useSyncState();
  const [encryptionOpen, setEncryptionOpen] = useState(false);

  async function disconnect() {
    const message = sync.encryption.on
      ? `${t('sync.disconnectMessage')} ${t('sync.disconnectEncrypted')}`
      : t('sync.disconnectMessage');
    const confirmed = await confirmDestructive(t('sync.disconnectTitle'), message, t('sync.disconnect'));
    if (confirmed) await disconnectDropbox();
  }

  const needsPassword = sync.problem === 'passwordRequired' || sync.problem === 'passwordChanged';

  return (
    <View style={styles.section}>
      <Text style={styles.label}>{t('sync.title')}</Text>
      {sync.status === 'loading' ? (
        <ActivityIndicator color={colors.textMuted} style={styles.loading} />
      ) : sync.status === 'connected' ? (
        <>
          <Text style={styles.status}>
            {sync.account ? t('sync.account', { account: accountText(sync.account) }) : t('sync.connected')}
          </Text>
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {statusLine(t, sync)}
          </Text>
          <View style={styles.buttons}>
            <ActionButton
              label={sync.busy === 'syncing' ? t('sync.syncing') : t('sync.syncNow')}
              disabled={sync.busy !== null}
              onPress={syncNow}
            />
            <ActionButton label={t('sync.disconnect')} disabled={sync.busy !== null} onPress={disconnect} />
          </View>
          <Text style={styles.status}>
            {t('sync.encryption')}: {encryptionLabel(t, sync)}
          </Text>
          <View style={styles.buttons}>
            <ActionButton
              label={needsPassword ? t('sync.enterPassword') : t('sync.encryptionButton')}
              disabled={sync.busy !== null}
              onPress={() => setEncryptionOpen(true)}
            />
          </View>
        </>
      ) : (
        <View style={styles.buttons}>
          <ActionButton
            label={sync.busy === 'connecting' ? t('sync.connecting') : t('sync.connect')}
            disabled={sync.busy !== null}
            onPress={() => void connectDropbox()}
          />
          {sync.busy === 'connecting' && cancelSignIn ? (
            <ActionButton label={t('common.cancel')} disabled={false} onPress={cancelSignIn} />
          ) : null}
        </View>
      )}
      {sync.problem ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {t(`sync.problems.${sync.problem}`)}
        </Text>
      ) : null}
      {sync.problem === 'cloudNotEncrypted' ? (
        <View style={styles.buttons}>
          <ActionButton
            label={t('sync.encryptAgain')}
            disabled={sync.busy !== null}
            onPress={() => void encryptCloudAgain()}
          />
          <ActionButton
            label={t('sync.stopEncrypting')}
            disabled={sync.busy !== null}
            onPress={() => void stopEncryptingHere()}
          />
        </View>
      ) : null}
      <Text style={styles.hint}>{t('sync.hint')}</Text>
      {encryptionOpen ? <EncryptionDialog onClose={() => setEncryptionOpen(false)} /> : null}
    </View>
  );
}

function accountText(account: NonNullable<SyncState['account']>): string {
  if (account.name && account.email) return `${account.name} (${account.email})`;
  return account.name || account.email;
}

/** "Off", "On", or what the next sync will do about it. */
function encryptionLabel(t: ReturnType<typeof useTranslation>['t'], sync: SyncState): string {
  const { on, pending } = sync.encryption;
  if (on) return t(pending ? 'sync.encryptionOnPending' : 'sync.encryptionOn');
  return t(pending ? 'sync.encryptionOffPending' : 'sync.encryptionOff');
}

/** "Synced today, 14:05 · brought in 3 entries" or "Not synced yet". */
function statusLine(t: ReturnType<typeof useTranslation>['t'], sync: SyncState): string {
  if (sync.lastSyncAt === null) return t('sync.never');
  const at = new Date(sync.lastSyncAt);
  const day = formatDay(t, currentLogicalDate(at, 0), currentLogicalDate(new Date(), 0));
  const when = t('sync.last', { time: `${day}, ${formatClock(sync.lastSyncAt, deviceUtcOffsetMin(at))}` });
  const pulled = sync.lastPulled;
  if (!pulled || pulled.tasksAdded + pulled.entriesAdded + pulled.updated === 0) return when;
  return `${when} · ${t('sync.pulled', pulled)}`;
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
    loading: {
      alignSelf: 'flex-start',
    },
    status: {
      fontSize: 14,
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
    error: {
      fontSize: 14,
      color: c.danger,
    },
    hint: {
      fontSize: 13,
      color: c.textMuted,
    },
  });
}
