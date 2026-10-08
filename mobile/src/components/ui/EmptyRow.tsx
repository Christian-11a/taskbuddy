import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type LucideIcon } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';

export type EmptyRowProps = {
  icon: LucideIcon; title: string; body?: string; actionLabel?: string; onAction?: () => void;
};

/** Stands in for a list or section that has nothing yet: an icon tile, a title, a line of explanation, and an optional next step. */
export default function EmptyRow({ icon: Icon, title, body, actionLabel, onAction }: EmptyRowProps) {
  const { s, iconColor } = useThemedStyles(createStyles);
  return (
    <View style={s.row}>
      <View style={s.tile}>
        <Icon size={20} color={iconColor} />
      </View>
      <View style={s.text}>
        <Text style={s.title}>{title}</Text>
        {!!body && <Text style={s.body}>{body}</Text>}
        {!!actionLabel && !!onAction && (
          <Tap onPress={onAction} hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }}
            accessibilityRole="button" accessibilityLabel={actionLabel} style={s.action}>
            <Text style={s.actionLabel}>{actionLabel}</Text>
          </Tap>
        )}
      </View>
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
    tile: {
      width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.primaryTonal,
    },
    text: { flex: 1, gap: 4 },
    title: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    body: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: V6Colors.ink500 },
    action: { alignSelf: 'flex-start' },
    actionLabel: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: Colors.link },
  }),
  iconColor: Colors.link,
});
