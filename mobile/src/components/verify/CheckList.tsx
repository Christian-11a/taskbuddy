import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type CheckListProps = {
  items: readonly string[];
  /** Reminders the app cannot check for the provider are drawn quieter than tips. */
  muted?: boolean;
};

/** A short list with a tick in front of each line. Presentational only: nothing here is a control. */
export default function CheckList({ items, muted = false }: CheckListProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View style={s.list}>
      {items.map((item) => (
        <View key={item} style={s.row}>
          <View style={[s.tick, muted ? s.tickMuted : s.tickOn]}>
            <Check size={12} color={muted ? c.mutedIcon : c.onIcon} strokeWidth={3} />
          </View>
          <Text style={[s.text, muted && s.textMuted]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    list: { gap: 10 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    tick: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    tickOn: { backgroundColor: Colors.primaryTonal },
    tickMuted: { backgroundColor: V6Colors.ink100 },
    text: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: V6Colors.ink900 },
    textMuted: { fontWeight: '400', color: V6Colors.ink700 },
  }),
  c: { onIcon: Colors.primaryDeep, mutedIcon: V6Colors.ink500 },
});
