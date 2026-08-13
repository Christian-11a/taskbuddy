/**
 * HOProviderProfileScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-provider-detail screen —
 * flat white .topbar, a centered .public-hero (squircle avatar), and
 * .public-section blocks (full-bleed, bottom-divider only, no card shadows).
 *
 * Also fixes a real bug found while restyling: `onBack` was already a wired
 * prop but the old header never rendered a back button.
 *
 * Deviation: the mockup's version shows a freelancer-style "Services & rate"
 * skill-tag list and a portfolio image grid; this app's providers don't
 * carry hourly rates or a portfolio (it's a per-job marketplace, not a
 * freelancer directory), so those sections are replaced with the real About
 * + Reviews data this screen already had, restyled to the same section
 * pattern. The bottom action is "Message" (this app's real functionality)
 * in place of the mockup's "Invite to Apply" (which isn't a feature here).
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
import { ArrowLeft, MessageCircle, Star } from 'lucide-react-native';
import { Spacing, Sizes, V6Colors } from '../../../src/constants/theme';

const C = V6Colors;
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
  const { data, loading, error } = useAsyncData(async () => {
    const [provider, reviews] = await Promise.all([api.getProvider(id), api.getProviderReviews(id)]);
    return { provider, reviews };
  }, [id]);

  const provider = data?.provider ?? null;
  const reviews: any[] = data?.reviews ?? [];

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={C.ink700} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Provider Profile</Text>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 24 }} color={C.cyan700} />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

      {!loading && provider && (
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Hero — matches .public-hero */}
          <View style={styles.hero}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials(provider.profiles?.full_name)}</Text>
            </View>
            <Text style={styles.name}>{provider.profiles?.full_name ?? 'Provider'}</Text>
            <Text style={styles.metaText}>
              {provider.cached_avg_rating != null ? `${Number(provider.cached_avg_rating).toFixed(1)}★ · ` : 'New · '}
              {provider.cached_completed_jobs ?? 0} completed jobs
              {provider.profiles?.city ? ` · ${provider.profiles.city}` : ''}
            </Text>
          </View>

          {/* About */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bio}>{provider.bio ?? 'No bio provided.'}</Text>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>Experience</Text>
              <Text style={styles.kvValue}>{provider.years_experience ?? '—'} yrs</Text>
            </View>
          </View>

          {/* Reviews */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reviews</Text>
            {reviews.length === 0 && <Text style={styles.bio}>No reviews yet.</Text>}
            {reviews.map((r) => (
              <View key={r.id} style={styles.reviewRow}>
                <View style={styles.reviewAvatar}>
                  <Text style={styles.reviewAvatarText}>{initials(r.reviewer_name ?? r.reviewer?.full_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewName}>{r.reviewer_name ?? r.reviewer?.full_name ?? 'Reviewer'}</Text>
                    <Text style={styles.reviewDate}>{shortDate(r.created_at)}</Text>
                  </View>
                  <View style={styles.reviewRatingRow}>
                    <Star size={12} color={C.ink400} fill={C.ink400} />
                    <Text style={styles.reviewRating}>{r.rating ?? '—'}</Text>
                  </View>
                  {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                </View>
              </View>
            ))}
          </View>

          {jobId && onNavigate && (
            <View style={styles.actionBar}>
              <TouchableOpacity
                style={styles.messageBtn}
                onPress={() => onNavigate('Chat', jobId)}
                activeOpacity={0.85}
              >
                <MessageCircle size={18} color={C.white} />
                <Text style={styles.messageBtnText}>Message</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

  body: { flex: 1 },

  hero: { padding: 22, paddingHorizontal: Spacing.screenH, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 22, backgroundColor: C.cyan700, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { color: C.white, fontSize: 24, fontWeight: '800', fontFamily: 'Inter' },
  name: { color: C.ink900, fontSize: 20.5, fontWeight: '700', fontFamily: 'Inter' },
  metaText: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter', marginTop: 4, textAlign: 'center' },

  section: { padding: 18, paddingHorizontal: Spacing.screenH, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  sectionTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7, color: C.ink400, fontWeight: '700', fontFamily: 'Inter', marginBottom: 10 },
  bio: { fontSize: 13.5, lineHeight: 20, color: C.ink700, fontFamily: 'Inter' },

  kvRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  kvLabel: { color: C.ink500, fontSize: 13.5, fontFamily: 'Inter' },
  kvValue: { color: C.ink900, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },

  reviewRow: { flexDirection: 'row', marginBottom: 14, gap: 10 },
  reviewAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.ink50, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { color: C.ink700, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewName: { color: C.ink900, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
  reviewDate: { color: C.ink400, fontSize: 12, fontFamily: 'Inter' },
  reviewRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  reviewRating: { color: C.ink500, fontSize: 12.5, fontFamily: 'Inter' },
  reviewComment: { color: C.ink700, fontSize: 13.5, marginTop: 5, lineHeight: 18, fontFamily: 'Inter' },

  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },

  actionBar: { padding: Spacing.screenH, paddingTop: 16 },
  messageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.cyan700, borderRadius: 13, paddingVertical: 14 },
  messageBtnText: { color: C.white, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
});
