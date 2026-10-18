import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, X } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from '../ui/Tap';

export type PostAppBarProps = {
  title: string;
  /** The round button: one step back, or leaving the job form on the first step (the screen decides whether to confirm). */
  onBack: () => void;
  /** What the button is announced as. Defaults to "Exit job form", for the button that leaves. */
  backLabel?: string;
  /** The icon on the button. "arrow" (default) for back; "close" (an X) for leaving the flow. */
  leading?: 'arrow' | 'close';
  /** Space above the bar, for the status bar. */
  topInset?: number;
};

/** The top bar of the job form: a round back button, then the screen name. */
export default function PostAppBar({
  title, onBack, backLabel = 'Exit job form', leading = 'arrow', topInset = 0,
}: PostAppBarProps) {
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
        {leading === 'close' ? <X size={20} color={c.icon} /> : <ArrowLeft size={20} color={c.icon} />}
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
