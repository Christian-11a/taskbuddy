import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

type Example = {
  key: 'clear' | 'blurry' | 'glare' | 'cutoff';
  good: boolean;
  caption: string;
  /** What a screen reader says for the tile. */
  spoken: string;
};

const EXAMPLES: readonly Example[] = [
  { key: 'clear', good: true, caption: 'Clear, all 4 corners', spoken: 'Good example: clear, all 4 corners visible' },
  { key: 'blurry', good: false, caption: 'Blurry', spoken: 'Bad example: blurry' },
  { key: 'glare', good: false, caption: 'Glare', spoken: 'Bad example: glare across the card' },
  { key: 'cutoff', good: false, caption: 'Cut off', spoken: 'Bad example: a corner cut off' },
];

/**
 * Four small drawings of an ID photo: one clear, three that get refused.
 * Built from plain shapes so no image asset is needed.
 */
export default function IdExamples() {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View style={s.grid}>
      {EXAMPLES.map((example) => (
        <View
          key={example.key}
          style={[s.tile, example.good && s.tileGood]}
          accessible
          accessibilityLabel={example.spoken}
        >
          <View style={s.frame}>
            <View style={[s.card, example.key === 'cutoff' && s.cardCut]}>
              <View style={[s.line, s.lineLong, example.key === 'blurry' && s.blurred]} />
              <View style={[s.line, s.lineMid, example.key === 'blurry' && s.blurred]} />
              <View style={[s.line, s.lineShort, example.key === 'blurry' && s.blurred]} />
              {example.key === 'glare' && <View style={s.glare} />}
            </View>
          </View>
          <View style={s.caption}>
            {example.good ? (
              <Check size={14} color={c.good} strokeWidth={3} />
            ) : (
              <X size={14} color={c.bad} strokeWidth={3} />
            )}
            <Text style={s.captionText}>{example.caption}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    tile: {
      flexBasis: '48%', flexGrow: 1, gap: 8, padding: 8, borderRadius: 14, borderWidth: 1,
      borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    tileGood: { borderColor: Colors.successBorder },
    frame: {
      height: 64, borderRadius: 8, backgroundColor: V6Colors.ink50, overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    },
    card: {
      width: '80%', height: 46, borderRadius: 5, borderWidth: 1, borderColor: V6Colors.ink200,
      backgroundColor: V6Colors.surface, padding: 6, gap: 5, overflow: 'hidden',
    },
    // Pushed up and left so one corner falls outside the frame.
    cardCut: { marginLeft: -16, marginTop: -10 },
    line: { height: 4, borderRadius: 2, backgroundColor: V6Colors.ink300 },
    lineLong: { width: '70%' },
    lineMid: { width: '55%' },
    lineShort: { width: '40%' },
    blurred: { opacity: 0.35 },
    // A pale band across the card reads as light bouncing off it.
    glare: {
      position: 'absolute', top: -6, left: '30%', width: '60%', height: '160%',
      backgroundColor: V6Colors.surface, opacity: 0.85, transform: [{ rotate: '18deg' }],
    },
    caption: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    captionText: { flex: 1, fontFamily: 'Inter', fontSize: 13, fontWeight: '600', lineHeight: 17, color: V6Colors.ink900 },
  }),
  c: { good: Colors.successText, bad: Colors.dangerText },
});
