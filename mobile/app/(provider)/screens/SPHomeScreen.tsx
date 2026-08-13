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
 *
 * Two things run down this screen, and they are not the same thing:
 *
 *   Booking requests — jobs a homeowner has already hired this provider for
 *   (status 'assigned'), waiting on an answer. These are commitments with a
 *   homeowner on the other end, so they sit above everything else and carry
 *   Accept/Decline inline.
 *
 *   The job feed — open work nobody has been hired for yet. Filtered to the
 *   provider's service radius and ordered by the backend: urgent first, then
 *   nearest, then newest (jobs.service.ts `browse`). The summary strip above
 *   it counts what is in that filtered feed, not what exists platform-wide.
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
  Inbox,
  MapPin,
  Search,
  ShieldCheck,
  Star,
  TriangleAlert,
  Wallet,
} from 'lucide-react-native';
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';
import { SPScreen } from '../../../src/types/navigation';

const C = V6Colors;
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, ApiError, Job } from '../../../src/lib/api';
import { distanceLabel, peso, shortDate } from '../../../src/lib/format';
import DeclineBookingModal from '../../../src/components/DeclineBookingModal';
import OwnAvatar from '../../../src/components/OwnAvatar';

/** Feed radius when the provider has not set one on their profile. */
const DEFAULT_RADIUS_KM = 50;

interface SPHomeScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string) => void;
}

export default function SPHomeScreen({ onNavigate }: SPHomeScreenProps) {
  const { profile, providerProfile, isVerified } = useAuth();
  const radiusKm = providerProfile?.service_radius_km ?? DEFAULT_RADIUS_KM;
  const { data, reload } = useAsyncData(async () => {
    const [feed, assigned] = await Promise.all([
      api.browseJobs({
        limit: 20,
        latitude: profile?.latitude ?? undefined,
        longitude: profile?.longitude ?? undefined,
        radius_km: radiusKm,
      }),
      api.assignedJobs(),
    ]);
    return { jobs: feed.jobs, summary: feed.summary, assigned };
  }, [profile?.latitude, profile?.longitude, radiusKm], 'sp-home');

  const [available, setAvailable] = useState(providerProfile?.is_available ?? true);
  const [togglingAvail, setTogglingAvail] = useState(false);
  const [search, setSearch] = useState('');
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [decliningJob, setDecliningJob] = useState<Job | null>(null);
  useEffect(() => {
    if (providerProfile) setAvailable(providerProfile.is_available);
  }, [providerProfile]);

  const errorMessage = (e: unknown) =>
    e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';

  const acceptBooking = async (job: Job) => {
    if (actingOn) return;
    setActingOn(job.id);
    setActionError(null);
    try {
      await api.acceptJob(job.id);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setActingOn(null);
    }
  };

  const declineBooking = async (reason: string) => {
    const job = decliningJob;
    if (!job) return;
    setActingOn(job.id);
    setActionError(null);
    try {
      await api.declineJob(job.id, reason);
      setDecliningJob(null);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setActingOn(null);
    }
  };

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
  // Hired and waiting on this provider to answer — the top of the screen.
  const bookingRequests = (data?.assigned ?? []).filter((j) => j.status === 'assigned');
  const activeCount = (data?.assigned ?? []).filter((j) =>
    ['assigned', 'confirmed', 'in_progress'].includes(j.status),
  ).length;
  const summary = data?.summary;
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
              <OwnAvatar name={name} textStyle={styles.avatarText} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.feedSummary}>
          {data ? availableJobs.length : '—'} job{availableJobs.length === 1 ? '' : 's'} available around your service area
        </Text>

        <View style={styles.locationPill}>
          <MapPin size={14} color={C.white} />
          <Text style={styles.locationPillText} numberOfLines={1}>
            {location} · within {radiusKm} km
          </Text>
        </View>

        {/* Feed summary — the three numbers that decide whether it's worth
            scrolling: what's out there, what's urgent, what it pays. All
            three describe the location-filtered feed below. */}
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Search size={15} color="rgba(255,255,255,0.75)" />
            <Text style={styles.summaryValue}>{summary?.open_count ?? '—'}</Text>
            <Text style={styles.summaryLabel}>Open</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <TriangleAlert size={15} color="#fca5a5" />
            <Text style={styles.summaryValue}>{summary?.urgent_count ?? '—'}</Text>
            <Text style={styles.summaryLabel}>Urgent</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Wallet size={15} color="rgba(255,255,255,0.75)" />
            <Text style={styles.summaryValue} numberOfLines={1}>
              {summary ? peso(summary.potential_payout) : '—'}
            </Text>
            <Text style={styles.summaryLabel}>Potential</Text>
          </View>
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

        {/* Incoming booking requests — a homeowner has hired this provider and
            is waiting for an answer. Accept/Decline are inline because the
            answer rarely needs the full job screen to decide. */}
        {bookingRequests.length > 0 && (
          <View style={styles.requestsBlock}>
            <View style={styles.requestsHeader}>
              <Inbox size={16} color={C.cyan700} />
              <Text style={styles.requestsTitle}>
                Booking Request{bookingRequests.length === 1 ? '' : 's'}
              </Text>
              <View style={styles.requestsCount}>
                <Text style={styles.requestsCountText}>{bookingRequests.length}</Text>
              </View>
            </View>

            {!!actionError && !decliningJob && (
              <Text style={styles.actionError}>{actionError}</Text>
            )}

            {bookingRequests.map((job) => {
              const busy = actingOn === job.id;
              return (
                <View key={job.id} style={styles.requestCard}>
                  <TouchableOpacity
                    onPress={() => onNavigate('Job Detail', job.id)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.requestTopRow}>
                      <Text style={styles.requestTitle} numberOfLines={1}>{job.title}</Text>
                      {job.budget != null && (
                        <Text style={styles.requestPrice}>{peso(job.budget)}</Text>
                      )}
                    </View>
                    <View style={styles.requestMetaRow}>
                      <MapPin size={13} color={C.ink400} />
                      <Text style={styles.requestMeta} numberOfLines={1}>{job.address}</Text>
                    </View>
                    <View style={styles.requestMetaRow}>
                      <CalendarDays size={13} color={C.ink400} />
                      <Text style={styles.requestMeta}>
                        {job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible schedule'}
                      </Text>
                      {job.urgency === 'urgent' && (
                        <Text style={styles.urgentInline}>Urgent</Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={[styles.declineBtn, busy && styles.btnBusy]}
                      onPress={() => setDecliningJob(job)}
                      activeOpacity={0.85}
                      disabled={busy}
                    >
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.acceptBtn, busy && styles.btnBusy]}
                      onPress={() => void acceptBooking(job)}
                      activeOpacity={0.85}
                      disabled={busy}
                    >
                      {busy ? (
                        <ActivityIndicator color={C.white} size="small" />
                      ) : (
                        <Text style={styles.acceptBtnText}>Accept</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
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
                      {!!distanceLabel(job.distance_km) && (
                        <Text style={styles.feedDistance}>· {distanceLabel(job.distance_km)}</Text>
                      )}
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

      <DeclineBookingModal
        visible={!!decliningJob}
        jobTitle={decliningJob?.title}
        submitting={!!decliningJob && actingOn === decliningJob.id}
        error={decliningJob ? actionError : null}
        onCancel={() => {
          setDecliningJob(null);
          setActionError(null);
        }}
        onConfirm={(reason) => void declineBooking(reason)}
      />
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
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarText: { color: C.white, fontWeight: '800', fontSize: 14.5, fontFamily: 'Inter' },

  feedSummary: { color: 'rgba(255,255,255,0.68)', fontSize: 12.5, fontFamily: 'Inter', marginTop: 12 },

  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginTop: 14, alignSelf: 'flex-start', maxWidth: '100%',
  },
  locationPillText: { color: C.white, fontSize: 12.5, fontFamily: 'Inter' },

  summaryStrip: {
    flexDirection: 'row', alignItems: 'center', marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14, paddingVertical: 11,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)' },
  summaryValue: { color: C.white, fontSize: 15.5, fontWeight: '800', fontFamily: 'Inter' },
  summaryLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'Inter' },

  requestsBlock: { marginBottom: 14 },
  requestsHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  requestsTitle: { color: C.ink900, fontSize: 14, fontWeight: '800', fontFamily: 'Inter' },
  requestsCount: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: C.cyan700, alignItems: 'center', justifyContent: 'center',
  },
  requestsCountText: { color: C.white, fontSize: 11.5, fontWeight: '800', fontFamily: 'Inter' },
  requestCard: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.cyan100,
    borderRadius: 16, padding: 15, marginBottom: 10,
  },
  requestTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  requestTitle: { flex: 1, color: C.ink900, fontSize: 15.5, fontWeight: '800', fontFamily: 'Inter' },
  requestPrice: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  requestMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  requestMeta: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter', flexShrink: 1 },
  requestActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  declineBtn: {
    flex: 1, borderWidth: 1, borderColor: '#ef4444', borderRadius: 12,
    paddingVertical: 11, alignItems: 'center',
  },
  declineBtnText: { color: '#ef4444', fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
  acceptBtn: {
    flex: 1, backgroundColor: C.cyan700, borderRadius: 12,
    paddingVertical: 11, alignItems: 'center', justifyContent: 'center',
  },
  acceptBtnText: { color: C.white, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
  btnBusy: { opacity: 0.6 },
  actionError: { color: '#ef4444', fontSize: 13, fontFamily: 'Inter', marginBottom: 8 },

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
  feedDistance: { fontSize: 12, color: C.ink400, fontFamily: 'Inter' },
  urgentInline: { color: '#b91c1c', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Inter' },
  normalInline: { fontSize: 11.5, fontWeight: '700', color: C.ink400, fontFamily: 'Inter' },
});
