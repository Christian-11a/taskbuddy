import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';

export default function FilterPill({ label, count, selected, onPress }: {
  label: string; count?: number; selected: boolean; onPress: () => void;
}) {
  const s = useThemedStyles(createStyles);
  return (
    <Tap style={[s.pill, selected ? s.on : s.off]} onPress={onPress} hitSlop={{ top: 7, bottom: 7 }}
      accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}>
      <Text style={[s.label, selected && s.labelOn]}>{label}</Text>
      {count != null && <Text style={[s.count, selected && s.labelOn]}>{count}</Text>}
    </Tap>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  on: { backgroundColor: Colors.primary },
  off: { backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line },
  label: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', color: V6Colors.ink700 },
  count: { fontFamily: 'Inter', fontSize: 12, fontWeight: '700', color: V6Colors.ink500 },
  labelOn: { color: Colors.onPrimary },
});
