import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';
import DateBlock from './DateBlock';

export type JobRowTone = 'booked' | 'needsYou' | 'waiting' | 'done' | 'open' | 'applied';
export type JobRowProps = {
  title: string; meta: string; amount: string; date?: Date | string | null;
  tone: JobRowTone; onPress?: () => void; testID?: string;
};

/** One job as its own card. Title up to 2 lines; status + amount share line 2. */
export default function JobRow({ title, meta, amount, date, tone, onPress, testID }: JobRowProps) {
  const { s, tones } = useThemedStyles(createStyles);
  const t = tones[tone];
  return (
    <Tap style={s.card} onPress={onPress} disabled={!onPress} testID={testID}
      accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${title}. ${meta}. ${amount}`}>
      <DateBlock date={date} />
      <View style={s.text}>
        <Text style={s.title} numberOfLines={2}>{title}</Text>
        <View style={s.metaRow} testID="job-row-meta">
          <View style={[s.dot, { backgroundColor: t.dot }]} accessible={false} />
          <Text style={[s.meta, { color: t.text }, tone === 'applied' && s.metaStrong]} numberOfLines={1}>{meta}</Text>
          <Text style={s.amount} numberOfLines={1}>{amount}</Text>
        </View>
      </View>
    </Tap>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12,
      borderRadius: 16, backgroundColor: V6Colors.surface, elevation: 2,
    },
    text: { flex: 1, gap: 3 },
    title: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    meta: { flex: 1, fontFamily: 'Inter', fontSize: 13, lineHeight: 18 },
    metaStrong: { fontWeight: '600' },
    amount: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', color: V6Colors.ink900 },
  }),
  tones: {
    booked: { dot: Colors.successText, text: V6Colors.ink500 },
    needsYou: { dot: '#d97706', text: Colors.warningText },
    waiting: { dot: Colors.link, text: V6Colors.ink500 },
    open: { dot: Colors.link, text: V6Colors.ink500 },
    applied: { dot: Colors.link, text: Colors.link },
    done: { dot: V6Colors.ink500, text: V6Colors.ink500 },
  } as Record<JobRowTone, { dot: string; text: string }>,
});
