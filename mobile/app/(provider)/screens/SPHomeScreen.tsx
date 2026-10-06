import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { useNotifications } from '../../../src/context/NotificationsContext';
/**
 * SPHomeScreen.tsx ("Feed" tab)
 *
 * Theme C (Figma "FINAL · Provider"): a flat navy header — deliberately
 * different from the homeowner side's sky blue so the two roles never look
 * alike — holding the availability switch and the Open / Urgent counts,
 * then search, urgency chips and the job cards.
 *
 * Jobs Done / Rating / Active live on the Profile screen, not here (QA: they
 * were shown twice). The availability switch sits in the header because it
 * decides whether this feed brings in work.
 * Urgency chips filter the feed. The mockup's "For You"/"All Jobs"
 * recommendation-score tabs are dropped — there's no match-scoring backend.
 *
 * Two things run down this screen, and they are not the same thing:
 *
 *   Confirmed bookings — jobs a client hired this provider for. Open the job
 *   details to start actual work; no second acceptance is required.
 *
 *   The job feed — open work nobody has been hired for yet. Filtered to the
 *   provider's service radius and ordered by the backend: urgent first, then
 *   nearest, then newest (jobs.service.ts `browse`). The summary strip above
 *   it counts what is in that filtered feed, not what exists platform-wide.
 */

import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Inbox,
  Navigation,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPScreen } from '../../../src/types/navigation';

import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { distanceLabel, shortDate } from '../../../src/lib/format';
import OwnAvatar from '../../../src/components/OwnAvatar';
import JobCard from '../../../src/components/JobCard';
import Tap from '../../../src/components/ui/Tap';
import Pulse from '../../../src/components/ui/Pulse';
import { haptic } from '../../../src/components/ui/motion';
import { useRetainedState } from '../../../src/hooks/useRetainedState';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';

const URGENCY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'normal', label: 'Normal' },
  { key: 'flexible', label: 'Flexible' },
] as const;
type UrgencyFilter = (typeof URGENCY_FILTERS)[number]['key'];

/** Feed radius when the provider has not set one on their profile. */
const DEFAULT_RADIUS_KM = 50;

interface SPHomeScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string) => void;
}

export default function SPHomeScreen({ onNavigate }: SPHomeScreenProps) {
  const { C, styles, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();
  const { profile, providerProfile, isVerified, refreshProfile } = useAuth();
  const radiusKm = providerProfile?.service_radius_km ?? DEFAULT_RADIUS_KM;

  // The "Verify to Apply" banner (below) reflects cached profile state, but
  // verification is approved async by a webhook while the app may be
  // backgrounded — without this it stays stale until the user happens to
  // revisit Verification or restart the app (QA P2.1).
  useRefreshOnForeground(() => void refreshProfile(), !isVerified);
  useEffect(() => {
    if (!isVerified) void refreshProfile();
    // Only on mount — refreshProfile itself is stable (useCallback([])), and
    // re-running this on every isVerified flip would refetch right after the
    // fetch that caused the flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const serviceKey = [providerProfile?.category_id, ...(providerProfile?.approved_secondary_services ?? []).map((service) => service.category_id).sort((a, b) => a - b)].join(':');
  const [urgency, setUrgency] = useRetainedState<UrgencyFilter>('sp.feed.urgency', 'all');
  const { data } = useAsyncData(async () => {
    const [feed, assigned] = await Promise.all([
      api.browseJobs({
        limit: 20,
        urgency: urgency === 'all' ? undefined : urgency,
        latitude: profile?.latitude ?? undefined,
        longitude: profile?.longitude ?? undefined,
        radius_km: radiusKm,
      }),
      api.assignedJobs(),
    ]);
    return { jobs: feed.jobs, summary: feed.summary, assigned };
  }, [profile?.latitude, profile?.longitude, radiusKm, urgency, serviceKey], `sp-home-${profile?.id}-${serviceKey}-${profile?.latitude}-${profile?.longitude}-${radiusKm}-${urgency}`);

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
  // Hired and waiting on this provider to answer — the top of the screen.
  const confirmedJobs = (data?.assigned ?? []).filter((j) => ['assigned', 'confirmed'].includes(j.status));
  const summary = data?.summary;
  const q = search.trim().toLowerCase();
  const availableJobs = (data?.jobs ?? []).filter(
    (job) =>
      (urgency === 'all' || job.urgency === urgency) &&
      (!q || job.title.toLowerCase().includes(q) || (job.service_categories?.name ?? '').toLowerCase().includes(q)),
  );
  const location = profile?.city || 'your location';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        style={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* The hero scrolls with the feed so small phones and large text
            sizes are not left with a thin strip of jobs under it. */}
        {/* Hero — flat navy, provider identity. */}
        <View style={[styles.hero, { paddingTop: headerTop }]}>
          <View style={styles.heroTopRow}>
            <View testID="hero-text" style={styles.heroText}>
              <Text
                style={styles.greeting}
                numberOfLines={1}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={1.3}
              >
                Hello, {name || 'there'}
              </Text>
              <Text style={styles.heroTitle}>Jobs near you</Text>
            </View>
            <View testID="hero-actions" style={styles.heroActions}>
              <View>
                <Tap
                  style={styles.iconBtn}
                  rippleColor={C.rippleOnHero}
                  accessibilityRole="button"
                  accessibilityLabel="Notifications"
                  onPress={() => onNavigate('Notifications')}
                >
                  <Bell size={21} color={C.onPrimary} strokeWidth={2.2} />
                </Tap>
                {unreadCount > 0 && (
                  <View pointerEvents="none" style={styles.notifBadge}>
                    <Text accessibilityLabel={`${unreadCount} unread notifications`} style={styles.notifBadgeText} maxFontSizeMultiplier={1.2}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              <Tap
                testID="btn-home-avatar"
                style={styles.avatarCircle}
                rippleColor={C.rippleOnHero}
                accessibilityRole="button"
                accessibilityLabel="Profile"
                onPress={() => onNavigate('Profile')}
              >
                <OwnAvatar name={name} textStyle={styles.avatarText} />
              </Tap>
            </View>
          </View>

          {/* Availability — decides whether new work is offered to this provider. */}
          <View style={styles.statusCard}>
            <View style={[styles.statusDot, { backgroundColor: available ? '#4ade80' : 'rgba(255,255,255,0.45)' }]} />
            <View style={styles.statusCopy}>
              <Text style={styles.statusText}>{available ? 'Available for jobs' : 'Not available'}</Text>
              <Text style={styles.statusHint} numberOfLines={3}>
                {available ? 'Clients can invite and hire you' : "You won't be invited to new jobs"} · within {radiusKm} km of {location}
              </Text>
            </View>
            <Switch
              value={available}
              onValueChange={() => { haptic.tick(); void toggleAvailability(); }}
              disabled={togglingAvail}
              trackColor={{ false: 'rgba(255,255,255,0.25)', true: '#22c55e' }}
              thumbColor={C.white}
              accessibilityLabel="Available for jobs"
              testID="toggle-availability"
            />
          </View>

          {/* Feed summary — what's out there and what's urgent, both counted
              from the location-filtered feed below. */}
          <View style={styles.summaryStrip}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{summary?.open_count ?? '—'}</Text>
              <View style={styles.summaryLabelRow}>
                <Search size={13} color={C.onHeroMuted} />
                <Text style={styles.summaryLabel}>Open</Text>
              </View>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{summary?.urgent_count ?? '—'}</Text>
              <View style={styles.summaryLabelRow}>
                <TriangleAlert size={13} color="#fca5a5" />
                <Text style={styles.summaryLabel}>Urgent</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.bodyContent}>
        {/* Verification banner */}
        {!isVerified && (
          <Tap
            style={styles.flowBanner}
            onPress={() => onNavigate('Verification')}
            accessibilityRole="button"
          >
            <View style={styles.flowIcon}>
              <ShieldCheck size={20} color={C.link} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.flowTitle}>Verification required to apply</Text>
              <Text style={styles.flowBody}>
                You can browse jobs now, but you must verify your identity before you can send proposals or be hired.
              </Text>
              <Text style={styles.flowAction}>Verify now</Text>
            </View>
            <ChevronRight size={20} color={C.ink400} style={{ alignSelf: 'center' }} />
          </Tap>
        )}

        {confirmedJobs.length > 0 && (
          <View style={styles.requestsBlock}>
            <View style={styles.requestsHeader}>
              <Inbox size={17} color={C.link} />
              <Text style={styles.requestsTitle}>Confirmed bookings</Text>
              <View style={styles.requestsCount}>
                <Text style={styles.requestsCountText}>{confirmedJobs.length}</Text>
              </View>
            </View>
            {confirmedJobs.map((job) => (
              <JobCard
                key={job.id}
                title={job.title}
                budget={job.budget}
                address={job.address}
                urgency={job.urgency}
                footer={[{ icon: <CalendarDays size={14} color={C.ink400} />,
                  text: job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible schedule' }]}
                onPress={() => onNavigate('Job Detail', job.id)}
              />
            ))}
          </View>
        )}

        {/* Search */}
        <View style={styles.scopeSearch}>
          <Search size={20} color={C.ink400} />
          <TextInput keyboardAppearance={appearance}
            style={styles.scopeSearchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search open jobs"
            placeholderTextColor={C.ink400}
            returnKeyType="search"
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {URGENCY_FILTERS.map((f) => {
            const active = urgency === f.key;
            return (
              <Tap
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setUrgency(f.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`feed-urgency-${f.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Tap>
            );
          })}
        </ScrollView>

        {data && (
          <Text style={styles.feedSummary}>
            {availableJobs.length} job{availableJobs.length === 1 ? '' : 's'} available around your service area
          </Text>
        )}

        {!data && (
          <Pulse>
            {[0, 1].map((i) => (
              <View key={i} style={styles.skeletonCard} accessibilityLabel="Loading jobs">
                <View style={[styles.skeletonLine, { width: i ? '55%' : '72%' }]} />
                <View style={[styles.skeletonLine, { width: '45%', height: 10 }]} />
                <View style={[styles.skeletonLine, { width: '30%', height: 22, borderRadius: 11 }]} />
              </View>
            ))}
          </Pulse>
        )}
        {data && availableJobs.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Search size={28} color={C.link} />
            </View>
            <Text style={styles.emptyTitle}>No matching jobs</Text>
            <Text style={styles.emptyText}>Adjust your search or urgency filter to see more opportunities.</Text>
          </View>
        )}

        {/* Feed — the same card clients see for their own jobs. */}
        {availableJobs.map((job) => (
          <JobCard
            key={job.id}
            title={job.title}
            budget={job.budget}
            address={job.address}
            urgency={job.urgency}
            pills={job.service_categories?.name
              ? [{ label: job.service_categories.name, color: C.ink700, bg: C.ink50 }]
              : []}
            footer={[
              {
                icon: <CalendarDays size={14} color={C.ink400} />,
                text: job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible schedule',
              },
              ...(distanceLabel(job.distance_km)
                ? [{ icon: <Navigation size={14} color={C.ink400} />, text: distanceLabel(job.distance_km) }]
                : []),
            ]}
            onPress={() => onNavigate('Job Detail', job.id)}
          />
        ))}

        <View style={{ height: 24 }} />
        </View>
      </ScrollView>
      {/* Keeps the status bar area navy once the hero has scrolled away. */}
      <View pointerEvents="none" style={[styles.statusStrip, { height: insets.top }]} />

    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    hero: {
      backgroundColor: C.providerHero,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 18,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    greeting: { color: C.onHeroMuted, fontSize: 15, fontFamily: 'Inter', fontWeight: '500', marginBottom: 2 },
    heroTitle: { color: C.onPrimary, fontSize: 24, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },
    // The greeting column yields to the actions, never the other way round: the
    // avatar is the only route to Profile (and Log out), so a long name must
    // truncate rather than push it off-screen.
    heroText: { flex: 1, minWidth: 0, marginRight: 12 },
    heroActions: { flexDirection: 'row', gap: 10, alignItems: 'center', flexShrink: 0 },
    iconBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.1)',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    notifBadge: {
      position: 'absolute', top: -3, right: -3,
      minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
      backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: C.providerHero,
    },
    notifBadgeText: { color: '#ffffff', fontSize: 10.5, fontWeight: '800', fontFamily: 'Inter' },
    avatarCircle: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: '#2b4a66',
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarText: { color: '#bae6fd', fontWeight: '800', fontSize: 15, fontFamily: 'Inter' },

    statusCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18,
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
      borderRadius: 18, paddingVertical: 12, paddingLeft: 16, paddingRight: 12,
    },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    statusCopy: { flex: 1, minWidth: 0 },
    statusText: { color: C.onPrimary, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
    statusHint: { color: C.onHeroMuted, fontSize: 13, fontFamily: 'Inter', marginTop: 1, lineHeight: 18 },

    summaryStrip: { flexDirection: 'row', gap: 10, marginTop: 10 },
    summaryItem: {
      flex: 1, gap: 2, paddingVertical: 12, paddingHorizontal: 14,
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
      borderRadius: 16,
    },
    summaryValue: { color: C.onPrimary, fontSize: 22, fontWeight: '800', fontFamily: 'Inter' },
    summaryLabel: { color: C.onHeroMuted, fontSize: 13, fontFamily: 'Inter', fontWeight: '600' },
    summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

    requestsBlock: { marginBottom: 10 },
    requestsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    requestsTitle: { color: C.ink900, fontSize: 17, fontWeight: '800', fontFamily: 'Inter' },
    requestsCount: {
      minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6,
      backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
    },
    requestsCountText: { color: C.onPrimary, fontSize: 12, fontWeight: '800', fontFamily: 'Inter' },
    body: { flex: 1 },
    statusStrip: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: C.providerHero },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 18, paddingBottom: 20 },

    flowBanner: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: C.primaryTonal, borderWidth: 1, borderColor: C.primaryTonalStrong,
      borderRadius: 18, padding: 14, marginBottom: 18, overflow: 'hidden',
    },
    flowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
    flowTitle: { fontSize: 15, color: C.ink900, fontWeight: '700', fontFamily: 'Inter' },
    flowBody: { fontSize: 13.5, lineHeight: 19, color: C.ink500, fontFamily: 'Inter', marginTop: 3 },
    flowAction: { color: C.link, fontSize: 14, fontWeight: '800', fontFamily: 'Inter', marginTop: 8 },

    chipRow: { gap: 8, paddingBottom: 16 },
    chip: {
      borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, borderRadius: 12,
      paddingHorizontal: 16, minHeight: 40, justifyContent: 'center', overflow: 'hidden',
    },
    chipActive: { backgroundColor: C.primaryTonalStrong, borderColor: C.primaryTonalStrong },
    chipText: { color: C.ink700, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    chipTextActive: { color: theme.appearance === 'dark' ? '#e0f2fe' : '#0c4a6e', fontWeight: '700' },

    scopeSearch: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: 999, paddingHorizontal: 16, minHeight: 52, marginBottom: 14,
    },
    scopeSearchInput: { flex: 1, fontSize: 15.5, color: C.ink900, fontFamily: 'Inter', paddingVertical: 12 },

    skeletonCard: {
      backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 12, gap: 12,
      borderWidth: 1, borderColor: C.line,
    },
    skeletonLine: { height: 14, borderRadius: 7, backgroundColor: C.skeleton },

    feedSummary: { color: C.ink500, fontSize: 13.5, fontFamily: 'Inter', marginBottom: 12 },
    emptyState: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 22 },
    emptyIcon: {
      width: 64, height: 64, borderRadius: 32, backgroundColor: C.primaryTonal,
      alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: { color: C.ink900, fontSize: 17, fontWeight: '700', fontFamily: 'Inter', marginTop: 14, marginBottom: 4 },
    emptyText: { color: C.ink500, fontSize: 14.5, fontFamily: 'Inter', textAlign: 'center', lineHeight: 20 },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
