import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, type LucideIcon } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from '../ui/Tap';

export type ServiceTileProps = {
  name: string;
  /** A short line under the name, shown only when the category has one. */
  detail?: string;
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
};

/**
 * One service in the Service step's grid. A picked tile is tinted and carries a
 * check badge, so the choice reads without relying on the border alone.
 */
export default function ServiceTile({ name, detail, icon: Icon, selected, onSelect }: ServiceTileProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <Tap
      style={[s.tile, selected && s.tileOn]}
      onPress={onSelect}
      scale
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityHint={detail}
      accessibilityState={{ checked: selected, selected }}
    >
      <View style={[s.well, selected && s.wellOn]}>
        <Icon size={22} color={c.icon} />
      </View>
      <Text style={s.name}>{name}</Text>
      {!!detail && <Text style={s.detail}>{detail}</Text>}
      {selected && (
        <View style={s.check}>
          <Check size={14} color={c.onPrimary} strokeWidth={3} />
        </View>
      )}
    </Tap>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    tile: {
      width: '48%', minHeight: 124, padding: 14, borderRadius: 16, borderWidth: 1.5, gap: 4,
      backgroundColor: V6Colors.surface, borderColor: V6Colors.line,
    },
    tileOn: { backgroundColor: Colors.primaryTonal, borderColor: Colors.primary },
    well: {
      width: 44, height: 44, borderRadius: 12, marginBottom: 8,
      alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryTonal,
    },
    wellOn: { backgroundColor: V6Colors.surface },
    name: { fontFamily: 'Inter', fontSize: 16, fontWeight: '700', lineHeight: 21, color: V6Colors.ink900 },
    detail: { fontFamily: 'Inter', fontSize: 13.5, lineHeight: 18, color: V6Colors.ink500 },
    check: {
      position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary,
    },
  }),
  c: { icon: Colors.primary, onPrimary: Colors.onPrimary },
});
