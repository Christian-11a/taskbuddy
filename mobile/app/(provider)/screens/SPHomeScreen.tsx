/**
 * SPHomeScreen.tsx ("Feed" tab)
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-dashboard screen — a
 * dark navy/slate gradient hero (deliberately different from the homeowner
 * side's teal — the mockup differentiates providers with a darker,
 * "professional" hero), a location pill, a search bar, and a single bordered
 * `.feed-list-surface` of flat `.feed-job-row` items (not individually
 * shadowed cards).
 *
 * Deviation: the mockup's hero shows no earnings/stats at all — this app
 * has real stats (jobs done, rating, active jobs) and an availability
 * toggle the mockup doesn't have, so those are kept but moved out of the
 * hero into a compact card row + status bar below it, matching the
 * mockup's `.flow-banner`/summary-card patterns instead of cluttering the
 * hero. The mockup's "For You"/"All Jobs" recommendation-score tabs are
 * dropped — this app has no job-match-scoring backend to power them.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  Star,
} from 'lucide-react-native';
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';
import { SPScreen } from '../../../src/types/navigation';

const C = V6Colors;
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials, shortDate } from '../../../src/lib/format';

interface SPHomeScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string) => void;
}

export default function SPHomeScreen({ onNavigate }: SPHomeScreenProps) {
  const { profile, providerProfile, isVerified } = useAuth();
  const { data } = useAsyncData(async () => {
    const [feed, assigned] = await Promise.all([
      api.browseJobs({
        limit: 20,
        latitude: profile?.latitude ?? undefined,
        longitude: profile?.longitude ?? undefined,
      }),
      api.assignedJobs(),
    ]);
    return { jobs: feed.jobs, summary: feed.summary, assigned };
  }, [profile?.latitude, profile?.longitude], 'sp-home');

  const [available, setAvailable] = useState(providerProfile?.is_available ?? true);
  const [togglingAvail, setTogglingAvail] = useState(false);
  const [search, setSearch] = useState('');
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
  const q = search.trim().toLowerCase();
  const availableJobs = (data?.jobs ?? []).filter(
    (job) => !q || job.title.toLowerCase().includes(q) || (job.service_categories?.name ?? '').toLowerCase().includes(q),
  );
  const location = profile?.city || 'Set your location';

  return (
    <View style={styles.screen}>
      {/* Hero — matches .hero-clean.dark */}
      <LinearGradient
        colors={['#111827', '#18283b', '#0c4a6e']}
        locations={[0, 0.72, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.greeting}>Hello, {name || 'there'}</Text>
            <Text style={styles.heroTitle}>Jobs Near You</Text>
          </View>
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onNavigate('Notifications')}
              activeOpacity={0.8}
            >
              <Bell size={20} color={C.white} />
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

        <Text style={styles.feedSummary}>
          {data ? availableJobs.length : '—'} job{availableJobs.length === 1 ? '' : 's'} available around your service area
        </Text>

        <View style={styles.locationPill}>
          <MapPin size={14} color={C.white} />
          <Text style={styles.locationPillText} numberOfLines={1}>{location}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Verification banner — matches .flow-banner.cyan */}
        {!isVerified && (
          <TouchableOpacity
            style={styles.flowBanner}
            onPress={() => onNavigate('Verification')}
            activeOpacity={0.85}
          >
            <View style={styles.flowIcon}>
              <ShieldCheck size={19} color={C.cyan700} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.flowTitle}>Get verified to submit proposals</Text>
              <Text style={styles.flowBody}>
                Browse jobs freely. Verify when you're ready to apply for work and receive payouts.
              </Text>
            </View>
            <Text style={styles.flowAction}>Verify now</Text>
          </TouchableOpacity>
        )}

        {/* Availability toggle (real feature, not in the mockup) */}
        <TouchableOpacity style={styles.statusBar} onPress={toggleAvailability} activeOpacity={0.8} disabled={togglingAvail}>
          <View style={[styles.statusDot, { backgroundColor: available ? '#22c55e' : C.ink300 }]} />
          <Text style={styles.statusText}>{available ? 'Available for Jobs' : 'Not Available'}</Text>
          <View style={[styles.statusToggleTrack, !available && styles.statusToggleTrackOff]}>
            <View style={[styles.statusToggleThumb, !available && styles.statusToggleThumbOff]} />
          </View>
        </TouchableOpacity>

        {/* Stats row (real data, not in the mockup's feed hero) */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <CheckCircle2 size={18} color={C.cyan700} />
            <Text style={styles.statValue}>{jobsDone}</Text>
            <Text style={styles.statLabel}>Jobs Done</Text>
          </View>
          <View style={styles.statCard}>
            <Star size={18} color={C.cyan700} />
            <Text style={styles.statValue}>{rating != null ? Number(rating).toFixed(1) : 'New'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <CalendarDays size={18} color={C.cyan700} />
            <Text style={styles.statValue}>{activeCount}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
        </View>

        {/* Search — matches .scope-search */}
        <View style={styles.scopeSearch}>
          <Search size={19} color={C.ink400} />
          <TextInput
            style={styles.scopeSearchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search open jobs"
            placeholderTextColor={C.ink400}
          />
        </View>

        {!data && <ActivityIndicator style={{ marginTop: 20 }} color={C.cyan700} />}
        {data && availableJobs.length === 0 && (
          <View style={styles.emptyState}>
            <Search size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>No matching jobs</Text>
            <Text style={styles.emptyText}>Adjust your search to see more opportunities.</Text>
          </View>
        )}

        {/* Feed list — matches .feed-list-surface / .feed-job-row */}
        {availableJobs.length > 0 && (
          <View style={styles.feedList}>
            {availableJobs.map((job, i) => {
              const isUrgent = job.urgency === 'urgent';
              return (
                <TouchableOpacity
                  key={job.id}
                  style={[styles.feedRow, i < availableJobs.length - 1 && styles.feedRowBorder]}
                  onPress={() => onNavigate('Job Detail', job.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.feedRowMain}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.feedTitle} numberOfLines={1}>{job.title}</Text>
                      <View style={styles.feedLocationRow}>
                        <MapPin size={13} color={C.ink400} />
                        <Text style={styles.feedLocation} numberOfLines={1}>{job.address}</Text>
                      </View>
                    </View>
                    {job.budget != null && <Text style={styles.feedPrice}>₱{Number(job.budget).toLocaleString()}</Text>}
                  </View>
                  <View style={styles.feedFoot}>
                    <View style={styles.feedSchedule}>
                      <CalendarDays size={13} color={C.ink500} />
                      <Text style={styles.feedScheduleText}>
                        {job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible schedule'}
                      </Text>
                    </View>
                    {isUrgent ? (
                      <Text style={styles.urgentInline}>Urgent</Text>
                    ) : (
                      <Text style={styles.normalInline}>{job.service_categories?.name ?? ''}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  hero: {
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
  greeting: { color: C.ink400, fontSize: 13, fontFamily: 'Inter', marginBottom: 3 },
  heroTitle: { color: C.white, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
  heroActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: C.white, fontWeight: '800', fontSize: 14.5, fontFamily: 'Inter' },

  feedSummary: { color: 'rgba(255,255,255,0.68)', fontSize: 12.5, fontFamily: 'Inter', marginTop: 12 },

  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginTop: 14, alignSelf: 'flex-start', maxWidth: '100%',
  },
  locationPillText: { color: C.white, fontSize: 12.5, fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

  flowBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#f2fbfd', borderWidth: 1, borderColor: C.cyan100,
    borderRadius: 16, padding: 14, marginBottom: 14,
  },
  flowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.cyan50, alignItems: 'center', justifyContent: 'center' },
  flowTitle: { fontSize: 13.5, color: C.ink900, fontWeight: '700', fontFamily: 'Inter' },
  flowBody: { fontSize: 12, lineHeight: 16, color: C.ink500, fontFamily: 'Inter', marginTop: 3 },
  flowAction: { color: C.cyan700, fontSize: 12.5, fontWeight: '800', fontFamily: 'Inter', alignSelf: 'center' },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 14, marginBottom: 14,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { flex: 1, color: C.ink700, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
  statusToggleTrack: {
    width: 40, height: 24, borderRadius: 12, backgroundColor: C.cyan700,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  statusToggleTrackOff: { backgroundColor: C.ink200 },
  statusToggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.white, alignSelf: 'flex-end' },
  statusToggleThumbOff: { alignSelf: 'flex-start' },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 14, paddingVertical: 12, alignItems: 'center', gap: 3,
  },
  statValue: { color: C.ink900, fontSize: 17.5, fontWeight: '800', fontFamily: 'Inter' },
  statLabel: { color: C.ink400, fontSize: 12, fontFamily: 'Inter' },

  scopeSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 16,
  },
  scopeSearchInput: { flex: 1, fontSize: 14.5, color: C.ink900, fontFamily: 'Inter', padding: 0 },

  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 22 },
  emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
  emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

  feedList: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden' },
  feedRow: { padding: 16 },
  feedRowBorder: { borderBottomWidth: 1, borderBottomColor: '#edf1f4' },
  feedRowMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 },
  feedTitle: { fontSize: 15.5, fontWeight: '800', color: C.ink900, fontFamily: 'Inter' },
  feedLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  feedLocation: { fontSize: 12.5, color: C.ink400, fontFamily: 'Inter', flexShrink: 1 },
  feedPrice: { fontSize: 18.5, fontWeight: '800', color: C.ink900, fontFamily: 'Inter' },
  feedFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  feedSchedule: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  feedScheduleText: { fontSize: 12.5, color: C.ink500, fontWeight: '600', fontFamily: 'Inter' },
  urgentInline: { color: '#b91c1c', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Inter' },
  normalInline: { fontSize: 11.5, fontWeight: '700', color: C.ink400, fontFamily: 'Inter' },
});
