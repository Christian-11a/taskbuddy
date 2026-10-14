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
 * Reached from a proposal, so a client can check a provider before hiring.
 * With a `proposal`, the profile shows that proposal's offer for the job and
 * ends with the Hire action (the same payment sheet as on the proposals list)
 * and a link back to the proposals. Without one there is no Hire action.
 * Sections with nothing in them are hidden rather than shown empty.
 * The mockup's portfolio grid becomes "Recent work": the provider's last
 * completed jobs (title, service, date — never another client's photos or
 * address). No hourly rates: this is a per-job marketplace.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React from 'react';
import PortfolioGallery from '../../../src/components/PortfolioGallery';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import { approvedServiceNames } from '../../../src/lib/providerServices';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import RefreshBar from '../../../src/components/ui/RefreshBar';
import Silhouette from '../../../src/components/ui/Silhouette';
import { ArrowLeft, BadgeCheck, CheckCircle2, MessageCircle, ShieldAlert, Star } from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { experienceLabel, shortDate } from '../../../src/lib/format';
import { HOScreen } from '../../../src/types/navigation';

/** The proposal this profile was opened from: its offer, and the way to hire from it. */
export interface ProfileProposal {
  providerName: string;
  jobTitle: string | null;
  message: string | null;
  onHire: () => void;
}

interface HOProviderProfileScreenProps {
  id: string;
  jobId?: string | null;
  proposal?: ProfileProposal;
  onBack?: () => void;
  onNavigate?: (screen: HOScreen, jobId?: string) => void;
}

export default function HOProviderProfileScreen({
  id,
  jobId,
  proposal,
  onBack,
  onNavigate,
}: HOProviderProfileScreenProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [provider, reviews, work] = await Promise.all([
      api.getProvider(id),
      api.getProviderReviews(id),
      // A missing portfolio shouldn't hide the rest of the profile.
      api.getProviderWork(id).catch(() => []),
    ]);
    return { provider, reviews, work };
  }, [id]);

  useRefreshOnForeground(reload, true);
  const portfolio=useAsyncData(()=>api.providerPortfolio(id),[id]);
  useRefreshOnForeground(portfolio.reload,true);
  const provider = data?.provider ?? null;
  const reviews: any[] = data?.reviews ?? [];
  const work = data?.work ?? [];
  const portfolioEntries = portfolio.data ?? [];
  // Portfolio only shows while it loads, when it failed, or when there are photos.
  const showPortfolio = portfolio.loading || !!portfolio.error || portfolioEntries.length > 0;
  // Null until the provider has set their years, so the chip is hidden rather than showing "0 yrs".
  const experience = experienceLabel(provider?.years_experience);

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        {onBack && (
          <Tap style={styles.backBtn} onPress={onBack} hitSlop={5} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Back">
            <ArrowLeft size={20} color={C.ink700} />
          </Tap>
        )}
        <Text style={styles.headerTitle}>Provider Profile</Text>
      </View>

      {/* The skeleton only stands in for a profile not loaded yet; a reload keeps the profile and shows the bar. */}
      {loading && !data && <ContentSkeleton variant="detail" />}
      {loading && !!data && <RefreshBar />}
      {!!error && !loading && (
        <View style={styles.errorWrap}>
          <LoadErrorCard title="Couldn't load this provider" message={error} onRetry={reload} />
        </View>
      )}

      {provider && (
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Hero — matches .public-hero */}
          <View style={styles.hero}>
            <View style={styles.avatar}>
              <Silhouette name={provider.profiles?.full_name} textStyle={styles.avatarText} />
            </View>
            <Text style={styles.name}>{provider.profiles?.full_name ?? 'Provider'}</Text>
            {approvedServiceNames(provider).length > 0 && (
              <Text style={styles.serviceText}>{approvedServiceNames(provider).join(' · ')}</Text>
            )}
            <View style={[styles.verifyPill, provider.is_verified ? styles.verifyPillOn : styles.verifyPillOff]}>
              {provider.is_verified
                ? <BadgeCheck size={13} color={V6Colors.successText} />
                : <ShieldAlert size={13} color={C.amber700} />}
              <Text style={[styles.verifyText, { color: provider.is_verified ? V6Colors.successText : V6Colors.warningText }]}>
                {provider.is_verified ? 'ID verified' : 'Not verified yet'}
              </Text>
            </View>
            {!!provider.profiles?.city && <Text style={styles.metaText}>{provider.profiles.city}</Text>}
          </View>

          {/* Rating, jobs done and experience, as one card */}
          <View style={styles.statsCard}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {provider.cached_avg_rating != null ? Number(provider.cached_avg_rating).toFixed(1) : 'New'}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{String(provider.cached_completed_jobs)}</Text>
              <Text style={styles.statLabel}>Jobs done</Text>
            </View>
            {experience && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{experience}</Text>
                  <Text style={styles.statLabel}>Experience</Text>
                </View>
              </>
            )}
          </View>

          {/* The offer on this job, when the profile was opened from a proposal */}
          {!!proposal?.message && (
            <View style={styles.section}>
              <Text style={styles.offerTitle}>
                {proposal.jobTitle ? `Their offer for ${proposal.jobTitle}` : 'Their offer'}
              </Text>
              <View style={styles.offerBubble}>
                <Text style={styles.offerText}>{proposal.message}</Text>
              </View>
            </View>
          )}

          {/* About */}
          {!!provider.bio && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">About</Text>
              <Text style={styles.bio}>{provider.bio}</Text>
            </View>
          )}

          {showPortfolio && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Portfolio</Text>
              {portfolio.loading && <ActivityIndicator color={V6Colors.link}/>}
              {!!portfolio.error && (
                <LoadErrorCard title="Couldn't load the portfolio" message={portfolio.error} onRetry={portfolio.reload} />
              )}
              {!portfolio.loading && !portfolio.error && <PortfolioGallery entries={portfolioEntries}/>}
            </View>
          )}

          {/* Recent work */}
          {work.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Recent work</Text>
              {work.map((item) => (
                <View key={item.id} style={styles.workRow}>
                  <CheckCircle2 size={16} color={V6Colors.link} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.workTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.workMeta} numberOfLines={1}>
                      {[item.service_categories?.name, item.completed_at ? shortDate(item.completed_at) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Reviews</Text>
              {reviews.map((r) => (
                <View key={r.id} style={styles.reviewRow}>
                  <View style={styles.reviewAvatar}>
                    <Silhouette name={r.client?.full_name} textStyle={styles.reviewAvatarText} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewName}>{r.client?.full_name ?? 'Client'}</Text>
                      <Text style={styles.reviewDate}>{shortDate(r.created_at)}</Text>
                    </View>
                    <View style={styles.reviewRatingRow}>
                      <Star size={12} color={C.ink400} fill={C.ink400} />
                      <Text style={styles.reviewRating}>{r.rating ?? '—'}</Text>
                    </View>
                    {!!r.jobs?.title && <Text style={styles.reviewJob} numberOfLines={1}>For: {r.jobs.title}</Text>}
                    {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}

          {jobId && onNavigate && (
            <View style={styles.actionBar}>
              <Tap
                style={styles.messageBtn}
                onPress={() => onNavigate('Chat', jobId)}
                activeOpacity={0.85}
              >
                <MessageCircle size={18} color={C.onPrimary} />
                <Text style={styles.messageBtnText}>Message</Text>
              </Tap>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {proposal && (
        <BottomActionBar
          primaryLabel={`Hire ${proposal.providerName}`}
          onPrimary={proposal.onHire}
          secondaryLabel="Back to proposals"
          onSecondary={onBack}
        />
      )}
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

    body: { flex: 1 },

    hero: { padding: 22, paddingHorizontal: Spacing.screenH, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line, alignItems: 'center' },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryTonalStrong, alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden' },
    avatarText: { color: C.primaryDeep, fontSize: 24, fontWeight: '800', fontFamily: 'Inter' },
    name: { color: C.ink900, fontSize: 20.5, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' },
    metaText: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter', marginTop: 4, textAlign: 'center' },
    serviceText: { color: V6Colors.link, fontSize: 13, fontWeight: '700', fontFamily: 'Inter', marginTop: 2, textAlign: 'center' },
    verifyPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 8 },
    verifyPillOn: { backgroundColor: V6Colors.successSurface },
    verifyPillOff: { backgroundColor: V6Colors.warningSurface },
    verifyText: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },

    statsCard: {
      flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.screenH, marginTop: 14,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 14,
    },
    stat: { flex: 1, alignItems: 'center', gap: 2, minWidth: 0 },
    statValue: { color: C.ink900, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
    statLabel: { color: C.ink500, fontSize: 12, fontFamily: 'Inter', textAlign: 'center' },
    statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: C.line },

    workRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    workTitle: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
    workMeta: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter', marginTop: 1 },
    reviewJob: { color: C.ink400, fontSize: 12, fontFamily: 'Inter', marginTop: 2 },

    section: { padding: 18, paddingHorizontal: Spacing.screenH, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line },
    sectionTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.7, color: C.ink400, fontWeight: '700', fontFamily: 'Inter', marginBottom: 10 },
    offerTitle: { color: C.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', marginBottom: 10 },
    offerBubble: { backgroundColor: Colors.primaryTonal, borderRadius: 16, padding: 14 },
    offerText: { color: C.ink900, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    bio: { fontSize: 13.5, lineHeight: 20, color: C.ink700, fontFamily: 'Inter' },

    reviewRow: { flexDirection: 'row', marginBottom: 14, gap: 10 },
    reviewAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.ink50, alignItems: 'center', justifyContent: 'center' },
    reviewAvatarText: { color: C.ink700, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    reviewName: { color: C.ink900, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
    reviewDate: { color: C.ink400, fontSize: 12, fontFamily: 'Inter' },
    reviewRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    reviewRating: { color: C.ink500, fontSize: 12.5, fontFamily: 'Inter' },
    reviewComment: { color: C.ink700, fontSize: 13.5, marginTop: 5, lineHeight: 18, fontFamily: 'Inter' },

    errorWrap: { paddingHorizontal: Spacing.screenH, paddingTop: 16 },

    actionBar: { padding: Spacing.screenH, paddingTop: 16 },
    messageBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.cyan700, borderRadius: 13, paddingVertical: 14 },
    messageBtnText: { color: C.onPrimary, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, C, styles };
}
