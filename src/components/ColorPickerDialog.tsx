import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ColorPicker, { HueSlider, Panel1, Preview, Swatches } from 'reanimated-color-picker';

import { normalizeHex, textOn } from '@/lib/contrast';
import { useColors, useThemedStyles } from '@/lib/theme';
import { radius, spacing, TASK_COLORS, type Colors } from '@/theme';

type Props = {
  value: string;
  onSelect: (color: string) => void;
  onClose: () => void;
};

/**
 * Any task colour (Phase 8): a saturation/brightness panel, a hue slider and a
 * HEX field, with the built-in colours as swatches. Text on the colour picks
 * white or dark by itself (textOn), so any choice stays readable. Mount only
 * while open.
 */
export function ColorPickerDialog({ value, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const styles = useThemedStyles(makeStyles);
  const colors = useColors();
  /** The colour that Choose saves. */
  const [color, setColor] = useState(value);
  /** What the panel and slider show; changes when a full HEX is typed. */
  const [pickerValue, setPickerValue] = useState(value);
  const [hexText, setHexText] = useState(value);

  function typeHex(text: string) {
    setHexText(text);
    const next = normalizeHex(text);
    if (next) {
      setColor(next);
      setPickerValue(next);
    }
  }

  function choose() {
    onSelect(color);
    onClose();
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* A modal is its own window on Android, so its gestures need their own root. */}
      <GestureHandlerRootView style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={t('amount.close')} />
        <View style={styles.dialog} pointerEvents="box-none">
          <View style={styles.card}>
            <Text style={styles.title}>{t('colorPicker.title')}</Text>
            <ColorPicker
              value={pickerValue}
              onCompleteJS={({ hex }) => {
                const next = normalizeHex(hex);
                if (next) {
                  setColor(next);
                  setHexText(next);
                }
              }}
              style={styles.picker}
              thumbSize={28}
              sliderThickness={28}
            >
              <View style={styles.top}>
                <Preview hideInitialColor hideText style={styles.preview} />
                {/* Our own field: it applies a colour as soon as six hex digits are typed. */}
                <TextInput
                  value={hexText}
                  onChangeText={typeHex}
                  placeholder="#RRGGBB"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={7}
                  style={styles.hexInput}
                  accessibilityLabel={t('colorPicker.hex')}
                />
              </View>
              <Panel1 style={styles.panel} accessibilityLabel={t('colorPicker.panel')} />
              <HueSlider style={styles.slider} accessibilityLabel={t('colorPicker.hue')} />
              <Swatches colors={[...TASK_COLORS]} style={styles.swatches} swatchStyle={styles.swatch} />
            </ColorPicker>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={styles.secondary} accessibilityRole="button">
                <Text style={styles.secondaryText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={choose}
                style={[styles.primary, { backgroundColor: color }]}
                accessibilityRole="button"
                accessibilityLabel={`${t('colorPicker.choose')} ${color}`}
              >
                <Text style={[styles.primaryText, { color: textOn(color) }]}>{t('colorPicker.choose')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: c.scrim,
    },
    // Anchored near the top, so the HEX field stays above the keyboard.
    dialog: {
      ...StyleSheet.absoluteFill,
      alignItems: 'center',
      paddingTop: 72,
      paddingHorizontal: spacing.lg,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.md,
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: c.text,
    },
    picker: {
      gap: spacing.md,
    },
    top: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    preview: {
      width: 64,
      height: 44,
      borderRadius: radius.md,
    },
    hexInput: {
      flex: 1,
      minWidth: 0,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 18,
      color: c.text,
      fontVariant: ['tabular-nums'],
    },
    panel: {
      height: 180,
      borderRadius: radius.md,
    },
    slider: {
      borderRadius: radius.pill,
    },
    swatches: {
      justifyContent: 'space-between',
      marginTop: 0,
      marginBottom: 0,
    },
    swatch: {
      width: 30,
      height: 30,
      borderRadius: 15,
      marginHorizontal: 0,
      marginBottom: 0,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    secondary: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
    },
    secondaryText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    primary: {
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
    },
    primaryText: {
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
