import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import Tap from './ui/Tap';
import { peso, urgencyMeta } from '../lib/format';

export interface JobCardPill {
  label: string;
  color: string;
  bg: string;
  /** Leading dot, used for status pills. */
  dot?: boolean;
}

export interface JobCardFootItem {
  icon: ReactNode;
  text: string;
}

interface JobCardProps {
  title: string;
  budget?: number | null;
  address?: string | null;
  /** Status pill, e.g. from jobStatusMeta(). Omit on feeds of open jobs. */
  status?: JobCardPill | null;
  /** Raw urgency value; always rendered so urgent jobs stand out. */
  urgency?: string | null;
  /** Extra pills after status and urgency (category, "Hired", …). */
  pills?: JobCardPill[];
  /** Up to two items for the footer row (provider, time ago, distance, …). */
  footer?: JobCardFootItem[];
  onPress?: () => void;
  testID?: string;
}

/**
 * The job card shared by both roles. Built from the homeowner My Jobs card so
 * every list — Home, My Jobs, Calendar, the provider feed and My Work — shows
 * the same fields in the same places.
 */
export default function JobCard({
  title, budget, address, status, urgency, pills = [], footer = [], onPress, testID,
}: JobCardProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const allPills: JobCardPill[] = [
    ...(status ? [{ ...status, dot: true }] : []),
    ...(urgency ? [urgencyMeta(urgency, V6Colors)] : []),
    ...pills,
  ];

  return (
    <Tap
      testID={testID}
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      scale={!!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {budget != null && <Text style={styles.price}>{peso(budget)}</Text>}
      </View>

      {!!address && (
        <View style={styles.metaRow}>
          <MapPin size={15} color={C.ink400} />
          <Text style={styles.meta} numberOfLines={1}>{address}</Text>
        </View>
      )}

      {allPills.length > 0 && (
        <View style={styles.pillRow}>
          {allPills.map((pill) => (
            <View key={pill.label} style={[styles.pill, { backgroundColor: pill.bg }]}>
              {pill.dot && <View style={[styles.dot, { backgroundColor: pill.color }]} />}
              <Text style={[styles.pillText, { color: pill.color }]}>{pill.label}</Text>
            </View>
          ))}
        </View>
      )}

      {footer.length > 0 && (
        <View style={styles.bottomRow}>
          {footer.map((item) => (
            <View key={item.text} style={styles.footItem}>
              {item.icon}
              <Text style={styles.footText} numberOfLines={1}>{item.text}</Text>
            </View>
          ))}
        </View>
      )}
    </Tap>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const dark = theme.appearance === 'dark';
  const styles = StyleSheet.create({
    card: {
      backgroundColor: C.surface, borderRadius: 20,
      marginBottom: 12, padding: 16, overflow: 'hidden',
      // Light: soft lift on the gray canvas. Dark: a hairline reads better than a shadow.
      borderWidth: dark ? 1 : 0, borderColor: C.line,
      elevation: dark ? 0 : 1.5,
      shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: dark ? 0 : 0.06, shadowRadius: 8,
    },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 },
    title: { color: C.ink900, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter', flex: 1, lineHeight: 22 },
    price: { color: C.ink900, fontSize: 17.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.2 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    meta: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', flex: 1 },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    pillText: { fontSize: 12.5, fontWeight: '700', fontFamily: 'Inter' },
    bottomRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10,
    },
    footItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    footText: { color: C.ink500, fontSize: 13, fontWeight: '500', fontFamily: 'Inter', flexShrink: 1 },
  });
  return { Colors, V6Colors, C, styles };
}
