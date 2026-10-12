import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';

export default function ViewSwitch<T extends string>({ options, value, onChange }: {
  options: readonly { key: T; label: string }[]; value: T; onChange: (key: T) => void;
}) {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.track} accessibilityRole="tablist">
      {options.map(o => {
        const on = o.key === value;
        // Keyed on whether the segment is picked, so a segment that changes is recreated
        // rather than repainted in place: Android does not reliably redraw the fill, or the
        // label colour, of a view that re-renders (see FilterPill). The unpicked segment is
        // explicitly transparent, so only the picked one ever carries the surface.
        return (
          <Tap key={`${o.key}:${on ? 'on' : 'off'}`} style={[s.seg, on ? s.segOn : s.segOff]} onPress={() => onChange(o.key)} hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label}>
            <Text style={[s.label, on && s.labelOn]}>{o.label}</Text>
          </Tap>
        );
      })}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => StyleSheet.create({
  track: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: Colors.skeleton },
  seg: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  segOn: { backgroundColor: V6Colors.surface, elevation: 1 },
  segOff: { backgroundColor: 'transparent' },
  label: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', color: V6Colors.ink500 },
  labelOn: { color: Colors.link },
});
