import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, CircleCheck } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type PrepStep = { title: string; detail: string };
export type PrepProfileItem = { label: string; done: boolean };

export type PrepCardProps = {
  steps: readonly PrepStep[];
  /** Profile items that are saved already are ticked; the rest stay open. */
  profileItems: readonly PrepProfileItem[];
};

/** The verification in four numbered steps, then the profile items that are already done. */
export default function PrepCard({ steps, profileItems }: PrepCardProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <View style={s.card}>
      {steps.map((step, index) => (
        <View
          key={step.title}
          style={s.step}
          accessible
          accessibilityLabel={`Step ${index + 1}, ${step.title}. ${step.detail}`}
        >
          <View style={s.num}>
            <Text style={s.numText}>{index + 1}</Text>
          </View>
          <View style={s.stepText}>
            <Text style={s.stepTitle}>{step.title}</Text>
            <Text style={s.stepDetail}>{step.detail}</Text>
          </View>
        </View>
      ))}
      <View style={s.divider} />
      <Text style={s.profileHead}>Already on your profile</Text>
      {profileItems.map((item) => {
        const Icon = item.done ? CircleCheck : Circle;
        return (
          <View
            key={item.label}
            style={s.profileRow}
            accessible
            accessibilityLabel={`${item.label}: ${item.done ? 'done' : 'not done yet'}`}
          >
            <Icon size={18} color={item.done ? c.done : c.todo} />
            <Text style={[s.profileText, !item.done && s.profileTextOpen]}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: {
      gap: 12, padding: 16, borderRadius: 18, borderWidth: 1,
      borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    num: {
      width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.primaryTonal,
    },
    numText: { fontFamily: 'Inter', fontSize: 13, fontWeight: '700', color: Colors.primaryDeep },
    stepText: { flex: 1, gap: 2 },
    stepTitle: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    stepDetail: { fontFamily: 'Inter', fontSize: 13, fontWeight: '400', lineHeight: 18, color: V6Colors.ink500 },
    divider: { height: 1, backgroundColor: V6Colors.line },
    profileHead: { fontFamily: 'Inter', fontSize: 12, fontWeight: '700', lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase', color: V6Colors.ink500 },
    profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    profileText: { flex: 1, fontFamily: 'Inter', fontSize: 14, fontWeight: '500', lineHeight: 18, color: V6Colors.ink900 },
    profileTextOpen: { color: V6Colors.ink700 },
  }),
  c: { done: Colors.successText, todo: V6Colors.ink500 },
});
