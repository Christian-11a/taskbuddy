import React, { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { V6Colors, V6Radii, V6Shadows } from '../constants/theme';
import { peso, urgencyMeta } from '../lib/format';

const C = V6Colors;

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
  const allPills: JobCardPill[] = [
    ...(status ? [{ ...status, dot: true }] : []),
    ...(urgency ? [urgencyMeta(urgency)] : []),
    ...pills,
  ];

  return (
    <TouchableOpacity
      testID={testID}
      style={styles.card}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.9}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {budget != null && <Text style={styles.price}>{peso(budget)}</Text>}
      </View>

      {!!address && (
        <View style={styles.metaRow}>
          <MapPin size={14} color={C.ink400} />
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.white, borderRadius: V6Radii.cardSm,
    marginBottom: 10, padding: 15,
    borderWidth: 1, borderColor: C.line,
    ...V6Shadows.sm,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 5 },
  title: { color: C.ink900, fontSize: 15.5, fontWeight: '800', fontFamily: 'Inter', flex: 1 },
  price: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  meta: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter', flex: 1 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 11 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 11.5, fontWeight: '800', fontFamily: 'Inter' },
  bottomRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10,
    borderTopWidth: 1, borderTopColor: C.hairline, paddingTop: 10,
  },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  footText: { color: C.ink500, fontSize: 12.5, fontWeight: '600', fontFamily: 'Inter', flexShrink: 1 },
});
