import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';

/** The round radio mark. Shared by RadioRow and PaymentOption. */
export function Radio({ on }: { on: boolean }) {
  const r = useThemedStyles(createRadioStyles);
  return <View style={[r.radio, on ? r.radioOn : r.radioOff]} />;
}

export type RadioRowProps = {
  label: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
};

/** A full-width single-choice option. The label wraps; the whole row is the target. */
export default function RadioRow({ label, selected, onSelect, disabled = false }: RadioRowProps) {
  const s = useThemedStyles(createStyles);
  return (
    <Tap
      style={[s.row, selected ? s.rowOn : s.rowOff, disabled && s.disabled]}
      onPress={onSelect}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      // `checked` is the state screen readers announce for radios; `selected` is what the spec and callers use.
      accessibilityState={{ checked: selected, selected, disabled }}
    >
      <Radio on={selected} />
      <Text style={s.label}>{label}</Text>
    </Tap>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14, borderWidth: 1,
  },
  rowOff: { backgroundColor: V6Colors.surface, borderColor: V6Colors.line },
  rowOn: { backgroundColor: Colors.primaryTonal, borderColor: Colors.link, borderWidth: 1.5 },
  label: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: V6Colors.ink900 },
  disabled: { opacity: 0.5 },
});

const createRadioStyles = ({ Colors, V6Colors }: Palette) => StyleSheet.create({
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5 },
  radioOff: { backgroundColor: V6Colors.surface, borderColor: V6Colors.line },
  // A 6 dp ring around a white centre reads as a filled radio at 20 dp.
  radioOn: { backgroundColor: V6Colors.surface, borderColor: Colors.link, borderWidth: 6 },
});
