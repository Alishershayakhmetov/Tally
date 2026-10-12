import { StyleSheet, Text, View } from 'react-native';

import { textOn } from '@/lib/contrast';

type Props = { emoji: string | null; name: string; color: string; size?: number };

export function TaskBadge({ emoji, name, color, size = 44 }: Props) {
  const label = emoji ?? name.trim().charAt(0).toUpperCase();
  return (
    <View
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}
    >
      <Text style={[styles.label, { fontSize: size * (emoji ? 0.5 : 0.42), color: textOn(color) }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '700',
  },
});
