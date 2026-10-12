import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type PostProgressProps = {
  /** The step on screen, counted from 1. */
  step: number;
  total: number;
  /** The step's short name, e.g. "Where". Shown in capitals under the bar. */
  label: string;
};

/** Five segments filled up to the current step, with the step's name under them. */
export default function PostProgress({ step, total, label }: PostProgressProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View
      style={s.wrap}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}: ${label}`}
    >
      <View style={s.bars}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[s.bar, { backgroundColor: i < step ? c.done : c.todo }]} />
        ))}
      </View>
      <Text style={s.caption}>{`STEP ${step} OF ${total} · ${label.toUpperCase()}`}</Text>
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    wrap: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
    bars: { flexDirection: 'row', gap: 6 },
    bar: { flex: 1, height: 5, borderRadius: 3 },
    caption: { fontFamily: 'Inter', fontSize: 12, fontWeight: '700', lineHeight: 16, letterSpacing: 0.6, color: Colors.link },
  }),
  c: { done: Colors.primary, todo: V6Colors.ink100 },
});
