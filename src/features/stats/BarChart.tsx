import { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import type { Axis, Bar } from '@/domain/stats';
import { useThemedStyles } from '@/lib/theme';
import { spacing, type Colors } from '@/theme';

// One series, drawn with plain Views (no chart library): bars at most 24px wide
// with a 2px gap, 4px rounded at the value end and square at the baseline,
// hairline gridlines, an optional goal line. Tap or drag across the plot to
// pick a bar; each bar is also reachable by a screen reader.

const PLOT_HEIGHT = 160;
const Y_AXIS_WIDTH = 48;
const MAX_BAR_WIDTH = 24;
const GAP = 2;
const MIN_VISIBLE = 2;

type Props = {
  bars: Bar[];
  axis: Axis;
  /** The goal as a reference line (the caption explains it), or null. */
  goal: number | null;
  /** Mark colour, already checked for 3:1 against the surface. */
  color: string;
  selected: number;
  onSelect: (index: number) => void;
  tickLabel: (value: number) => string;
  /** Short labels under the first, middle and last bar. */
  axisLabel: (bar: Bar) => string;
  /** "Sep 28: 40" for screen readers. */
  accessibilityLabelFor: (bar: Bar) => string;
};

export function BarChart(props: Props) {
  const { bars, axis, goal, color, selected, onSelect, tickLabel, axisLabel } = props;
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);

  const range = axis.max - axis.min;
  const y = (value: number) => (PLOT_HEIGHT * (axis.max - value)) / range;
  const baseline = y(0);
  const slot = bars.length > 0 ? width / bars.length : 0;
  const barWidth = Math.max(1, Math.min(MAX_BAR_WIDTH, slot - GAP));
  const radius = Math.min(4, barWidth / 2);
  const pick = (event: GestureResponderEvent) => {
    if (slot <= 0) return;
    const index = Math.floor(event.nativeEvent.locationX / slot);
    onSelect(Math.max(0, Math.min(bars.length - 1, index)));
  };
  const labelled =
    bars.length > 2 ? [0, Math.floor((bars.length - 1) / 2), bars.length - 1] : bars.map((_, i) => i);

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.yAxis}>
          {axis.ticks.map((tick) => (
            <Text key={tick} style={[styles.tick, { top: y(tick) - 8 }]} numberOfLines={1}>
              {tickLabel(tick)}
            </Text>
          ))}
        </View>
        <View
          style={styles.plot}
          onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
        >
          {axis.ticks.map((tick) => (
            <View key={tick} style={[styles.grid, { top: y(tick) }, tick === 0 && styles.zero]} />
          ))}
          {bars.map((bar, i) => {
            const size = Math.abs(y(bar.total) - baseline);
            const height = bar.total === 0 ? 0 : Math.max(MIN_VISIBLE, size);
            const up = bar.total >= 0;
            return (
              <View
                key={bar.period.start}
                accessible
                accessibilityRole="button"
                accessibilityLabel={props.accessibilityLabelFor(bar)}
                aria-selected={i === selected}
                accessibilityActions={[{ name: 'activate' }]}
                onAccessibilityAction={() => onSelect(i)}
                style={[
                  styles.bar,
                  {
                    left: i * slot + (slot - barWidth) / 2,
                    width: barWidth,
                    height,
                    top: up ? baseline - height : baseline,
                    backgroundColor: color,
                  },
                  up
                    ? { borderTopLeftRadius: radius, borderTopRightRadius: radius }
                    : { borderBottomLeftRadius: radius, borderBottomRightRadius: radius },
                ]}
              />
            );
          })}
          {goal !== null && goal <= axis.max ? <View style={[styles.goal, { top: y(goal) }]} /> : null}
          {/* Touch layer on top, so locationX is always relative to the plot (on Android it's
              relative to the touched view). Screen readers skip it and reach the bars. */}
          <View
            style={StyleSheet.absoluteFill}
            accessible={false}
            importantForAccessibility="no"
            onStartShouldSetResponder={() => true}
            onResponderGrant={pick}
            onResponderMove={pick}
            onResponderTerminationRequest={() => true}
          />
        </View>
      </View>
      <View style={styles.xAxis}>
        {selected >= 0 && slot > 0 ? (
          <View style={[styles.marker, { left: Y_AXIS_WIDTH + selected * slot + slot / 2 - 3 }]} />
        ) : null}
        {slot > 0
          ? labelled.map((i, n) => (
              <Text
                key={i}
                numberOfLines={1}
                style={[
                  styles.xLabel,
                  n === 0
                    ? { left: Y_AXIS_WIDTH }
                    : n === labelled.length - 1
                      ? { right: 0, textAlign: 'right' }
                      : { left: Y_AXIS_WIDTH + i * slot + slot / 2 - 40, width: 80, textAlign: 'center' },
                ]}
              >
                {axisLabel(bars[i])}
              </Text>
            ))
          : null}
      </View>
    </View>
  );
}

function makeStyles(c: Colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
    },
    yAxis: {
      width: Y_AXIS_WIDTH,
      height: PLOT_HEIGHT,
    },
    tick: {
      position: 'absolute',
      right: spacing.sm,
      fontSize: 11,
      lineHeight: 16,
      color: c.textMuted,
      fontVariant: ['tabular-nums'],
    },
    plot: {
      flex: 1,
      height: PLOT_HEIGHT,
    },
    grid: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
    },
    zero: {
      height: 1,
      backgroundColor: c.textMuted,
    },
    bar: {
      position: 'absolute',
    },
    goal: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: c.text,
    },
    xAxis: {
      height: 28,
      marginTop: 4,
    },
    marker: {
      position: 'absolute',
      top: 0,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.text,
    },
    xLabel: {
      position: 'absolute',
      top: 10,
      fontSize: 11,
      color: c.textMuted,
    },
  });
}
