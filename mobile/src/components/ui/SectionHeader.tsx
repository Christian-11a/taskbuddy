import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';

export default function SectionHeader({ title, count, linkLabel, onLinkPress }: {
  title: string; count?: number; linkLabel?: string; onLinkPress?: () => void;
}) {
  const s = useThemedStyles(createStyles);
  return (
    <View style={s.row}>
      <View style={s.left}>
        <Text style={s.title} accessibilityRole="header">{title}</Text>
        {count != null && <View style={s.badge}><Text style={s.badgeText}>{count}</Text></View>}
      </View>
      {!!linkLabel && (
        // The 14 dp link is about 17 dp tall; 16 dp above and below brings the touch area to 48.
        <Tap onPress={onLinkPress} hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }} accessibilityRole="link">
          <Text style={s.link}>{linkLabel}</Text>
        </Tap>
      )}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: 'Inter', fontSize: 17, fontWeight: '600', color: V6Colors.ink900 },
  badge: { minWidth: 24, height: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryTonal },
  badgeText: { fontFamily: 'Inter', fontSize: 12, fontWeight: '700', color: Colors.primaryDeep },
  link: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', color: Colors.link },
});
