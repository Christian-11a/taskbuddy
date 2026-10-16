import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import { Radio } from '../ui/RadioRow';
import Tap from '../ui/Tap';
import { peso } from '../../lib/format';
import type { PriceOption } from '../../lib/api';
import { TIER_LABELS } from '../../lib/taskEffort';

export type PriceOptionRowProps = {
  option: PriceOption;
  selected: boolean;
  onSelect: () => void;
};

/** One server-estimated price: tier name, amount, its typical range, and a radio mark. */
export default function PriceOptionRow({ option, selected, onSelect }: PriceOptionRowProps) {
  const { s } = useThemedStyles(createStyles);
  const { label, blurb } = TIER_LABELS[option.tier];
  return (
    <Tap
      testID={`price-option-${option.tier}`}
      style={[s.row, selected && s.rowOn]}
      onPress={onSelect}
      scale
      accessibilityRole="radio"
      accessibilityLabel={`${label}, ${peso(option.amount)}`}
      accessibilityHint={blurb}
      accessibilityState={{ checked: selected, selected }}
    >
      <View style={s.text}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.blurb}>{blurb}</Text>
        <Text style={s.range}>Typical {peso(option.min)} – {peso(option.max)}</Text>
      </View>
      <Text style={s.amount}>{peso(option.amount)}</Text>
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
    text: { flex: 1 },
    label: { fontFamily: 'Inter', fontSize: 16, fontWeight: '700', lineHeight: 21, color: V6Colors.ink900 },
    blurb: { fontFamily: 'Inter', fontSize: 13.5, lineHeight: 18, color: V6Colors.ink500, marginTop: 2 },
    range: { fontFamily: 'Inter', fontSize: 12.5, lineHeight: 17, color: V6Colors.ink500, marginTop: 4 },
    amount: { fontFamily: 'Inter', fontSize: 17, fontWeight: '800', color: V6Colors.ink900 },
  }),
});
