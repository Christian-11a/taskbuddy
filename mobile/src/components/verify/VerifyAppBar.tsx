import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from '../ui/Tap';

export type VerifyAppBarProps = {
  title: string;
  /** The back arrow either leaves the screen or goes back one step. */
  onBack: () => void;
  /** Read by screen readers, e.g. "Back to the previous step". */
  backLabel: string;
  /** Space above the bar, for the status bar. */
  topInset?: number;
};

/** The verification screen's top bar: a round back button, then the title. Same shape as the Post a job bar. */
export default function VerifyAppBar({ title, onBack, backLabel, topInset = 0 }: VerifyAppBarProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View style={[s.bar, { paddingTop: topInset }]}>
      <Tap
        style={s.back}
        onPress={onBack}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
      >
        <ArrowLeft size={20} color={c.icon} />
      </Tap>
      <Text style={s.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
    </View>
  );
}

const createStyles = ({ V6Colors }: Palette) => ({
  s: StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
    back: {
      width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
      backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line,
    },
    title: { flex: 1, fontFamily: 'Inter', fontSize: 18, fontWeight: '700', lineHeight: 24, color: V6Colors.ink900 },
  }),
  c: { icon: V6Colors.ink800 },
});
