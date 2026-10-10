import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import SheetFrame from '../ui/SheetFrame';
import Tap from '../ui/Tap';

/**
 * What happens to the ID photos, stated plainly. Only facts the flow really
 * has: the private bucket, the Stripe check that asks for a fresh scan, the
 * admin fallback. No retention periods are claimed.
 */
const POINTS = [
  'The photos you upload go to a private storage bucket that only TaskBuddy admins can open.',
  "The automated check runs with Stripe Identity, our secure identity partner. It asks you to scan your ID and face once more.",
  'We use these photos only to verify you.',
  "If the automated check can't decide, a TaskBuddy admin reviews your uploaded photos by hand.",
];

export type ProtectSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** A small sheet with the plain facts about the ID photos. Back, drag or "Got it" closes it. */
export default function ProtectSheet({ visible, onClose }: ProtectSheetProps) {
  const { s } = useThemedStyles(createStyles);
  return (
    <SheetFrame visible={visible} onClose={onClose} variant="sheet" contentStyle={s.content}>
      <Text style={s.title} accessibilityRole="header">How we protect your ID</Text>
      {POINTS.map((point) => (
        <Text key={point} style={s.point}>{point}</Text>
      ))}
      <Tap
        style={s.button}
        onPress={onClose}
        scale
        accessibilityRole="button"
        accessibilityLabel="Got it"
      >
        <Text style={s.buttonText}>Got it</Text>
      </Tap>
    </SheetFrame>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    content: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
    title: { fontFamily: 'Inter', fontSize: 20, fontWeight: '700', lineHeight: 26, color: V6Colors.ink900 },
    point: { fontFamily: 'Inter', fontSize: 15, fontWeight: '400', lineHeight: 22, color: V6Colors.ink700 },
    button: {
      height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.primary, marginTop: 4,
    },
    buttonText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: Colors.onPrimary },
  }),
});
