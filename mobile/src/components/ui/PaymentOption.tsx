import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';
import { Radio } from './RadioRow';

export type PaymentOptionProps = {
  title: string;
  /** Second line, e.g. a masked account number. */
  meta?: string;
  icon: LucideIcon;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

/** One payment method: a radio, an icon tile, then the method name and its detail. */
export default function PaymentOption({ title, meta, icon: Icon, selected, disabled = false, onSelect }: PaymentOptionProps) {
  const { s, iconColor } = useThemedStyles(createStyles);
  // A disabled method looks like an unselected one; its radio still shows the choice.
  const highlighted = selected && !disabled;
  return (
    <Tap
      style={[s.row, highlighted && s.rowOn, disabled && s.disabled]}
      onPress={onSelect}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={meta ? `${title}, ${meta}` : title}
      // Screen readers read "checked" for a radio. "selected" is set too, for consumers that read it.
      accessibilityState={{ checked: selected, selected, disabled }}
    >
      <Radio on={selected} />
      <View style={[s.tile, highlighted && s.tileOn]}>
        <Icon size={18} color={iconColor} />
      </View>
      <View style={s.text}>
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {!!meta && <Text style={s.meta} numberOfLines={1}>{meta}</Text>}
      </View>
    </Tap>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1,
      backgroundColor: V6Colors.surface, borderColor: V6Colors.line,
    },
    rowOn: { backgroundColor: Colors.primaryTonal, borderColor: Colors.link, borderWidth: 1.5 },
    tile: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.skeleton },
    tileOn: { backgroundColor: V6Colors.surface },
    text: { flex: 1, gap: 2 },
    title: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    meta: { fontFamily: 'Inter', fontSize: 13, fontWeight: '400', lineHeight: 18, color: V6Colors.ink500 },
    disabled: { opacity: 0.5 },
  }),
  iconColor: V6Colors.ink700,
});
