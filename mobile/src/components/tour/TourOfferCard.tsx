/**
 * TourOfferCard.tsx: the one-time "take a quick tour" card at the top of Home,
 * for accounts that finished onboarding before the welcome tour existed. The
 * App decides whether it is offered at all; this card shows the offer and
 * reports the tap or the dismissal.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../context/ThemeContext';
import Tap from '../ui/Tap';
import { V6Radii } from '../../constants/theme';

type TourOfferCardProps = {
  onStart: () => void;
  onDismiss: () => void;
};

export default function TourOfferCard({ onStart, onDismiss }: TourOfferCardProps) {
  const { Colors, C, styles } = useThemedStyles(createThemedStyles);
  return (
    <View testID="tour-offer" style={styles.card}>
      <View style={styles.head}>
        <View style={styles.copy}>
          <Text style={styles.title} accessibilityRole="header">New: take a quick tour</Text>
          <Text style={styles.body}>See where things are in about a minute.</Text>
        </View>
        <Tap
          testID="tour-offer-dismiss"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss the tour offer"
          style={styles.close}
          onPress={onDismiss}
        >
          <X size={18} color={C.ink700} strokeWidth={2.2} />
        </Tap>
      </View>
      <Tap
        testID="tour-offer-start"
        scale
        accessibilityRole="button"
        accessibilityLabel="Take the tour"
        style={[styles.start, { backgroundColor: Colors.primary }]}
        onPress={onStart}
      >
        <Text style={[styles.startText, { color: Colors.onPrimary }]}>Take the tour</Text>
      </Tap>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    card: {
      backgroundColor: Colors.primaryTonal,
      borderRadius: V6Radii.card,
      padding: 16,
      gap: 12,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    copy: { flex: 1, gap: 4 },
    title: { color: Colors.primaryDeep, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', lineHeight: 22 },
    body: { color: C.ink700, fontSize: 14, fontFamily: 'Inter', lineHeight: 20 },
    close: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
    },
    start: {
      minHeight: 48, borderRadius: 14, paddingHorizontal: 20,
      alignItems: 'center', justifyContent: 'center',
    },
    startText: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, C, styles };
}
