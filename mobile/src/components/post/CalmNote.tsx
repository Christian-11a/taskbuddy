import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapPin, type LucideIcon } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type CalmNoteProps = {
  text: string;
  icon?: LucideIcon;
};

/** One quiet line of guidance inside a step. Neutral colours: it explains, it does not alarm. */
export default function CalmNote({ text, icon: Icon = MapPin }: CalmNoteProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View style={s.box}>
      <Icon size={18} color={c.icon} />
      <Text style={s.text}>{text}</Text>
    </View>
  );
}

const createStyles = ({ V6Colors }: Palette) => ({
  s: StyleSheet.create({
    box: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14,
      backgroundColor: V6Colors.ink50,
    },
    text: { flex: 1, fontFamily: 'Inter', fontSize: 14, lineHeight: 19, color: V6Colors.ink700 },
  }),
  c: { icon: V6Colors.ink500 },
});
