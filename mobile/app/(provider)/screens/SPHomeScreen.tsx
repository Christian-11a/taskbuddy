import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { useNotifications } from '../../../src/context/NotificationsContext';
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
 * Jobs Done / Rating / Active live on the Profile screen, not here (QA: they
 * were shown twice). The availability switch stays, under its own "Your
 * status" heading, because it decides whether this feed brings in work.
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
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  CalendarDays,
  Inbox,
  MapPin,
  Navigation,
  Search,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { SPScreen } from '../../../src/types/navigation';

import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { distanceLabel, peso, shortDate } from '../../../src/lib/format';
import OwnAvatar from '../../../src/components/OwnAvatar';
import JobCard from '../../../src/components/JobCard';
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
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
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
  const { data, reload } = useAsyncData(async () => {
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
  const location = profile?.city || 'Set your location';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {/* Hero — matches .hero-clean.dark */}
      <LinearGradient
        colors={['#111827', '#18283b', '#0c4a6e']}
        locations={[0, 0.72, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={[styles.hero, { paddingTop: headerTop }]}
      >
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
            <Text style={styles.heroTitle}>Jobs Near You</Text>
          </View>
          <View testID="hero-actions" style={styles.heroActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => onNavigate('Notifications')}
              activeOpacity={0.8}
            >
              <Bell size={20} color={C.onPrimary} />
              {unreadCount > 0 && <Text accessibilityLabel={`${unreadCount} unread notifications`} style={{ color: C.onPrimary, fontSize: 10 }}>{unreadCount}</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              testID="btn-home-avatar"
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
          <MapPin size={14} color={C.onPrimary} />
          <Text style={styles.locationPillText} numberOfLines={1}>
            {location} · within {radiusKm} km
          </Text>
        </View>

        {/* Feed summary — the three numbers that decide whether it's worth
            scrolling: what's out there, what's urgent, what it pays. All
            three describe the location-filtered feed below. */}
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <View style={styles.summaryLabelRow}>
              <Search size={14} color="rgba(255,255,255,0.75)" />
              <Text style={styles.summaryLabel}>Open</Text>
            </View>
            <Text style={styles.summaryValue}>{summary?.open_count ?? '—'}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <View style={styles.summaryLabelRow}>
              <TriangleAlert size={14} color="#fca5a5" />
              <Text style={styles.summaryLabel}>Urgent</Text>
            </View>
            <Text style={styles.summaryValue}>{summary?.urgent_count ?? '—'}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <View style={styles.summaryLabelRow}>
              <Wallet size={14} color="rgba(255,255,255,0.75)" />
              <Text style={styles.summaryLabel}>Potential</Text>
            </View>
            <Text style={styles.summaryValue} numberOfLines={1}>
              {summary ? peso(summary.potential_payout) : '—'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
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
              <ShieldCheck size={19} color={V6Colors.link} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.flowTitle}>Verification required to apply</Text>
              <Text style={styles.flowBody}>
                You can browse jobs now, but you must verify your identity before you can send proposals or be hired.
              </Text>
            </View>
            <Text style={styles.flowAction}>Verify now</Text>
          </TouchableOpacity>
        )}

        {confirmedJobs.length > 0 && (
          <View style={styles.requestsBlock}>
            <View style={styles.requestsHeader}>
              <Inbox size={16} color={V6Colors.link} />
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
                footer={[{ icon: <CalendarDays size={13} color={C.ink400} />,
                  text: job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible schedule' }]}
                onPress={() => onNavigate('Job Detail', job.id)}
              />
            ))}
          </View>
        )}

        {/* Availability — decides whether new work is offered to this provider. */}
        <Text style={styles.sectionHeading}>Your status</Text>
        <View style={styles.statusBar}>
          <View style={[styles.statusDot, { backgroundColor: available ? '#22c55e' : C.ink300 }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusText}>{available ? 'Available for jobs' : 'Not available'}</Text>
            <Text style={styles.statusHint}>
              {available ? 'Clients can invite and hire you.' : "You won't be invited to new jobs."}
            </Text>
          </View>
          <Switch
            value={available}
            onValueChange={() => void toggleAvailability()}
            disabled={togglingAvail}
            trackColor={{ false: C.ink100, true: C.cyan600 }}
            thumbColor={C.white}
            accessibilityLabel="Available for jobs"
            testID="toggle-availability"
          />
        </View>

        <Text style={styles.sectionHeading}>Jobs near you</Text>
        {/* Search — matches .scope-search */}
        <View style={styles.scopeSearch}>
          <Search size={19} color={C.ink400} />
          <TextInput keyboardAppearance={appearance}
            style={styles.scopeSearchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search open jobs"
            placeholderTextColor={C.ink400}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {URGENCY_FILTERS.map((f) => {
            const active = urgency === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setUrgency(f.key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`feed-urgency-${f.key}`}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {!data && <ActivityIndicator style={{ marginTop: 20 }} color={V6Colors.link} />}
        {data && availableJobs.length === 0 && (
          <View style={styles.emptyState}>
            <Search size={30} color={C.ink300} />
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
                icon: <CalendarDays size={13} color={C.ink400} />,
                text: job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible schedule',
              },
              ...(distanceLabel(job.distance_km)
                ? [{ icon: <Navigation size={13} color={C.ink400} />, text: distanceLabel(job.distance_km) }]
                : []),
            ]}
            onPress={() => onNavigate('Job Detail', job.id)}
          />
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>

    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    hero: {
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 18,
      borderBottomLeftRadius: 26,
      borderBottomRightRadius: 26,
    },
    heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
    greeting: { color: C.ink400, fontSize: 13, fontFamily: 'Inter', marginBottom: 3 },
    heroTitle: { color: C.onPrimary, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
    // The greeting column yields to the actions, never the other way round: the
    // avatar is the only route to Profile (and Log out), so a long name must
    // truncate rather than push it off-screen.
    heroText: { flex: 1, minWidth: 0, marginRight: 12 },
    heroActions: { flexDirection: 'row', gap: 8, alignItems: 'center', flexShrink: 0 },
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
    avatarText: { color: C.onPrimary, fontWeight: '800', fontSize: 14.5, fontFamily: 'Inter' },

    feedSummary: { color: 'rgba(255,255,255,0.68)', fontSize: 12.5, fontFamily: 'Inter', marginTop: 12 },

    locationPill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
      borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, marginTop: 14, alignSelf: 'flex-start', maxWidth: '100%',
    },
    locationPillText: { color: C.onPrimary, fontSize: 12.5, fontFamily: 'Inter' },

    summaryStrip: {
      flexDirection: 'row', alignItems: 'center', marginTop: 14,
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
      borderRadius: 14, paddingVertical: 11,
    },
    summaryItem: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
    summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.12)' },
    summaryValue: { color: C.onPrimary, fontSize: 15.5, fontWeight: '800', fontFamily: 'Inter' },
    summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11.5, fontFamily: 'Inter', fontWeight: '600' },
    summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },

    requestsBlock: { marginBottom: 14 },
    requestsHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
    requestsTitle: { color: C.ink900, fontSize: 14, fontWeight: '800', fontFamily: 'Inter' },
    requestsCount: {
      minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
      backgroundColor: C.cyan700, alignItems: 'center', justifyContent: 'center',
    },
    requestsCountText: { color: C.onPrimary, fontSize: 11.5, fontWeight: '800', fontFamily: 'Inter' },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    flowBanner: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: V6Colors.infoSurface, borderWidth: 1, borderColor: C.cyan100,
      borderRadius: 16, padding: 14, marginBottom: 14,
    },
    flowIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: C.cyan50, alignItems: 'center', justifyContent: 'center' },
    flowTitle: { fontSize: 13.5, color: C.ink900, fontWeight: '700', fontFamily: 'Inter' },
    flowBody: { fontSize: 12, lineHeight: 16, color: C.ink500, fontFamily: 'Inter', marginTop: 3 },
    flowAction: { color: V6Colors.link, fontSize: 12.5, fontWeight: '800', fontFamily: 'Inter', alignSelf: 'center' },

    statusBar: {
      flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 14, marginBottom: 14,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { color: C.ink700, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    statusHint: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter', marginTop: 1 },
    sectionHeading: { color: C.ink400, fontSize: 12.5, fontWeight: '800', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
    chipRow: { gap: 8, paddingBottom: 12 },
    chip: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
    chipActive: { backgroundColor: C.cyan700, borderColor: C.cyan700 },
    chipText: { color: C.ink700, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },
    chipTextActive: { color: C.onPrimary },

    scopeSearch: {
      flexDirection: 'row', alignItems: 'center', gap: 9,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 16,
    },
    scopeSearchInput: { flex: 1, fontSize: 14.5, color: C.ink900, fontFamily: 'Inter', padding: 0 },

    emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 22 },
    emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
    emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

    urgentInline: { color: V6Colors.dangerText, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
