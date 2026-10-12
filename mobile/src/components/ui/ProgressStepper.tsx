import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type ProgressStep = 'posted' | 'hired' | 'working' | 'done' | 'cancelled';
export type ProgressStepperProps = { step: ProgressStep };

const LABELS = ['Posted', 'Hired', 'Working', 'Done'];
/** Slot of each live step. A cancelled job reads as "Cancelled" in the third slot. */
const SLOT: Record<Exclude<ProgressStep, 'cancelled'>, number> = { posted: 0, hired: 1, working: 2, done: 3 };

/** Four equal bars showing how far a job got. A cancelled job keeps the two steps it reached and marks slot three. */
export default function ProgressStepper({ step }: ProgressStepperProps) {
  const { s, c } = useThemedStyles(createStyles);
  const cancelled = step === 'cancelled';
  const current = step === 'cancelled' ? 2 : SLOT[step];
  const names = cancelled ? [LABELS[0], LABELS[1], 'Cancelled', LABELS[3]] : LABELS;
  const label = cancelled
    ? 'Job progress: Cancelled after Hired'
    : `Job progress: ${LABELS[current]}, step ${current + 1} of 4`;
  return (
    <View style={s.row} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      {names.map((name, i) => {
        const barColor = cancelled
          ? (i < 2 ? c.cancelledBar : c.todoBar)
          : (i <= current ? c.doneBar : c.todoBar);
        const past = cancelled ? i < 2 : i < current;
        const now = !cancelled && i === current;
        const marked = cancelled && i === 2;
        const labelColor = marked ? c.labelCancelled : now ? c.labelNow : past ? c.labelPast : c.labelLater;
        const labelWeight = now || marked ? '600' : '500';
        return (
          <View key={name} style={s.column}>
            <View style={[s.bar, { backgroundColor: barColor }]} />
            <Text style={[s.label, { color: labelColor, fontWeight: labelWeight }]} numberOfLines={1}>{name}</Text>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: { flexDirection: 'row', gap: 6 },
    column: { flex: 1, gap: 6 },
    bar: { height: 6, borderRadius: 3 },
    label: { fontFamily: 'Inter', fontSize: 11, lineHeight: 14 },
  }),
  c: {
    doneBar: Colors.primary, todoBar: V6Colors.line, cancelledBar: V6Colors.ink500,
    labelPast: V6Colors.ink700, labelNow: Colors.link, labelLater: V6Colors.ink500, labelCancelled: Colors.dangerText,
  },
});
