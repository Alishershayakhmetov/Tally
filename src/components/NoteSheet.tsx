import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { textOn } from '@/lib/contrast';
import { useThemedStyles } from '@/lib/theme';
import { radius, spacing, type Colors } from '@/theme';

const OPEN_MS = 340;
const CLOSE_MS = 240;
const MIN_HEIGHT = 240;

type Props = {
  /** The sheet's heading; the entry note's "Note" when left out. */
  title?: string;
  /** What the note belongs to: "+10 · Today · 18:42". */
  subtitle?: string;
  note: string;
  color: string;
  /**
   * Where the sheet's top edge sits, in window coordinates: the bottom of the counter, so the
   * counter stays in view and the sheet covers the rest of the task. Defaults to about a third down.
   */
  top?: number;
  /** The edit button's label; "Edit note" when left out. */
  editLabel?: string;
  onEdit: () => void;
  onClose: () => void;
};

/** A long note, slid up from the bottom over the task screen, down to (but not over) the counter. Mount only while open. */
export function NoteSheet({ title, subtitle, note, color, top, editLabel, onEdit, onClose }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight = Math.min(
    windowHeight * 0.92,
    Math.max(MIN_HEIGHT, windowHeight - (top ?? windowHeight * 0.36)),
  );

  const progress = useSharedValue(0);
  const reduceMotion = useRef(false);
  const closing = useRef(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!alive) return;
      reduceMotion.current = reduced;
      progress.set(withTiming(1, { duration: reduced ? 0 : OPEN_MS, easing: Easing.out(Easing.cubic) }));
    });
    return () => {
      alive = false;
    };
  }, [progress]);

  function close(then: () => void = onClose) {
    if (closing.current) return;
    closing.current = true;
    const duration = reduceMotion.current ? 0 : CLOSE_MS;
    progress.set(withTiming(0, { duration, easing: Easing.in(Easing.cubic) }));
    setTimeout(then, duration);
  }

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * sheetHeight }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
      <View style={styles.root}>
        <Animated.View style={[styles.scrim, scrimStyle]}>
          <Pressable style={styles.fill} onPress={() => close()} accessibilityLabel={t('notes.close')} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { height: sheetHeight, paddingBottom: insets.bottom + spacing.lg },
            sheetStyle,
          ]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>{title ?? t('notes.label')}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.text} selectable>
              {note}
            </Text>
          </ScrollView>
          <View style={styles.actions}>
            <Pressable onPress={() => close()} style={styles.secondary} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t('notes.close')}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                close(() => {
                  // The sheet is a Modal: left mounted it would sit over the screen Edit opens.
                  onClose();
                  onEdit();
                })
              }
              style={[styles.primary, { backgroundColor: color }]}
              accessibilityRole="button"
            >
              <Text style={[styles.primaryText, { color: textOn(color) }]}>
                {editLabel ?? t('notes.editTitle')}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.scrim,
    },
    fill: {
      flex: 1,
    },
    sheet: {
      width: '100%',
      maxWidth: 720,
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
      gap: spacing.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: spacing.xs,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    subtitle: {
      fontSize: 14,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    body: {
      flex: 1,
      marginTop: spacing.xs,
    },
    bodyContent: {
      paddingBottom: spacing.md,
    },
    text: {
      fontSize: 17,
      lineHeight: 25,
      color: c.text,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: spacing.sm,
    },
    secondary: {
      paddingHorizontal: spacing.md,
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
  });
}
