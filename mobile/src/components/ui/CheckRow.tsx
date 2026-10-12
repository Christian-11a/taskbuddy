import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';

export type CheckRowProps = {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

/** A full-width yes/no option with a check box. The label wraps; the whole row is the target. */
export default function CheckRow({ label, checked, onToggle, disabled = false }: CheckRowProps) {
  const { s, onPrimary } = useThemedStyles(createStyles);
  return (
    <Tap
      style={[s.row, checked ? s.rowOn : s.rowOff, disabled && s.disabled]}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
    >
      <View style={[s.box, checked ? s.boxOn : s.boxOff]}>
        {checked && <Check size={14} color={onPrimary} />}
      </View>
      <Text style={s.label}>{label}</Text>
    </Tap>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13,
      borderRadius: 14, borderWidth: 1,
    },
    rowOff: { backgroundColor: V6Colors.surface, borderColor: V6Colors.line },
    rowOn: { backgroundColor: Colors.primaryTonal, borderColor: Colors.link, borderWidth: 1.5 },
    box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    boxOff: { backgroundColor: V6Colors.surface, borderColor: V6Colors.line },
    boxOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    label: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: V6Colors.ink900 },
    disabled: { opacity: 0.5 },
  }),
  onPrimary: Colors.onPrimary,
});
