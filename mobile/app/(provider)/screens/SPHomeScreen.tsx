/**
 * SPHomeScreen.tsx (SP - New Dashboard / SP - Main Dashboard)
 *
 * Figma Source: "SP - New Dashboard" (id: 305:819) and "SP - Main Dashboard" (id: 36:467)
 *
 * Design:
 * - Dark teal hero header with earnings overview
 * - Stats: Earnings, Rating, Jobs Done
 * - Available/Urgent jobs feed
 * - 5-tab bottom nav (handled by parent)
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Bell,
  CheckCircle2,
  MapPin,
  Star,
  Clock3,
  CircleAlert,
  Wallet,
  RefreshCw,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react-native';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';
import { SPScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials, peso, shortDate } from '../../../src/lib/format';

interface SPHomeScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string) => void;
}

export default function SPHomeScreen({ onNavigate }: SPHomeScreenProps) {
  const { profile, providerProfile, isVerified } = useAuth();
  const { data } = useAsyncData(async () => {
    const [wallet, feed, assigned] = await Promise.all([
      api.wallet(),
      api.browseJobs({
        limit: 20,
        latitude: profile?.latitude ?? undefined,
        longitude: profile?.longitude ?? undefined,
      }),
      api.assignedJobs(),
    ]);
    return { wallet, jobs: feed.jobs, summary: feed.summary, assigned };
  }, [profile?.latitude, profile?.longitude]);

  const [available, setAvailable] = useState(providerProfile?.is_available ?? true);
  const [togglingAvail, setTogglingAvail] = useState(false);
  useEffect(() => {
    if (providerProfile) setAvailable(providerProfile.is_available);
  }, [providerProfile]);

  const toggleAvailability = async () => {
    if (togglingAvail) return;
    const next = !available;
    setAvailable(next);
    setTogglingAvail(true);
    try {
      await api.setAvailability(next);
    } catch {
      setAvailable(!next); // revert on failure
    } finally {
      setTogglingAvail(false);
    }
  };

  const name = profile?.full_name ?? '';
  const rating = providerProfile?.cached_avg_rating;
  const jobsDone = providerProfile?.cached_completed_jobs ?? 0;
  const activeCount = (data?.assigned ?? []).filter((j) =>
    ['assigned', 'in_progress'].includes(j.status),
  ).length;
  const availableJobs = data?.jobs ?? [];
  const location = profile?.city || 'Set your location';

  return (
    <View style={styles.screen}>
      {/* Hero Header */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.greeting}>Welcome back!</Text>
            <Text style={styles.providerName}>{name || 'Provider'}</Text>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.notifBtn}
              onPress={() => onNavigate('Notifications')}
              activeOpacity={0.8}
            >
              <Bell size={18} color={Colors.white} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatarCircle}
              onPress={() => onNavigate('Profile')}
              activeOpacity={0.8}
            >
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Earnings card */}
        <View style={styles.earningsCard}>
          <View style={styles.earningsRow}>
            <View>
              <Text style={styles.earningsLabel}>Wallet Balance</Text>
              <Text style={styles.earningsAmount}>{data ? peso(data.wallet.balance) : '—'}</Text>
            </View>
            <TouchableOpacity
              style={styles.walletBtn}
              onPress={() => onNavigate('Wallet')}
              activeOpacity={0.8}
            >
              <View style={styles.walletBtnContent}>
                <Wallet size={14} color={Colors.white} />
                <Text style={styles.walletBtnText}>Wallet</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <CheckCircle2 size={18} color={Colors.white} />
              <Text style={styles.statValue}>{jobsDone}</Text>
              <Text style={styles.statLabel}>Jobs Done</Text>
            </View>
            <View style={styles.statItem}>
              <Star size={18} color={Colors.white} />
              <Text style={styles.statValue}>{rating != null ? Number(rating).toFixed(1) : 'New'}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statItem}>
              <RefreshCw size={18} color={Colors.white} />
              <Text style={styles.statValue}>{activeCount}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
          </View>
        </View>

        {/* Status / availability toggle (real) */}
        <TouchableOpacity style={styles.statusBar} onPress={toggleAvailability} activeOpacity={0.8} disabled={togglingAvail}>
          <View style={[styles.statusDot, { backgroundColor: available ? '#22C55E' : Colors.muted }]} />
          <Text style={styles.statusText}>{available ? 'Available for Jobs' : 'Not Available'}</Text>
          <View style={[styles.statusToggleTrack, !available && styles.statusToggleTrackOff]}>
            <View style={[styles.statusToggleThumb, !available && styles.statusToggleThumbOff]} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Body */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Location */}
        <View style={styles.locationRow}>
          <View style={styles.locationTextRow}>
            <MapPin size={14} color={Colors.brandTeal} />
            <Text style={styles.locationText}>{location}</Text>
          </View>
        </View>

        {/* Verification prompt — unverified providers can browse but can't apply */}
        {!isVerified && (
          <TouchableOpacity
            style={styles.verifyBanner}
            onPress={() => onNavigate('Verification')}
            activeOpacity={0.85}
          >
            <View style={styles.verifyIconCircle}>
              <ShieldCheck size={20} color={Colors.white} />
            </View>
            <View style={styles.verifyTextBox}>
              <Text style={styles.verifyTitle}>Get Verified</Text>
              <Text style={styles.verifyBody}>
                Submit your ID to start applying for jobs and getting hired.
              </Text>
            </View>
            <ChevronRight size={20} color={Colors.brandTeal} />
          </TouchableOpacity>
        )}

        {/* Feed summary: open / urgent / potential payout */}
        {data?.summary && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{data.summary.open_count}</Text>
              <Text style={styles.summaryLabel}>Open</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryValue, { color: '#EF4444' }]}>{data.summary.urgent_count}</Text>
              <Text style={styles.summaryLabel}>Urgent</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{peso(data.summary.potential_payout)}</Text>
              <Text style={styles.summaryLabel}>Payout</Text>
            </View>
          </View>
        )}

        {/* Available jobs */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Available Jobs</Text>
          <TouchableOpacity onPress={() => onNavigate('My Jobs')} activeOpacity={0.8}>
            <Text style={styles.seeAll}>My Jobs</Text>
          </TouchableOpacity>
        </View>

        {!data && <ActivityIndicator style={{ marginTop: 20 }} color={Colors.brandTeal} />}
        {data && availableJobs.length === 0 && (
          <Text style={styles.emptyText}>No open jobs right now. Check back soon.</Text>
        )}

        {availableJobs.map((job) => {
          const isUrgent = job.urgency === 'urgent';
          return (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => onNavigate('Job Detail', job.id)}
              activeOpacity={0.9}
            >
              {isUrgent && (
                <View style={styles.urgentBanner}>
                  <CircleAlert size={14} color={Colors.error} />
                  <Text style={styles.urgentBannerText}>URGENT JOB</Text>
                </View>
              )}
              <View style={styles.jobCardHeader}>
                <Text style={styles.jobTitle}>{job.title}</Text>
              </View>
              <Text style={styles.jobCategory}>{job.service_categories?.name ?? ''}</Text>
              <View style={styles.jobInfoRow}>
                <View style={styles.metaItem}>
                  <MapPin size={14} color={Colors.brandTeal} />
                  <Text style={styles.jobInfo}>{job.address}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Clock3 size={14} color={Colors.brandTeal} />
                  <Text style={styles.jobInfo}>Posted {shortDate(job.posted_at)}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.claimBtn, isUrgent && styles.claimBtnUrgent]}
                onPress={() => onNavigate('Job Detail', job.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.claimBtnText}>
                  {isUrgent ? 'View Urgent Job' : 'View Details'}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  hero: {
    backgroundColor: Colors.brandDark,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 0,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, paddingBottom: 16,
  },
  greeting: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter', fontWeight: '500' },
  providerName: { color: Colors.white, fontSize: 20, fontWeight: '800', fontFamily: 'Inter', marginTop: 2 },
  heroActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  notifBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  notifIcon: { fontSize: 18 },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontWeight: '800', fontSize: 14, fontFamily: 'Inter' },

  earningsCard: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 18, marginBottom: 12,
  },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  earningsLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter', marginBottom: 2 },
  earningsAmount: { color: Colors.white, fontSize: 30, fontWeight: '800', fontFamily: 'Inter' },
  walletBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  walletBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  walletBtnText: { color: Colors.white, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },

  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 2 },
  statIcon: { fontSize: 18 },
  statValue: { color: Colors.white, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Inter' },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
    marginBottom: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  statusText: { flex: 1, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  statusToggleTrack: {
    width: 44, height: 26, borderRadius: 13, backgroundColor: Colors.brandTeal,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  statusToggleTrackOff: { backgroundColor: 'rgba(255,255,255,0.2)' },
  statusToggleThumb: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.white, alignSelf: 'flex-end',
  },
  statusToggleThumbOff: { alignSelf: 'flex-start' },
  emptyText: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', paddingVertical: 16 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },

  locationRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  locationTextRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationText: { color: Colors.slate, fontSize: 13, fontFamily: 'Inter' },
  radiusText: { color: Colors.brandTeal, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },

  verifyBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white, borderRadius: Radii.card,
    padding: 14, marginBottom: 16, ...Shadows.card,
    borderWidth: 1, borderColor: 'rgba(6,61,77,0.08)',
  },
  verifyIconCircle: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.brandTeal, alignItems: 'center', justifyContent: 'center',
  },
  verifyTextBox: { flex: 1 },
  verifyTitle: { color: Colors.brandDark, fontSize: 14, fontWeight: '800', fontFamily: 'Inter' },
  verifyBody: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter', marginTop: 2, lineHeight: 16 },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: Radii.card,
    paddingVertical: 14, alignItems: 'center', ...Shadows.card,
  },
  summaryValue: { color: Colors.brandDark, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  summaryLabel: { color: Colors.muted, fontSize: 11, fontWeight: '600', fontFamily: 'Inter', marginTop: 2 },

  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: Colors.brandDark, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  seeAll: { color: Colors.brandTeal, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },

  jobCard: {
    backgroundColor: Colors.white, borderRadius: Radii.card,
    padding: 16, marginBottom: 14, ...Shadows.card, overflow: 'hidden',
  },
  urgentBanner: {
    backgroundColor: '#FEE2E2', marginHorizontal: -16, marginTop: -16,
    paddingVertical: 6, paddingHorizontal: 16, marginBottom: 12,
  },
  urgentBannerText: { color: '#EF4444', fontSize: 12, fontWeight: '800', fontFamily: 'Inter' },
  jobCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  jobTitle: { color: Colors.brandDark, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', flex: 1 },
  jobBudget: { color: Colors.brandTeal, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  jobCategory: { color: Colors.muted, fontSize: 12, fontWeight: '600', fontFamily: 'Inter', marginBottom: 8 },
  jobInfoRow: { marginBottom: 6, gap: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  jobInfo: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter', flexShrink: 1 },
  jobMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  jobPoster: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  jobDistance: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  tagsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  tag: { backgroundColor: Colors.backgroundAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagUrgent: { backgroundColor: '#FEE2E2' },
  tagText: { color: Colors.slate, fontSize: 11, fontWeight: '600', fontFamily: 'Inter' },
  tagTextUrgent: { color: '#EF4444' },
  claimBtn: {
    backgroundColor: Colors.brandTeal, borderRadius: 14, padding: 12, alignItems: 'center',
  },
  claimBtnUrgent: { backgroundColor: '#EF4444' },
  claimBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },
});
