import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type LucideIcon } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import { Radio } from '../ui/RadioRow';
import Tap from '../ui/Tap';

export type UrgencyRowProps = {
  label: string;
  /** What this choice means, in plain words. */
  blurb: string;
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
};

/** One urgency option: an icon, the name, what it means, and a radio mark. The whole row is the target. */
export default function UrgencyRow({ label, blurb, icon: Icon, selected, onSelect }: UrgencyRowProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <Tap
      style={[s.row, selected && s.rowOn]}
      onPress={onSelect}
      scale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={blurb}
      accessibilityState={{ checked: selected, selected }}
    >
      <View style={[s.well, selected && s.wellOn]}>
        <Icon size={20} color={c.icon} />
      </View>
      <View style={s.text}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.blurb}>{blurb}</Text>
      </View>
      <Radio on={selected} />
    </Tap>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
      borderWidth: 1.5, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    rowOn: { borderColor: Colors.primary, backgroundColor: Colors.primaryTonal },
    well: {
      width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.primaryTonal,
    },
    wellOn: { backgroundColor: V6Colors.surface },
    text: { flex: 1 },
    label: { fontFamily: 'Inter', fontSize: 16, fontWeight: '700', lineHeight: 21, color: V6Colors.ink900 },
    blurb: { fontFamily: 'Inter', fontSize: 13.5, lineHeight: 18, color: V6Colors.ink500, marginTop: 2 },
  }),
  c: { icon: Colors.primary },
});
