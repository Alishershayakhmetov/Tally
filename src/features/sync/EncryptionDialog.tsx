import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkPassword, MIN_PASSWORD_LENGTH } from '@/domain/syncCrypto';
import { textOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

import {
  inspectCloud,
  replaceCloudData,
  setSyncPassword,
  unlockSyncPassword,
  useSyncState,
  type CloudForm,
} from './dropboxSync';

type Mode = 'set' | 'enter' | 'reset';

/**
 * The window behind "Encryption…" in Settings. It explains what a sync password does
 * and what happens to the file already in Dropbox, and has three faces:
 * - set: choose, change or remove the password (empty means no encryption);
 * - enter: the file in Dropbox is encrypted and this device needs its password;
 * - reset: forgot it? replace the file in Dropbox with this device's data.
 * Mount it only while open.
 */
export function EncryptionDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const sync = useSyncState();

  const [cloud, setCloud] = useState<CloudForm | null>(null);
  const [forgot, setForgot] = useState(false);
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const repeatRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // The fields sit under the explanation. When the keyboard opens, bring them into view: a
  // KeyboardAwareScrollView would do it, but it also turns the first tap on a button into
  // "close the keyboard", which these buttons (like the amount dialog's) must not do.
  const showFields = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);

  useEffect(() => {
    alive.current = true;
    void inspectCloud().then(({ form }) => alive.current && setCloud(form));
    return () => {
      alive.current = false;
    };
  }, []);

  // A device that has no usable password for an encrypted file can only enter one (or start over).
  const asksPassword =
    sync.problem === 'passwordRequired' ||
    sync.problem === 'passwordChanged' ||
    (cloud === 'encrypted' && !sync.encryption.on);
  const mode: Mode = forgot
    ? 'reset'
    : asksPassword && cloud !== 'plain' && cloud !== 'none'
      ? 'enter'
      : 'set';
  const busy = progress !== null;
  const typed = password !== '';
  const turningOff = mode === 'set' && sync.encryption.on && !typed && repeat === '';

  function switchTo(next: 'reset' | 'back') {
    setForgot(next === 'reset');
    setPassword('');
    setRepeat('');
    setError(null);
  }

  async function submit() {
    if (busy) return;
    setError(null);
    if (mode !== 'enter') {
      const problem = checkPassword(password, repeat);
      if (problem) {
        setError(t(`encryption.errors.${problem}`, { min: MIN_PASSWORD_LENGTH }));
        return;
      }
    } else if (!typed) {
      setError(t('encryption.errors.empty'));
      return;
    }
    setProgress(0);
    try {
      if (mode === 'set') {
        await setSyncPassword(password, (fraction) => alive.current && setProgress(fraction));
      } else if (mode === 'reset') {
        await replaceCloudData(password, (fraction) => alive.current && setProgress(fraction));
      } else {
        const result = await unlockSyncPassword(
          password,
          (fraction) => alive.current && setProgress(fraction),
        );
        if (result !== 'ok') {
          // 'notEncrypted': nothing to unlock any more; the next sync carries on by itself.
          if (alive.current) setError(t(`encryption.errors.unlock.${result}`));
          if (result !== 'notEncrypted') {
            setProgress(null);
            return;
          }
        }
      }
      onClose();
    } catch (failure) {
      console.warn('Changing the sync password failed', failure);
      if (alive.current) setError(t('encryption.errors.failed'));
    } finally {
      if (alive.current) setProgress(null);
    }
  }

  const submitLabel =
    mode === 'enter'
      ? t('encryption.unlock')
      : mode === 'reset'
        ? t('encryption.replace')
        : turningOff
          ? t('encryption.turnOff')
          : sync.encryption.on
            ? t('encryption.change')
            : t('encryption.enable');
  const submitDisabled = busy || (mode === 'set' && !typed && !sync.encryption.on);
  const title =
    mode === 'enter'
      ? t('encryption.titleEnter')
      : mode === 'reset'
        ? t('encryption.titleReset')
        : sync.encryption.on
          ? t('encryption.titleOn')
          : t('encryption.title');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <Pressable
        style={styles.scrim}
        onPress={busy ? undefined : onClose}
        accessibilityLabel={t('amount.close')}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.avoider} pointerEvents="box-none">
        <View
          style={[styles.dialog, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.lg }]}
          pointerEvents="box-none"
        >
          <View style={styles.card}>
            <ScrollView
              ref={scrollRef}
              style={styles.body}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Explanation mode={mode} cloud={cloud} on={sync.encryption.on} problem={sync.problem} />

              <View style={styles.field}>
                <View style={styles.inputRow}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={() => (mode === 'enter' ? void submit() : repeatRef.current?.focus())}
                    blurOnSubmit={mode === 'enter'}
                    onFocus={showFields}
                    secureTextEntry={!show}
                    placeholder={mode === 'enter' ? t('encryption.password') : t('encryption.passwordNew')}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    returnKeyType={mode === 'enter' ? 'done' : 'next'}
                    editable={!busy}
                    style={styles.input}
                    accessibilityLabel={t('encryption.password')}
                    testID="encryption-password"
                  />
                  <Pressable
                    onPress={() => setShow((value) => !value)}
                    style={styles.showButton}
                    accessibilityRole="button"
                    accessibilityLabel={show ? t('encryption.hide') : t('encryption.show')}
                  >
                    <Text style={styles.showText}>{show ? t('encryption.hide') : t('encryption.show')}</Text>
                  </Pressable>
                </View>
                {mode === 'enter' ? null : (
                  <TextInput
                    ref={repeatRef}
                    onFocus={showFields}
                    value={repeat}
                    onChangeText={setRepeat}
                    onSubmitEditing={() => void submit()}
                    secureTextEntry={!show}
                    placeholder={t('encryption.repeat')}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    returnKeyType="done"
                    editable={!busy}
                    style={styles.input}
                    accessibilityLabel={t('encryption.repeat')}
                    testID="encryption-repeat"
                  />
                )}
                {mode === 'set' ? (
                  <Text style={styles.hint}>
                    {sync.encryption.on
                      ? t('encryption.fieldsHintOn', { min: MIN_PASSWORD_LENGTH })
                      : t('encryption.fieldsHint', { min: MIN_PASSWORD_LENGTH })}
                  </Text>
                ) : null}
              </View>

              {mode === 'enter' ? (
                <Pressable
                  onPress={() => switchTo('reset')}
                  disabled={busy}
                  accessibilityRole="button"
                  style={styles.link}
                >
                  <Text style={styles.linkText}>{t('encryption.forgot')}</Text>
                </Pressable>
              ) : null}
              {mode === 'reset' && asksPassword ? (
                <Pressable
                  onPress={() => switchTo('back')}
                  disabled={busy}
                  accessibilityRole="button"
                  style={styles.link}
                >
                  <Text style={styles.linkText}>{t('encryption.remembered')}</Text>
                </Pressable>
              ) : null}
            </ScrollView>
            {error || busy ? (
              <View style={styles.status}>
                {error ? (
                  <Text style={styles.error} accessibilityLiveRegion="polite">
                    {error}
                  </Text>
                ) : null}
                {busy ? (
                  <View style={styles.progress} accessibilityLiveRegion="polite">
                    <ActivityIndicator color={colors.textMuted} />
                    <Text style={styles.hint}>
                      {t('encryption.working', { percent: Math.round((progress ?? 0) * 100) })}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                onPress={onClose}
                disabled={busy}
                style={[styles.secondary, busy && styles.dimmed]}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => void submit()}
                disabled={submitDisabled}
                style={[
                  styles.primary,
                  { backgroundColor: mode === 'reset' || turningOff ? colors.danger : colors.primary },
                  submitDisabled && styles.dimmed,
                ]}
                accessibilityRole="button"
                aria-disabled={submitDisabled}
                testID="encryption-submit"
              >
                <Text
                  style={[
                    styles.primaryText,
                    { color: textOn(mode === 'reset' || turningOff ? colors.danger : colors.primary) },
                  ]}
                >
                  {submitLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** What this does, and what becomes of the file already in Dropbox, for the window's current face. */
function Explanation(props: { mode: Mode; cloud: CloudForm | null; on: boolean; problem: string | null }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const { mode, cloud, on, problem } = props;
  const paragraphs: string[] = [];

  if (mode === 'enter') {
    paragraphs.push(t(problem === 'passwordChanged' ? 'encryption.enterChanged' : 'encryption.enterIntro'));
  } else if (mode === 'reset') {
    paragraphs.push(t('encryption.resetIntro'), t('encryption.resetOthers'), t('encryption.resetLoss'));
  } else if (on) {
    paragraphs.push(t('encryption.onIntro'), t('encryption.onOthers'), t('encryption.history'));
  } else {
    paragraphs.push(t('encryption.intro'));
    paragraphs.push(
      cloud === null
        ? t('encryption.cloudChecking')
        : cloud === 'plain'
          ? t('encryption.cloudPlain')
          : cloud === 'none'
            ? t('encryption.cloudNone')
            : t('encryption.cloudUnknown'),
    );
    paragraphs.push(t('encryption.others'), t('encryption.noRecovery'), t('encryption.exportNote'));
  }
  return (
    <View style={styles.paragraphs}>
      {paragraphs.map((text) => (
        <Text key={text} style={styles.paragraph}>
          {text}
        </Text>
      ))}
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.scrim,
    },
    avoider: {
      ...StyleSheet.absoluteFill,
    },
    dialog: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
    },
    card: {
      width: '100%',
      maxWidth: 460,
      maxHeight: '100%',
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    body: {
      flexGrow: 0,
      flexShrink: 1,
    },
    content: {
      padding: spacing.xl,
      paddingBottom: spacing.sm,
      gap: spacing.md,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    paragraphs: {
      gap: spacing.sm,
    },
    paragraph: {
      fontSize: 14,
      lineHeight: 20,
      color: c.text,
    },
    field: {
      gap: spacing.sm,
    },
    inputRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    input: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: 17,
      color: c.text,
    },
    showButton: {
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    showText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    hint: {
      fontSize: 13,
      color: c.textMuted,
    },
    error: {
      fontSize: 14,
      color: c.danger,
    },
    // Always in view, above the buttons: with the keyboard open the fields' own surroundings scroll away.
    status: {
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
    },
    progress: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    link: {
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
    },
    linkText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      textDecorationLine: 'underline',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    secondary: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    secondaryText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textMuted,
    },
    primary: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    primaryText: {
      fontSize: 16,
      fontWeight: '700',
    },
    dimmed: {
      opacity: 0.5,
    },
  });
}
