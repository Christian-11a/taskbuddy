/**
 * HOProviderProfileScreen.tsx
 *
 * Shows a provider profile (GET /providers/:id) and reviews (GET /providers/:id/reviews).
 * If `jobId` prop exists, shows a button to open chat via `onNavigate('Chat', jobId)`.
 */

import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MessageCircle, Star } from 'lucide-react-native';
import { Colors, Radii, Shadows, Spacing } from '../../../src/constants/theme';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials, shortDate } from '../../../src/lib/format';
import { HOScreen } from '../../../src/types/navigation';

interface HOProviderProfileScreenProps {
  id: string;
  jobId?: string | null;
  onBack?: () => void;
  onNavigate?: (screen: HOScreen, jobId?: string) => void;
}

export default function HOProviderProfileScreen({
  id,
  jobId,
  onBack,
  onNavigate,
}: HOProviderProfileScreenProps) {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [provider, reviews] = await Promise.all([api.getProvider(id), api.getProviderReviews(id)]);
    return { provider, reviews };
  }, [id]);

  const provider = data?.provider ?? null;
  const reviews: any[] = data?.reviews ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Provider</Text>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 24 }} color={Colors.brandTeal} />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

      {!loading && provider && (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(provider.profiles?.full_name)}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{provider.profiles?.full_name ?? 'Provider'}</Text>
                <View style={styles.metaRow}>
                  <Star size={12} color={Colors.slate} fill={Colors.slate} />
                  <Text style={styles.metaText}>
                    {provider.cached_avg_rating != null ? `${Number(provider.cached_avg_rating).toFixed(1)} · ` : 'New · '}
                    {provider.cached_completed_jobs ?? 0} jobs
                  </Text>
                </View>
                <Text style={styles.metaSub}>{provider.profiles?.city ?? '—'}</Text>
              </View>

              {jobId && onNavigate && (
                <TouchableOpacity style={styles.chatBtn} onPress={() => onNavigate('Chat', jobId)} activeOpacity={0.85}>
                  <MessageCircle size={16} color={Colors.white} />
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bio}>{provider.bio ?? 'No bio provided.'}</Text>

            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Experience</Text>
              <Text style={styles.kvValue}>{provider.years_experience ?? '—'} yrs</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reviews</Text>
            {reviews.length === 0 && <Text style={styles.detailValue}>No reviews yet.</Text>}

            {reviews.map((r) => (
              <View key={r.id} style={styles.reviewRow}>
                <View style={styles.reviewAvatar}>
                  <Text style={styles.reviewAvatarText}>{initials(r.reviewer_name ?? r.reviewer?.full_name)}</Text>
                </View>
                <View style={styles.reviewContent}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewName}>{r.reviewer_name ?? r.reviewer?.full_name ?? 'Reviewer'}</Text>
                    <Text style={styles.reviewDate}>{shortDate(r.created_at)}</Text>
                  </View>
                  <View style={styles.reviewRatingRow}>
                    <Star size={12} color={Colors.slate} fill={Colors.slate} />
                    <Text style={styles.reviewRating}>{r.rating ?? '—'}</Text>
                  </View>
                  <Text style={styles.reviewComment}>{r.comment ?? ''}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.screenH,
    paddingTop: 18,
    paddingBottom: 12,
  },
  headerTitle: { color: Colors.brandDark, fontSize: 20, fontWeight: '800', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 10, paddingBottom: 20 },

  card: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 16, marginBottom: 12, ...Shadows.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 64, height: 64, borderRadius: 16, backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: Colors.white, fontSize: 20, fontWeight: '800', fontFamily: 'Inter' },

  info: { flex: 1 },
  name: { color: Colors.brandDark, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  metaText: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  metaSub: { color: Colors.slate, fontSize: 12, marginTop: 4 },

  chatBtn: { backgroundColor: Colors.brandTeal, borderRadius: 12, padding: 10 },

  sectionTitle: { marginTop: 12, color: Colors.brandDark, fontSize: 14, fontWeight: '800', fontFamily: 'Inter' },
  bio: { color: Colors.brandDark, fontSize: 13, marginTop: 8, fontFamily: 'Inter' },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  kvLabel: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  kvValue: { color: Colors.brandDark, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },

  cardTitle: { color: Colors.brandDark, fontSize: 14, fontWeight: '800', fontFamily: 'Inter', marginBottom: 8 },
  detailValue: { color: Colors.brandDark, fontSize: 14, fontFamily: 'Inter' },

  reviewRow: { flexDirection: 'row', marginBottom: 12, gap: 10 },
  reviewAvatar: { width: 44, height: 44, borderRadius: 10, backgroundColor: Colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { color: Colors.brandDark, fontSize: 14, fontWeight: '700' },
  reviewContent: { flex: 1 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewName: { color: Colors.brandDark, fontSize: 13, fontWeight: '700' },
  reviewDate: { color: Colors.slate, fontSize: 11 },
  reviewRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  reviewRating: { color: Colors.slate, fontSize: 12 },
  reviewComment: { color: Colors.brandDark, fontSize: 13, marginTop: 6 },
  stateText: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
});
