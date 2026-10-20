import { useTheme, useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { useNotifications } from '../../../src/context/NotificationsContext';
/**
 * SPHomeScreen.tsx ("Feed" tab)
 *
 * Figma "Feed · verified" (79:2375): the header on the canvas (avatar, Hello and
 * the name, bell), the next booking as a navy hero card, the availability switch,
 * search, urgency pills, and the open jobs as rows.
 *
 * A provider sees the setup list above the feed until every step is done (address,
 * bio, verification, payout account). Until verified that is all they see (Figma
 * "Feed · new provider", 79:2514): a progress hero, the checklist, and where jobs
 * will show up once they are approved. Once verified, the feed follows the list.
 *
 * Two things run down this screen, and they are not the same thing:
 *
 *   Bookings: jobs a client hired this provider for. The hero shows the one to
 *   start next; the rest are listed under My Work. No second acceptance is needed.
 *
 *   The job feed: open work nobody has been hired for yet. It is filtered to the
 *   provider's service radius and ordered by the backend: urgent first, then
 *   nearest, then newest (jobs.service.ts `browse`).
 */

import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ArrowRight,
  Bell,
  Check,
  Compass,
  Inbox,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPScreen, type VerifyParams } from '../../../src/types/navigation';
import { certificateExpiry, reconcileVerification, type ExpiryState } from '../../../src/lib/verificationStatus';
import { certificateStateFrom } from '../../../src/lib/tourContent';
import { dateKey } from '../../../src/lib/localDate';

import { useAuth } from '../../../src/context/AuthContext';
import { useTourAnchor, type TourAnchor } from '../../../src/components/tour';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, type CertificateState, type Job } from '../../../src/lib/api';
import { isFeed, isList } from '../../../src/lib/savedShapes';
import { peso } from '../../../src/lib/format';
import {
  appliedJobIds,
  feedFilterCounts,
  feedRowMeta,
  pickProviderHero,
  type FeedUrgency,
  type ProviderHero,
} from '../../../src/lib/providerFeed';
import {
  nextSetupStep,
  providerSetupSteps,
  setupProgress,
  type SetupStep,
  type VerifyState,
} from '../../../src/lib/providerSetup';
import OwnAvatar from '../../../src/components/OwnAvatar';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView, { useRevealOnFocus } from '../../../src/components/ui/KeyboardAwareScrollView';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import { showToast } from '../../../src/components/Toast';
import { MIN_TOUCH_DP } from '../../../src/components/ui/touchTarget';
import FilterPill from '../../../src/components/ui/FilterPill';
import SectionHeader from '../../../src/components/ui/SectionHeader';
import JobRow from '../../../src/components/ui/JobRow';
import StaleHint from '../../../src/components/ui/StaleHint';
import SlowLoadNote from '../../../src/components/ui/SlowLoadNote';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import { haptic } from '../../../src/components/ui/motion';
import { useRetainedState } from '../../../src/hooks/useRetainedState';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';
import { useSlowLoad } from '../../../src/hooks/useSlowLoad';
import { SEARCH_MAX_LENGTH } from '../../../src/lib/textRules';

const URGENCY_FILTERS: { key: FeedUrgency; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'normal', label: 'Normal' },
  { key: 'flexible', label: 'Flexible' },
];

/** Feed radius when the provider has not set one on their profile. */
const DEFAULT_RADIUS_KM = 50;

/** Jobs per feed page. */
const FEED_PAGE = 20;

/** The unverified hero's title and body: Figma's copy, or today's copy for a request already in review. */
const VERIFY_HERO: Record<VerifyState, { title: string; body: string }> = {
  none: {
    title: 'Get verified to see jobs near you',
    body: 'Clients only see verified providers. It takes about 5 minutes.',
  },
  pending: {
    title: 'Verification under review',
    body: "An admin is checking your documents. You'll see jobs once you're approved.",
  },
  rejected: {
    title: 'Verification not approved',
    body: 'Your documents were not accepted. Upload new photos to try again.',
  },
};

interface SPHomeScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string, params?: VerifyParams) => void;
  /** Shows the one-time "take a quick tour" card at the top of Home, when the App is offering it. */
  tourOffer?: { onStart: () => void; onDismiss: () => void };
}

/** The certificate that needs attention most: an expired one, else the one closest to expiring. */
function worstExpiry(states: ExpiryState[]): ExpiryState | null {
  const bad = states.filter((s) => s.state !== 'ok');
  if (bad.length === 0) return null;
  return bad.find((s) => s.state === 'expired') ?? bad.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];
}

function expiryLine(expiry: ExpiryState, serviceName: string | null): string {
  const what = serviceName ? `Your ${serviceName} certificate` : 'Your certificate';
  if (expiry.state === 'expired') return `${what} has expired. Upload a renewal to keep sending proposals.`;
  const days = expiry.daysLeft ?? 0;
  return `${what} expires ${days === 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`}.`;
}

/** "Wed, Oct 15 · 12:22 AM · Arturo Tanco Drive, Lipa"; without a date, "No date yet · address". */
function heroLine(job: Job, when: Date | null): string {
  const parts = when
    ? [
        when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      ]
    : ['No date yet'];
  return [...parts, job.address].filter(Boolean).join(' · ');
}

/** The verified provider's hero when the payout account is the only step left. */
const PAYOUT_LEFT_HERO = {
  title: 'Almost there',
  body: 'Link a payout account to send proposals.',
};

/** The verified provider's hero when a profile step other than the payout account is still open. */
const PROFILE_LEFT_HERO = {
  title: 'Finish your profile',
  body: 'Add the rest of your details so clients can find you.',
};

/**
 * The setup list, shown above the feed until every step is done: the hero (one
 * segment per step), the checklist with its next-step button, and, for a provider
 * who is not verified yet, the note on where jobs will appear.
 */
function SetupPanel({ steps, verifyState, verified, categoryName, onStep, setupTour }: {
  steps: SetupStep[];
  verifyState: VerifyState;
  verified: boolean;
  categoryName: string | null;
  onStep: (step: SetupStep) => void;
  setupTour: TourAnchor;
}) {
  const { Colors, styles } = useThemedStyles(createThemedStyles);
  const { done, total } = setupProgress(steps);
  const next = nextSetupStep(steps);
  const open = steps.filter((step) => !step.done);
  const copy = !verified
    ? VERIFY_HERO[verifyState]
    : open.length === 1 && open[0].id === 'payout' ? PAYOUT_LEFT_HERO : PROFILE_LEFT_HERO;
  return (
    <>
      <View testID="setup-hero" {...setupTour} style={styles.heroCard}>
        <View style={styles.heroChip}>
          <Text style={styles.heroChipText}>{`Finish setting up · ${done} of ${total}`}</Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={3}>{copy.title}</Text>
        <Text style={styles.heroLine} numberOfLines={3}>{copy.body}</Text>
        {/* Each segment is keyed on done and each badge on its state, so a step that finishes is recreated rather than repainted in place (see FilterPill). */}
        <View style={styles.progressRow} accessible accessibilityLabel={`Setup progress, ${done} of ${total} steps done`}>
          {steps.map((step) => (
            <View key={`${step.id}:${step.done ? 'done' : 'todo'}`} testID={`setup-segment-${step.id}`} style={[styles.progressSegment, step.done && styles.progressSegmentDone]} />
          ))}
        </View>
      </View>

      <View testID="setup-checklist" style={styles.checklist}>
        {steps.map((step, index) => {
          const stateWord = step.done ? 'done' : step.state === 'next' ? 'next' : 'later';
          return (
            <View
              key={step.id}
              style={styles.stepRow}
              accessible
              accessibilityLabel={`${index + 1}. ${step.title}. ${step.subtitle}. ${stateWord}`}
            >
              <View key={`${step.id}:${step.state}`} testID={`setup-badge-${step.id}`} style={[
                styles.stepBadge,
                step.done ? styles.stepBadgeDone : step.state === 'next' ? styles.stepBadgeNext : styles.stepBadgeLater,
              ]}>
                {step.done ? (
                  <Check size={16} color={Colors.successText} strokeWidth={2.6} />
                ) : (
                  <Text style={[styles.stepNumber, step.state === 'next' ? styles.stepNumberNext : styles.stepNumberLater]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <View style={styles.stepCopy}>
                <Text
                  key={`${step.id}:${step.state}`}
                  style={[
                    styles.stepTitle,
                    step.state === 'next' && styles.stepTitleNext,
                    step.state === 'locked' && styles.stepTitleLater,
                  ]}
                  numberOfLines={1}
                >
                  {step.title}
                </Text>
                <Text style={styles.stepSubtitle} numberOfLines={2}>{step.subtitle}</Text>
              </View>
            </View>
          );
        })}
        {next && (
          <Tap
            style={styles.setupButton}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={next.actionLabel}
            onPress={() => onStep(next)}
          >
            <Text style={styles.setupButtonText}>{next.actionLabel}</Text>
            <ArrowRight size={16} color={Colors.onPrimary} strokeWidth={2.4} />
          </Tap>
        )}
      </View>

      {!verified && (
        <>
          <SectionHeader title="Jobs near you" />
          <EmptyCard>
            <EmptyRow
              icon={ShieldCheck}
              title="Jobs show up after verification"
              body={`We'll notify you as soon as you're approved.${categoryName ? ` Then nearby ${categoryName} jobs appear here.` : ''}`}
            />
          </EmptyCard>
        </>
      )}
    </>
  );
}

/**
 * The feed search box. It renders inside the KeyboardAwareScrollView, and the reveal
 * hook reads that view from context, so the hook is called here, not in the screen.
 */
function FeedSearchInput({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  const { C, styles, appearance } = useThemedStyles(createThemedStyles);
  const inputRef = useRef<TextInput>(null);
  const revealField = useRevealOnFocus(inputRef);
  return (
    <TextInput keyboardAppearance={appearance}
      ref={inputRef}
      style={styles.searchInput}
      value={value}
      onChangeText={onChangeText}
      onFocus={revealField}
      placeholder="Search open jobs"
      placeholderTextColor={C.ink400}
      maxLength={SEARCH_MAX_LENGTH}
      returnKeyType="search"
    />
  );
}

export default function SPHomeScreen({ onNavigate, tourOffer }: SPHomeScreenProps) {
  const { Colors, C, styles } = useThemedStyles(createThemedStyles);
  const { dark } = useTheme();
  const headerTop = useHeaderTop();
  const statusInset = useSafeAreaInsets().top;
  const { unreadCount } = useNotifications();
  const { profile, providerProfile, isVerified, refreshProfile } = useAuth();
  // The welcome tour points at the availability row and the feed search. Both are on screen only once verified,
  // so until then they are not registered and their tour steps are passed over at once.
  const availabilityTour = useTourAnchor('home.availability', isVerified);
  const feedTour = useTourAnchor('home.feed', isVerified);
  const radiusKm = providerProfile?.service_radius_km ?? DEFAULT_RADIUS_KM;

  // Verification is approved async by a webhook while the app may be
  // backgrounded, so the setup panel re-reads the request on foreground (QA P2.1).
  // Where an unverified provider's request stands: "under review" or "not approved"
  // changes the setup copy instead of asking them to verify again.
  // The two-part state (ID + certificate) is read for a verified provider too: the setup card and the renewal banner use it.
  const { data: rawVerification, reload: reloadVerification } = useAsyncData(async () => {
    // Not caught: a failed lookup must not be kept under the key Verification shares. It reads as "none".
    return api.myVerification();
  }, [], 'verification-me');
  const verification = useMemo(() => reconcileVerification(rawVerification, { verified: isVerified, identityVerified: providerProfile?.identity_verified === true }), [rawVerification, isVerified, providerProfile]);
  // The provider's certificates: the setup card's certificate step (old API) and the renewal banner.
  const { data: credentials, reload: reloadCredentials } = useAsyncData(async () => {
    return api.myCredentials();
  }, [], 'sp-credentials-home');
  useRefreshOnForeground(() => { void refreshProfile(); reloadVerification(); reloadCredentials(); }, true);
  // Whether a payout account is linked; proposals are refused without one. A failed lookup is "unknown"
  // (null), which shows nothing rather than nagging. Read again when the app returns to the foreground.
  const { data: payoutLink, reload: reloadPayout } = useAsyncData<{ linked: boolean } | null>(async () => {
    // Not caught: a failed lookup stays "unknown" and is not kept under the key Job Detail shares.
    return { linked: !!(await api.payoutAccount()) };
  }, [], 'sp-payout-linked');
  useRefreshOnForeground(reloadPayout, true);
  const payoutLinked = payoutLink ? payoutLink.linked : null;
  const idState = verification?.identity ?? verification?.status;
  const verifyState: VerifyState = idState === 'pending' ? 'pending' : idState === 'rejected' ? 'rejected' : 'none';
  useEffect(() => {
    if (!isVerified) void refreshProfile();
    // Only on mount — refreshProfile itself is stable (useCallback([])), and
    // re-running this on every isVerified flip would refetch right after the
    // fetch that caused the flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const serviceKey = [providerProfile?.category_id, ...(providerProfile?.approved_secondary_services ?? []).map((service) => service.category_id).sort((a, b) => a - b)].join(':');
  const [urgency, setUrgency] = useRetainedState<FeedUrgency>('sp.feed.urgency', 'all');
  const { data, reload: reloadFeed, error: feedError, loading: feedLoading, stale: feedStale, refreshing: feedFetching } = useAsyncData(async () => {
    const [feed, assigned] = await Promise.all([
      api.browseJobs({
        limit: FEED_PAGE,
        urgency: urgency === 'all' ? undefined : urgency,
        latitude: profile?.latitude ?? undefined,
        longitude: profile?.longitude ?? undefined,
        radius_km: radiusKm,
      }),
      api.assignedJobs(),
    ]);
    // `loaded` is the urgency the server filtered by, which the pill counts need.
    return { jobs: feed.jobs, summary: feed.summary, assigned, loaded: urgency };
  }, [profile?.latitude, profile?.longitude, radiusKm, urgency, serviceKey], `sp-feed-${profile?.id}-${serviceKey}-${profile?.latitude}-${profile?.longitude}-${radiusKm}-${urgency}`, { persist: true, validate: isFeed });

  // "Load more": further pages of the same feed, appended under the first. Reset whenever the feed is fetched again.
  const [more, setMore] = useState<{ jobs: Job[]; done: boolean }>({ jobs: [], done: false });
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setMore({ jobs: [], done: false });
  }, [data]);
  const loadMore = async () => {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.browseJobs({
        limit: FEED_PAGE,
        offset: data.jobs.length + more.jobs.length,
        urgency: urgency === 'all' ? undefined : urgency,
        latitude: profile?.latitude ?? undefined,
        longitude: profile?.longitude ?? undefined,
        radius_km: radiusKm,
      });
      const seen = new Set([...data.jobs, ...more.jobs].map((job) => job.id));
      const fresh = page.jobs.filter((job) => !seen.has(job.id));
      setMore((m) => ({ jobs: [...m.jobs, ...fresh], done: page.jobs.length < FEED_PAGE }));
    } catch {
      showToast("Couldn't load more jobs. Try again.", 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const feedSlow = useSlowLoad(feedLoading, data !== null);

  // Open work changes on the server while the app is away, and nothing else asks for it again until the
  // tab is opened, so the feed is fetched again on a pull down and when the app comes back to the foreground.
  useRefreshOnForeground(reloadFeed, isVerified);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  useEffect(() => {
    setFeedRefreshing(false);
  }, [data, feedError]);
  const refreshFeed = () => {
    setFeedRefreshing(true);
    reloadFeed();
  };

  // Pending applications only label feed rows "Applied · waiting". The feed
  // never waits for this lookup, and a failed one leaves every row unlabelled.
  const { data: applications } = useAsyncData(async () => api.myApplications(), [], 'sp-applications', { persist: true, validate: isList });
  const applied = appliedJobIds(applications);

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
      // Update the cached profile, or the feed re-reads the old value when it remounts. The save already succeeded,
      // so a failed refresh changes nothing.
      refreshProfile().catch(() => {});
    } catch {
      setAvailable(!next); // revert on failure
      showToast("Couldn't update your availability. Check your connection and try again.", 'error');
    } finally {
      setTogglingAvail(false);
    }
  };

  const name = profile?.full_name ?? '';
  // The certificate step: the new field when the API has it; otherwise the credentials list; otherwise unknown.
  const certificate: CertificateState | 'unknown' = verification?.certificate
    ?? (Array.isArray(credentials) ? certificateStateFrom(credentials) : 'unknown');
  const setupSteps = providerSetupSteps(profile, providerProfile, verifyState, payoutLinked, {
    certificate,
    identityApproved: verification?.identity !== undefined ? verification.identity === 'approved' : undefined,
  });
  // The setup list stays up until every step is done. A payout lookup still running (null) does not hold it open.
  const setupComplete = setupSteps.every((step) => step.done || (step.id === 'payout' && payoutLinked === null));
  const setupTour = useTourAnchor('home.setup', !setupComplete);
  const expiring = Array.isArray(credentials) ? worstExpiry(certificateExpiry(credentials, dateKey(new Date()))) : null;
  const expiringName = expiring
    ? (credentials ?? []).find((c) => c.category_id === expiring.categoryId)?.service_categories?.name ?? null
    : null;
  const openCertificate = (categoryId?: number) =>
    onNavigate('Verification', undefined, { startAt: 'certificate', categoryId: categoryId ?? providerProfile?.category_id });
  // The hero waits for the feed's load, so "Find your next job" is never shown before the bookings are known.
  const hero = data ? pickProviderHero(data.assigned, new Date()) : null;
  const feedRef = useRef<ScrollView>(null);
  const bodyTop = useRef(0);
  const searchTop = useRef(0);
  // "Find jobs" scrolls down to the feed, which starts at the search box.
  const findJobs = () => {
    feedRef.current?.scrollTo({ y: Math.max(0, bodyTop.current + searchTop.current - 12), animated: true });
  };
  const q = search.trim().toLowerCase();
  const availableJobs = [...(data?.jobs ?? []), ...more.jobs].filter(
    (job) =>
      (urgency === 'all' || job.urgency === urgency) &&
      (!q || job.title.toLowerCase().includes(q) || (job.service_categories?.name ?? '').toLowerCase().includes(q)),
  );
  const filtersActive = urgency !== 'all' || q !== '';
  const canLoadMore = !!data && !more.done && data.jobs.length >= FEED_PAGE;
  const clearFilters = () => {
    setSearch('');
    setUrgency('all');
  };
  const counts: Partial<Record<FeedUrgency, number>> = data ? feedFilterCounts(data.loaded, data.summary, data.jobs) : {};

  return (
    <View style={styles.screen}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <KeyboardAwareScrollView ref={feedRef} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        style={styles.body}
        showsVerticalScrollIndicator={false}
        testID="feed-scroll"
        refreshControl={isVerified ? (
          <RefreshControl refreshing={feedRefreshing} onRefresh={refreshFeed} tintColor={Colors.primary} colors={[Colors.primary]} />
        ) : undefined}
      >
        {/* Header on the canvas: the avatar opens Profile, the bell opens Notifications. */}
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={styles.headerRow}>
            <Tap
              testID="btn-home-avatar"
              style={styles.avatar}
              hitSlop={(MIN_TOUCH_DP - 40) / 2}
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => onNavigate('Profile')}
            >
              <OwnAvatar name={name} textStyle={styles.avatarText} />
            </Tap>
            {/* The name column yields first: "Hello" stays on one line and a long name wraps to two before it truncates, and the actions keep their size. */}
            <View testID="hero-text" style={styles.greetingColumn}>
              <Text style={styles.greeting} numberOfLines={2} ellipsizeMode="tail" maxFontSizeMultiplier={1.3}>Hello</Text>
              <Text
                style={styles.userName}
                numberOfLines={2}
                ellipsizeMode="tail"
                maxFontSizeMultiplier={1.3}
              >
                {name || 'there'}
              </Text>
            </View>
            <View testID="hero-actions" style={styles.headerActions}>
              <View>
                <Tap
                  style={styles.bell}
                  hitSlop={(MIN_TOUCH_DP - 44) / 2}
                  accessibilityRole="button"
                  accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                  onPress={() => onNavigate('Notifications')}
                >
                  <Bell size={20} color={C.ink900} strokeWidth={2.2} />
                </Tap>
                {unreadCount > 0 && (
                  <View pointerEvents="none" style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText} maxFontSizeMultiplier={1.2}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.bodyContent} onLayout={(e) => { bodyTop.current = e.nativeEvent.layout.y; }}>
          {tourOffer && (
            <View testID="tour-offer" style={styles.tourBanner}>
              <Compass size={18} color={Colors.primaryDeep} strokeWidth={2.2} />
              <Text style={styles.tourText} numberOfLines={1}>New here? Take a 1-minute tour</Text>
              <Tap
                testID="tour-offer-start"
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Take the tour"
                onPress={tourOffer.onStart}
              >
                <Text style={styles.tourStart}>Start</Text>
              </Tap>
              <Tap
                testID="tour-offer-dismiss"
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Dismiss the tour offer"
                style={styles.tourClose}
                onPress={tourOffer.onDismiss}
              >
                <X size={16} color={C.ink700} strokeWidth={2.2} />
              </Tap>
            </View>
          )}
          {!setupComplete && (
            <SetupPanel
              steps={setupSteps}
              verifyState={verifyState}
              verified={isVerified}
              categoryName={providerProfile?.service_categories?.name ?? null}
              onStep={(step) => (step.opensCertificate ? openCertificate() : onNavigate(step.id === 'verify' ? 'Verification' : step.id === 'payout' ? 'Payout Account' : 'Edit Profile'))}
              setupTour={setupTour}
            />
          )}
          {isVerified && (
            <>
              {expiring && (
                <View
                  testID="certificate-expiry-banner"
                  style={[styles.expiryCard, expiring.state === 'expired' ? styles.expiryExpired : styles.expirySoon]}
                >
                  <Text style={[styles.expiryText, expiring.state === 'expired' ? styles.expiryTextExpired : styles.expiryTextSoon]}>
                    {expiryLine(expiring, expiringName)}
                  </Text>
                  <Tap
                    style={styles.setupButton}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel="Upload renewal"
                    onPress={() => openCertificate(expiring.categoryId)}
                  >
                    <Text style={styles.setupButtonText}>Upload renewal</Text>
                    <ArrowRight size={16} color={Colors.onPrimary} strokeWidth={2.4} />
                  </Tap>
                </View>
              )}
              {/* The hero: the next booking (the hired job to start, or the soonest one still ahead), a job in progress, or an invitation to find work. */}
              {hero && (
                <View testID="feed-hero" style={styles.heroCard}>
                  <View style={styles.heroChip}>
                    <Text style={styles.heroChipText}>
                      {hero.kind === 'booking' ? 'Next booking' : hero.kind === 'working' ? 'In progress' : 'No booking yet'}
                    </Text>
                  </View>
                  <Text style={styles.heroTitle} numberOfLines={2}>
                    {hero.kind === 'none' ? 'Find your next job' : hero.job.title}
                  </Text>
                  <Text style={styles.heroLine} numberOfLines={2}>
                    {hero.kind === 'none' ? 'Browse open jobs near you.' : heroLine(hero.job, hero.when)}
                  </Text>
                  <View style={styles.heroFooter}>
                    {hero.kind === 'booking' && hero.moreThisWeek > 0 && (
                      <Text style={styles.heroMore} numberOfLines={1}>{`+${hero.moreThisWeek} more this week`}</Text>
                    )}
                    {hero.kind === 'none' ? (
                      <Tap
                        style={styles.heroButton}
                        hitSlop={5}
                        accessibilityRole="button"
                        accessibilityLabel="Find jobs"
                        onPress={findJobs}
                      >
                        <Text style={styles.heroButtonText}>Find jobs</Text>
                        <ArrowRight size={16} color={Colors.primary} strokeWidth={2.4} />
                      </Tap>
                    ) : (
                      <Tap
                        style={styles.heroButton}
                        hitSlop={5}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${hero.job.title}`}
                        onPress={() => onNavigate('Job Detail', hero.job.id)}
                      >
                        <Text style={styles.heroButtonText}>Open</Text>
                        <ArrowRight size={16} color={Colors.primary} strokeWidth={2.4} />
                      </Tap>
                    )}
                  </View>
                </View>
              )}

              {/* Availability: decides whether new work is offered to this provider. The whole row is the switch. */}
              <Tap
                testID="home-availability"
                {...availabilityTour}
                style={styles.availability}
                onPress={() => { haptic.tick(); void toggleAvailability(); }}
                disabled={togglingAvail}
                accessibilityRole="switch"
                accessibilityLabel="Available for jobs"
                accessibilityHint={available ? `Clients within ${radiusKm} km can invite you` : "You won't be invited to new jobs"}
                accessibilityState={{ checked: available, disabled: togglingAvail }}
              >
                <View key={available ? 'on' : 'off'} testID="availability-dot" accessible={false} style={[styles.availabilityDot, { backgroundColor: available ? Colors.successText : C.ink400 }]} />
                <View style={styles.availabilityCopy}>
                  <Text style={styles.availabilityTitle}>{available ? 'Available for jobs' : 'Not available'}</Text>
                  <Text style={styles.availabilityHint} numberOfLines={2}>
                    {available ? `Clients within ${radiusKm} km can invite you` : "You won't be invited to new jobs"}
                  </Text>
                </View>
                {/* The switch only shows the state. The row takes the press, so the switch never takes it or gets its own focus. */}
                <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Switch
                    value={available}
                    onValueChange={() => { haptic.tick(); void toggleAvailability(); }}
                    disabled={togglingAvail}
                    trackColor={{ false: C.ink200, true: Colors.successSolid }}
                    thumbColor={C.white}
                    accessibilityLabel="Available for jobs"
                    testID="toggle-availability"
                  />
                </View>
              </Tap>

              <View testID="feed-section" onLayout={(e) => { searchTop.current = e.nativeEvent.layout.y; }}>
                <View testID="feed-search" {...feedTour} style={styles.search}>
                  <Search size={20} color={C.ink400} />
                  <FeedSearchInput value={search} onChangeText={setSearch} />
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll} contentContainerStyle={styles.pillRow}>
                {URGENCY_FILTERS.map((f) => (
                  <FilterPill
                    key={f.key}
                    label={f.label}
                    count={counts[f.key]}
                    selected={urgency === f.key}
                    onPress={() => setUrgency(f.key)}
                  />
                ))}
              </ScrollView>

              <SectionHeader title="Open jobs near you" count={data ? availableJobs.length : undefined} />

              {feedSlow && <SlowLoadNote />}
              {!data && !feedError && <ContentSkeleton variant="list" />}

              {!!feedError && !data && (
                <LoadErrorCard title="Couldn't load open jobs" message={feedError} onRetry={reloadFeed} />
              )}
              <StaleHint
                stale={feedStale}
                refreshing={feedFetching}
                error={feedError}
                onRetry={reloadFeed}
              />

              {data && availableJobs.length === 0 && (
                <EmptyCard>
                  <EmptyRow
                    icon={Inbox}
                    title={filtersActive ? 'No jobs match your filters' : 'No open jobs near you'}
                    body={filtersActive
                      ? 'Try a different search or urgency, or clear the filters.'
                      : 'New jobs in your area and services show up here.'}
                  />
                  {filtersActive && (
                    <Tap
                      style={styles.clearButton}
                      accessibilityRole="button"
                      accessibilityLabel="Clear filters"
                      onPress={clearFilters}
                    >
                      <Text style={styles.clearButtonText}>Clear filters</Text>
                    </Tap>
                  )}
                </EmptyCard>
              )}

              {availableJobs.length > 0 && (
                <View style={styles.jobList}>
                  {availableJobs.map((job) => {
                    const isApplied = applied.has(job.id);
                    return (
                      <JobRow
                        key={job.id}
                        testID={`feed-job-${job.id}`}
                        title={job.title}
                        meta={feedRowMeta(job, isApplied)}
                        tone={isApplied ? 'applied' : 'open'}
                        amount={job.budget != null ? peso(job.budget) : ''}
                        date={job.scheduled_at}
                        onPress={() => onNavigate('Job Detail', job.id)}
                      />
                    );
                  })}
                </View>
              )}

              {canLoadMore && (
                <Tap
                  testID="feed-load-more"
                  style={styles.clearButton}
                  disabled={loadingMore}
                  accessibilityRole="button"
                  accessibilityLabel="Load more jobs"
                  accessibilityState={{ disabled: loadingMore, busy: loadingMore }}
                  onPress={() => void loadMore()}
                >
                  <Text style={styles.clearButtonText}>{loadingMore ? 'Loading…' : 'Load more'}</Text>
                </Tap>
              )}
            </>
          )}

          <View style={{ height: 24 }} />
        </View>
      </KeyboardAwareScrollView>
      {/* Opaque status-bar backdrop: the header scrolls with the content, so without it rows draw under the clock and icons. */}
      <View pointerEvents="none" style={[styles.statusBackdrop, { height: statusInset }]} />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },
    body: { flex: 1 },

    tourBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44,
      paddingLeft: 14, paddingRight: 6, borderRadius: 14, backgroundColor: Colors.primaryTonal,
    },
    tourText: {
      flex: 1, minWidth: 0, color: C.ink900,
      fontSize: 14, fontWeight: '500', fontFamily: 'Inter', lineHeight: 20,
    },
    tourStart: { color: Colors.primaryDeep, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', lineHeight: 20, paddingHorizontal: 8 },
    tourClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

    statusBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: C.canvas },
    header: { paddingHorizontal: Spacing.screenH },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: Colors.primaryTonal,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarText: { color: Colors.primaryDeep, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    // The greeting column yields to the actions, never the other way round: the
    // avatar is the only route to Profile (and Log out), so a long name must
    // truncate rather than push it off-screen.
    greetingColumn: { flex: 1, flexShrink: 1, minWidth: 0, gap: 2 },
    greeting: { color: C.ink500, fontSize: 13, fontWeight: '400', fontFamily: 'Inter', lineHeight: 20 },
    userName: { color: C.ink900, fontSize: 18, fontWeight: '700', fontFamily: 'Inter', lineHeight: 24 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
    bell: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    bellBadge: {
      position: 'absolute', top: -4, right: -3,
      minWidth: 22, height: 18, borderRadius: 9, paddingHorizontal: 5,
      backgroundColor: Colors.dangerSolid, borderWidth: 2, borderColor: C.surface,
      alignItems: 'center', justifyContent: 'center',
    },
    bellBadgeText: {
      color: Colors.onPrimary, fontSize: 10, fontWeight: '700', fontFamily: 'Inter',
      lineHeight: 12, letterSpacing: 0.5,
    },

    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 18, paddingBottom: 20, gap: 14 },

    // The hero card, always navy: the next booking, or the setup progress.
    heroCard: { backgroundColor: Colors.hero, borderRadius: 20, padding: 18, gap: 8 },
    heroChip: {
      alignSelf: 'flex-start', backgroundColor: Colors.heroCard,
      borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    },
    heroChipText: { color: Colors.onHeroMuted, fontSize: 12, fontWeight: '600', fontFamily: 'Inter', lineHeight: 16 },
    heroTitle: { color: Colors.onPrimary, fontSize: 20, fontWeight: '700', fontFamily: 'Inter', lineHeight: 26 },
    heroLine: { color: Colors.onPrimary, fontSize: 13, fontWeight: '400', fontFamily: 'Inter', lineHeight: 18 },
    heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
    heroMore: { flex: 1, minWidth: 0, color: Colors.onHeroMuted, fontSize: 13, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },
    heroButton: {
      flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto',
      backgroundColor: Colors.onPrimary, borderRadius: 999,
      paddingLeft: 16, paddingRight: 14, paddingVertical: 10, flexShrink: 0,
    },
    heroButtonText: { color: Colors.primary, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },

    // Setup progress: one segment per step, filled white once the step is done.
    progressRow: { flexDirection: 'row', gap: 6, paddingTop: 6 },
    progressSegment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: Colors.heroCardBorder },
    progressSegmentDone: { backgroundColor: Colors.onPrimary },

    // Setup checklist.
    checklist: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 20,
      padding: 16, gap: 14,
    },
    stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    stepBadgeDone: { backgroundColor: C.successSurface },
    stepBadgeNext: { backgroundColor: Colors.primaryTonal },
    stepBadgeLater: { backgroundColor: C.ink50 },
    stepNumber: { fontFamily: 'Inter', fontSize: 14, fontWeight: '700', lineHeight: 18 },
    stepNumberNext: { color: Colors.primaryDeep },
    stepNumberLater: { color: C.ink500 },
    stepCopy: { flex: 1, minWidth: 0, gap: 2 },
    stepTitle: { color: C.ink700, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },
    stepTitleNext: { color: C.ink900, fontWeight: '700' },
    stepTitleLater: { color: C.ink500 },
    stepSubtitle: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18 },
    expiryCard: { borderRadius: 16, padding: 14, gap: 10, marginBottom: 14, borderWidth: 1 },
    expirySoon: { backgroundColor: Colors.warningSurface, borderColor: Colors.warningBorder },
    expiryExpired: { backgroundColor: Colors.dangerSurface, borderColor: Colors.dangerBorder },
    expiryText: { fontSize: 13.5, lineHeight: 19, fontWeight: '600', fontFamily: 'Inter' },
    expiryTextSoon: { color: Colors.warningText },
    expiryTextExpired: { color: Colors.dangerText },
    setupButton: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      minHeight: 48, borderRadius: 16, backgroundColor: Colors.primary,
    },
    setupButtonText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },

    // Availability row.
    availability: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 18,
      paddingVertical: 12, paddingLeft: 16, paddingRight: 12,
    },
    availabilityDot: { width: 10, height: 10, borderRadius: 5 },
    availabilityCopy: { flex: 1, minWidth: 0 },
    availabilityTitle: { color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },
    availabilityHint: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18, marginTop: 1 },

    // Search field, a pill on the canvas.
    search: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: 999, paddingHorizontal: 16, minHeight: 52,
    },
    searchInput: { flex: 1, minWidth: 0, fontSize: 15.5, color: C.ink900, fontFamily: 'Inter', paddingVertical: 12 },

    // Urgency pills scroll past the screen edge, as in Figma.
    pillScroll: { flexGrow: 0, marginHorizontal: -Spacing.screenH },
    pillRow: { gap: 8, paddingHorizontal: Spacing.screenH },

    jobList: { gap: 8 },
    clearButton: {
      minHeight: 48, alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
      paddingHorizontal: 20, borderRadius: 999, backgroundColor: Colors.primaryTonal, marginVertical: 8,
    },
    clearButtonText: { color: Colors.primaryDeep, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },

    skeletonCard: {
      backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 12, gap: 12,
      borderWidth: 1, borderColor: C.line,
    },
    skeletonLine: { height: 14, borderRadius: 7, backgroundColor: C.skeleton },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
