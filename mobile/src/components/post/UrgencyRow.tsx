import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, type LucideIcon } from 'lucide-react-native';
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
  /** When matching starts and the rate tier, under the blurb. */
  timing?: string;
  /** A short tag beside the label, e.g. "Premium". */
  badge?: string;
  /** What this choice adds; listed only while it is selected. */
  perks?: readonly string[];
};

/** One urgency option: an icon, the name, what it means, and a radio mark. The whole row is the target. */
export default function UrgencyRow({ label, blurb, icon: Icon, selected, onSelect, timing, badge, perks }: UrgencyRowProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <Tap
      style={[s.row, selected && s.rowOn]}
      onPress={onSelect}
      scale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={timing ? `${blurb}. ${timing}` : blurb}
      accessibilityState={{ checked: selected, selected }}
    >
      <View style={[s.well, selected && s.wellOn]}>
        <Icon size={20} color={c.icon} />
      </View>
      <View style={s.text}>
        <View style={s.labelRow}>
          <Text style={s.label}>{label}</Text>
          {!!badge && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={s.blurb}>{blurb}</Text>
        {!!timing && <Text style={s.timing}>{timing}</Text>}
        {selected && !!perks?.length && (
          <View style={s.perks}>
            {perks.map((perk) => (
              <View key={perk} style={s.perkRow}>
                <Check size={14} color={c.icon} strokeWidth={2.6} />
                <Text style={s.perkText}>{perk}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Radio on={selected} />
    </Tap>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16,
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
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: V6Colors.dangerSurface },
    badgeText: { fontFamily: 'Inter', fontSize: 11.5, fontWeight: '800', lineHeight: 15, color: V6Colors.dangerText },
    timing: { fontFamily: 'Inter', fontSize: 12.5, lineHeight: 17, color: V6Colors.ink700, marginTop: 4 },
    perks: { marginTop: 8, gap: 4 },
    perkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    perkText: { flex: 1, fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: V6Colors.ink700 },
  }),
  c: { icon: Colors.primary },
});
