import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type PostingStepState = 'waiting' | 'active' | 'done';
export type PostingStep = { key: string; label: string; state: PostingStepState };

const STATE_WORD: Record<PostingStepState, string> = {
  waiting: 'waiting',
  active: 'in progress',
  done: 'done',
};

/**
 * The steps of the submit that really happen, each ticked, spinning or waiting.
 * The screen decides which steps exist and in what state, from the real submit
 * phase; this component only shows them.
 */
export default function PostingChecklist({ steps }: { steps: PostingStep[] }) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View style={s.card}>
      {steps.map((step) => (
        <View
          key={step.key}
          style={s.row}
          accessible
          accessibilityLabel={`${step.label}: ${STATE_WORD[step.state]}`}
          accessibilityState={{ busy: step.state === 'active' }}
        >
          <View style={[s.mark, step.state === 'done' ? s.markDone : s.markOpen]}>
            {step.state === 'done' && <Check size={14} color={c.done} strokeWidth={3} />}
            {step.state === 'active' && <ActivityIndicator size="small" color={c.active} />}
            {step.state === 'waiting' && <View style={s.dot} />}
          </View>
          <Text style={[s.label, step.state === 'active' && s.labelActive]}>{step.label}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: {
      backgroundColor: V6Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: V6Colors.line,
      paddingHorizontal: 16, paddingVertical: 4,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    mark: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    markDone: { backgroundColor: V6Colors.successSurface },
    markOpen: { backgroundColor: Colors.primaryTonal },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: V6Colors.ink300 },
    label: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: V6Colors.ink700 },
    labelActive: { fontWeight: '700', color: V6Colors.ink900 },
  }),
  c: { done: Colors.successText, active: Colors.primary },
});
