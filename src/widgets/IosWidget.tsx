import { Button, HStack, Link, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  padding,
  tint,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { WidgetTap } from '@/domain/widget';
import { WIDGET_NAME, type WidgetSnapshot } from '@/features/widget/snapshot';

// The iOS home-screen widget (expo-widgets). The function below is compiled
// into a separate bundle that runs inside the widget extension: it can only
// use SwiftUI components, modifiers and plain JavaScript, with nothing from
// the app (no imports, helpers or module constants), so formatting is inlined.
//
// The widget can't reach the database. A + press adds a tap to the widget's
// own props, which the runtime keeps and redraws with no app running; the app
// logs those taps the next time it runs (src/widgets/index.ios.ts).

export type IosWidgetProps = { snapshot: WidgetSnapshot; taps: WidgetTap[] };

const TallyWidgetLayout = (props: IosWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const surface = dark ? '#1A1E22' : '#FFFFFF';
  const text = dark ? '#ECEEF0' : '#11181C';
  const muted = dark ? '#9BA1A6' : '#687076';
  const positive = dark ? '#4ADE80' : '#15803D';
  const small = environment.widgetFamily === 'systemSmall';
  const rows = props.snapshot.rows.slice(0, small ? 1 : 3);
  const taps = props.taps ?? [];
  const two = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const amount = (measure: string, n: number) => {
    const sign = n < 0 ? '−' : '';
    const abs = Math.abs(Math.trunc(n));
    if (measure !== 'duration') return `${sign}${abs}`;
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    return h > 0 ? `${sign}${h}:${two(m)}:${two(abs % 60)}` : `${sign}${m}:${two(abs % 60)}`;
  };

  if (rows.length === 0) {
    return (
      <Text modifiers={[font({ size: 14 }), foregroundStyle(muted), containerBackground(surface, 'widget')]}>
        {props.snapshot.empty}
      </Text>
    );
  }

  const rootModifiers = [containerBackground(surface, 'widget')];
  // A small widget is one tap target: it opens its task (links need a medium widget).
  if (small) rootModifiers.push(widgetURL(`taskcounter://task/${rows[0].id}`));

  return (
    <VStack alignment="leading" spacing={10} modifiers={rootModifiers}>
      {rows.map((row) => {
        // Presses not yet logged by the app, made in the current period.
        const pending = taps
          .filter((tap) => tap.taskId === row.id && tap.at >= row.periodStartMs)
          .reduce((sum, tap) => sum + tap.amount, 0);
        const total = row.total + pending;
        const done = total >= row.target;
        const line = [
          `${done ? '✓ ' : ''}${amount(row.measure, total)} / ${amount(row.measure, row.target)}${row.unit ? ` ${row.unit}` : ''}`,
          row.period,
        ]
          .filter(Boolean)
          .join(' · ');
        const info = (
          <VStack alignment="leading" spacing={3}>
            <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundStyle(text), lineLimit(1)]}>
              {row.emoji ? `${row.emoji} ${row.name}` : row.name}
            </Text>
            <Text
              modifiers={[
                font({ size: 12 }),
                foregroundStyle(done ? positive : muted),
                lineLimit(1),
                monospacedDigit(),
              ]}
            >
              {line}
            </Text>
            <ProgressView
              value={Math.min(1, Math.max(0, total / row.target))}
              modifiers={[tint(row.color)]}
            />
          </VStack>
        );
        const step = row.step;
        return (
          <HStack key={row.id} spacing={8}>
            {small ? info : <Link destination={`taskcounter://task/${row.id}`}>{info}</Link>}
            <Spacer />
            {step !== null ? (
              <Button
                label={row.stepLabel ?? '+'}
                target={`log:${row.id}`}
                onPress={() => ({
                  ...props,
                  taps: [...taps, { taskId: row.id, at: Date.now(), amount: step }],
                })}
                modifiers={[
                  buttonStyle('borderedProminent'),
                  tint(row.color),
                  accessibilityLabel(row.addLabel),
                  padding({ leading: 4 }),
                ]}
              />
            ) : null}
          </HStack>
        );
      })}
    </VStack>
  );
};

export const TallyWidget = createWidget<IosWidgetProps>(WIDGET_NAME, TallyWidgetLayout);
