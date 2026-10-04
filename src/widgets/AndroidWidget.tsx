// The library calls these components as plain functions to build the widget,
// so React Compiler's memo hooks would throw "Invalid Hook Call" here.
'use no memo';

import { FlexWidget, TextWidget, type HexColor } from 'react-native-android-widget';

import { formatAmount } from '@/domain/measure';
import type { WidgetRow, WidgetSnapshot } from '@/features/widget/snapshot';
import { inkOn, visibleOn } from '@/lib/contrast';
import { darkColors, lightColors } from '@/theme';

// The Android home-screen widget, drawn with react-native-android-widget's
// primitives (not React Native views). Tapping a row opens its task; + logs
// the task's smallest button without opening the app (androidTaskHandler.tsx).

/** The click action the task handler logs a press for. */
export const LOG_ACTION = 'LOG';

const hex = (color: string) => color as HexColor;

type Props = { snapshot: WidgetSnapshot; scheme: 'light' | 'dark' };

export function TallyWidget({ snapshot, scheme }: Props) {
  const colors = scheme === 'dark' ? darkColors : lightColors;
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: hex(colors.surface),
        borderRadius: 16,
        padding: 8,
      }}
      accessibilityLabel="Tally"
    >
      {snapshot.rows.length === 0 ? (
        <FlexWidget
          style={{
            height: 'match_parent',
            width: 'match_parent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          clickAction="OPEN_APP"
        >
          <TextWidget
            text={snapshot.empty}
            style={{ fontSize: 14, color: hex(colors.textMuted), textAlign: 'center' }}
          />
        </FlexWidget>
      ) : (
        snapshot.rows.map((row) => <Row key={row.id} row={row} scheme={scheme} />)
      )}
    </FlexWidget>
  );
}

function Row({ row, scheme }: { row: WidgetRow; scheme: 'light' | 'dark' }) {
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const done = row.total >= row.target;
  const fraction = Math.min(1, Math.max(0, row.total / row.target));
  const progress = [
    `${done ? '✓ ' : ''}${formatAmount(row.measure, row.total)} / ${formatAmount(row.measure, row.target)}${row.unit ? ` ${row.unit}` : ''}`,
    row.period,
  ]
    .filter(Boolean)
    .join(' · ');
  const bar = visibleOn(row.color, colors.surface);

  return (
    <FlexWidget
      style={{
        flex: 1,
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
      }}
    >
      <FlexWidget
        style={{ flex: 1, flexDirection: 'column', justifyContent: 'center' }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: `taskcounter://task/${row.id}` }}
        accessibilityLabel={`${row.name}, ${progress}`}
      >
        <TextWidget
          text={row.emoji ? `${row.emoji} ${row.name}` : row.name}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 14, fontWeight: 'bold', color: hex(colors.text) }}
        />
        <TextWidget
          text={progress}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 12, color: hex(done ? colors.positive : colors.textMuted), marginTop: 2 }}
        />
        <FlexWidget
          style={{
            width: 'match_parent',
            height: 4,
            marginTop: 4,
            flexDirection: 'row',
            borderRadius: 2,
            backgroundColor: hex(colors.track),
          }}
        >
          {/* Weights split the bar; a zero weight would still draw, so empty parts are left out. */}
          {fraction > 0 ? (
            <FlexWidget
              style={{
                flex: Math.round(fraction * 1000),
                height: 4,
                borderRadius: 2,
                backgroundColor: hex(bar),
              }}
            />
          ) : null}
          {fraction < 1 ? (
            <FlexWidget style={{ flex: Math.round((1 - fraction) * 1000), height: 4 }} />
          ) : null}
        </FlexWidget>
      </FlexWidget>
      {row.step !== null && row.stepLabel ? (
        <FlexWidget
          style={{
            marginLeft: 8,
            width: 56,
            height: 40,
            borderRadius: 20,
            backgroundColor: hex(row.color),
            alignItems: 'center',
            justifyContent: 'center',
          }}
          clickAction={LOG_ACTION}
          clickActionData={{ taskId: row.id }}
          accessibilityLabel={row.addLabel}
        >
          <TextWidget
            text={row.stepLabel}
            maxLines={1}
            style={{ fontSize: 14, fontWeight: 'bold', color: hex(inkOn(row.color, '#FFFFFF', '#111111')) }}
          />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}
