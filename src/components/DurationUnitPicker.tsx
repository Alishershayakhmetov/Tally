import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Platform, type KeyboardTypeOptions } from 'react-native';

import { DURATION_UNITS, type DurationUnit } from '@/domain/measure';

import { Segmented } from './Segmented';

type Props = {
  value: DurationUnit;
  onChange: (unit: DurationUnit) => void;
};

/**
 * How a time is typed: in the h:mm:ss format, or as a plain number of hours,
 * minutes or seconds. Stacked, because four labels don't fit a phone's row.
 */
export function DurationUnitPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <Segmented<DurationUnit>
      vertical
      accessibilityLabel={t('duration.unit')}
      value={value}
      onChange={onChange}
      options={DURATION_UNITS.map((unit) => ({ value: unit, label: t(`duration.units.${unit}`) }))}
    />
  );
}

/** "Hours, e.g. 1.5", or null for the format, whose hint depends on the field. */
export function unitHint(t: TFunction, unit: DurationUnit): string | null {
  return unit === 'format' ? null : t(`duration.hints.${unit}`);
}

/** "e.g. 1.5" under the hours unit; the format keeps the field's own placeholder. */
export function unitPlaceholder(t: TFunction, unit: DurationUnit): string | null {
  return unit === 'format' ? null : t(`duration.placeholders.${unit}`);
}

/**
 * Android's numeric keypad has no ":", so the format uses the full keyboard
 * there. A plain number gets the decimal pad; its sign has the ± button.
 */
export function durationKeyboard(unit: DurationUnit): KeyboardTypeOptions {
  if (Platform.OS === 'ios') return unit === 'format' ? 'numbers-and-punctuation' : 'decimal-pad';
  return unit === 'format' ? 'default' : 'decimal-pad';
}
