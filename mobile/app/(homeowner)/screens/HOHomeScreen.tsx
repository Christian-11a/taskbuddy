import { useTheme, useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { useNotifications } from '../../../src/context/NotificationsContext';
/**
 * HOHomeScreen.tsx
 *
 * Figma "Home · final (Variation A)": a light header (avatar, greeting and
 * name, wallet chip, bell), a "What do you need done?" field, the hero card for
 * the one thing that needs the homeowner, service chips, and up to three
 * active jobs.
 */

import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowRight,
  Bell,
  BrushCleaning,
  ChevronRight,
  ClipboardList,
  Footprints,
  Hammer,
  Hand,
  Plus,
  Sparkles,
  Wallet,
  Wrench,
} from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { api, type Job } from '../../../src/lib/api';
import { initials, peso } from '../../../src/lib/format';
import {
  pendingApplicants,
  pickHomeHero,
  proposalCandidates,
  type ApplicationsByJob,
  type HomeHero,
} from '../../../src/lib/homeJobs';
import { jobRowStatus } from '../../../src/lib/jobRowStatus';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';
import OwnAvatar from '../../../src/components/OwnAvatar';
import Tap from '../../../src/components/ui/Tap';
import SectionHeader from '../../../src/components/ui/SectionHeader';
import JobRow from '../../../src/components/ui/JobRow';
import EmptyRow from '../../../src/components/ui/EmptyRow';

const CATEGORY_ICON: Record<string, typeof Wrench> = {
  Plumbing: Wrench,
  Cleaning: BrushCleaning,
  Handyman: Hammer,
  Manicure: Sparkles,
  Pedicure: Footprints,
};

const ACTIVE_STATUSES = [
  'open',
  'recommending',
  'assigned',
  'confirmed',
  'in_progress',
];

/** How many active jobs the Home list shows; the section count shows them all. */
const ACTIVE_LIST_LIMIT = 3;

/**
 * Pending-proposal lookups for the open jobs Home checks. They run after the
 * jobs load and never block Home. A failed lookup is left out, so that job
 * counts as having no proposals and the hero falls back to the next rule.
 */
async function loadProposalApplications(jobs: Job[]): Promise<ApplicationsByJob> {
  const results = await Promise.allSettled(
    proposalCandidates(jobs).map((job) =>
      Promise.resolve()
        .then(() => api.jobApplications(job.id))
        .then((applications) => ({ id: job.id, applications })),
    ),
  );
  const byJob: ApplicationsByJob = {};
  for (const result of results) {
    if (result.status === 'fulfilled') byJob[result.value.id] = result.value.applications;
  }
  return byJob;
}

/** "Oct 6" */
function shortMonthDay(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "Oct 12 · 9:00 AM · Juan Dela Cruz" */
function bookingLine(when: Date, providerName: string | null): string {
  const time = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return [shortMonthDay(when), time, ...(providerName ? [providerName] : [])].join(' · ');
}

interface HOHomeScreenProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

function WidgetError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { styles } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.widgetError}>
      <Text style={styles.widgetErrorText}>{message}</Text>
      <Tap onPress={onRetry} style={styles.retryBtn} hitSlop={8} accessibilityRole="button">
        <Text style={styles.widgetRetry}>Retry</Text>
      </Tap>
    </View>
  );
}

/** The one thing that needs the homeowner: proposals to review, or the next booking. */
function HomeHeroCard({ hero, onNavigate }: { hero: HomeHero; onNavigate: HOHomeScreenProps['onNavigate'] }) {
  const { Colors, styles } = useThemedStyles(createThemedStyles);
  if (hero.kind === 'booking') {
    // Nothing needs a decision, so the card is a quiet surface, not the blue hero.
    return (
      <View testID="home-hero-booking" style={styles.nextCard}>
        <View style={styles.nextChip}>
          <Text style={styles.nextChipText}>Next booking</Text>
        </View>
        <Text style={styles.nextTitle} numberOfLines={2}>{hero.job.title}</Text>
        <Text style={styles.nextLine} numberOfLines={1}>{bookingLine(hero.when, hero.providerName)}</Text>
        <View style={styles.nextFooter}>
          <Tap
            style={styles.nextButton}
            hitSlop={5}
            accessibilityRole="button"
            accessibilityLabel={`View ${hero.job.title}`}
            onPress={() => onNavigate('Job Detail', hero.job.id)}
          >
            <Text style={styles.nextButtonText}>View</Text>
          </Tap>
        </View>
      </View>
    );
  }
  const count = hero.pending.length;
  return (
    <View testID="home-hero-proposals" style={styles.attentionCard}>
      <View style={styles.attentionChip}>
        <Text style={styles.attentionChipText}>Needs your attention</Text>
      </View>
      <Text style={styles.attentionTitle}>{`${count} ${count === 1 ? 'proposal' : 'proposals'} waiting`}</Text>
      <Text style={styles.attentionLine} numberOfLines={1}>
        {`${hero.job.title} · posted ${shortMonthDay(hero.job.posted_at)}`}
      </Text>
      <View style={styles.attentionFooter}>
        <View style={styles.attentionApplicants}>
          <View style={styles.attentionAvatars}>
            {hero.pending.slice(0, 2).map((application, index, shown) => (
              <View
                key={application.id}
                style={[styles.attentionAvatar, index < shown.length - 1 && styles.attentionAvatarOverlap]}
              >
                <Text style={styles.attentionAvatarText}>{initials(application.provider?.full_name)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.attentionApplied}>{`${count} applied`}</Text>
        </View>
        <Tap
          style={styles.attentionButton}
          hitSlop={5}
          accessibilityRole="button"
          accessibilityLabel={`Review proposals for ${hero.job.title}`}
          onPress={() => onNavigate('Job Applications', hero.job.id)}
        >
          <Text style={styles.attentionButtonText}>Review</Text>
          <ArrowRight size={16} color={Colors.primary} strokeWidth={2.4} />
        </Tap>
      </View>
    </View>
  );
}

export default function HOHomeScreen({ onNavigate }: HOHomeScreenProps) {
  const { Colors, C, styles } = useThemedStyles(createThemedStyles);
  const { dark } = useTheme();
  const headerTop = useHeaderTop();
  const { profile } = useAuth();
  const wallet = useAsyncData(() => api.wallet(), [], 'ho-home-wallet');
  const jobs = useAsyncData(() => api.myJobs(), [], 'ho-home-jobs');
  const categories = useAsyncData(() => api.categories(), [], 'ho-home-categories');
  const notifications = useNotifications();
  const [proposalLookup, setProposalLookup] = useState<{ jobs: Job[] | null; byJob: ApplicationsByJob }>({
    jobs: null,
    byJob: {},
  });

  useEffect(() => {
    const list = jobs.data;
    if (!list) return;
    let active = true;
    loadProposalApplications(list).then((byJob) => {
      if (active) setProposalLookup({ jobs: list, byJob });
    });
    return () => { active = false; };
  }, [jobs.data]);

  // The hero and the proposal counts on job rows wait for the lookups made for
  // the jobs they are computed from, so nothing flips from "waiting" to "to
  // review" while a lookup for the same list is still in flight.
  const proposalsReady = jobs.data !== null && proposalLookup.jobs === jobs.data;
  const hero = proposalsReady && jobs.data ? pickHomeHero(jobs.data, proposalLookup.byJob, new Date()) : null;
  const pendingCountFor = (jobId: string): number | undefined =>
    proposalsReady ? pendingApplicants(proposalLookup.byJob[jobId]).length : undefined;

  const name = profile?.full_name ?? '';
  const activeJobs = (jobs.data ?? []).filter((j) => ACTIVE_STATUSES.includes(j.status));
  const unread = notifications.unreadCount;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (wallet.loading && jobs.loading && categories.loading && notifications.loading) {
    return <ScreenSkeleton variant="dashboard" />;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: the avatar opens Profile, the wallet chip opens Wallet, the bell opens Notifications. */}
        <View style={[styles.header, { paddingTop: headerTop }]}>
          <View style={styles.headerRow}>
            <Tap
              testID="btn-home-avatar"
              style={styles.avatar}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => onNavigate('Profile')}
            >
              {profile?.avatar_url || !name ? (
                <OwnAvatar name={name} textStyle={styles.avatarText} />
              ) : (
                <Text style={styles.avatarText}>{initials(name)}</Text>
              )}
            </Tap>
            {/* The name column yields to the actions, never the other way round: a long name truncates. */}
            <View testID="hero-text" style={styles.greetingColumn}>
              <Text style={styles.greeting}>{greeting}</Text>
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
              <Tap
                testID="home-wallet"
                style={styles.walletChip}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={wallet.data ? `Wallet, balance ${peso(wallet.data.balance)}` : 'Wallet'}
                onPress={() => onNavigate('Wallet')}
              >
                <Wallet size={16} color={Colors.link} strokeWidth={2.2} />
                <Text style={styles.walletAmount} numberOfLines={1}>
                  {wallet.data ? peso(wallet.data.balance) : '—'}
                </Text>
              </Tap>
              <View>
                <Tap
                  style={styles.bell}
                  hitSlop={2}
                  accessibilityRole="button"
                  accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                  onPress={() => onNavigate('Notifications')}
                >
                  <Bell size={20} color={C.ink900} strokeWidth={2.2} />
                </Tap>
                {unread > 0 && (
                  <View pointerEvents="none" style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText} maxFontSizeMultiplier={1.2}>{unread > 99 ? '99+' : unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
          {wallet.error && <WidgetError message="Couldn't load your wallet" onRetry={wallet.reload} />}
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* What do you need done? opens the job form with no category, as My Jobs' "New" does. */}
          <Tap
            testID="home-post-job"
            style={styles.askField}
            scale
            accessibilityRole="button"
            accessibilityLabel="What do you need done?"
            accessibilityHint="Opens the new job form"
            onPress={() => onNavigate('Create Job')}
          >
            <View style={styles.askPlus}>
              <Plus size={18} color={Colors.onPrimary} strokeWidth={2.4} />
            </View>
            <Text style={styles.askText} numberOfLines={1}>What do you need done?</Text>
            <ChevronRight size={18} color={C.ink500} />
          </Tap>

          {hero && <HomeHeroCard hero={hero} onNavigate={onNavigate} />}

          {/* Book a service: each chip opens the job form with that category already picked. */}
          <SectionHeader title="Book a service" />
          {categories.error ? (
            <WidgetError message="Couldn't load services" onRetry={categories.reload} />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroll}
              contentContainerStyle={styles.chipRow}
            >
              {(categories.data ?? []).map((cat) => {
                const Icon = CATEGORY_ICON[cat.name] ?? Hand;
                return (
                  <Tap
                    key={cat.id}
                    style={styles.chip}
                    hitSlop={2}
                    accessibilityRole="button"
                    accessibilityLabel={`Book ${cat.name}`}
                    onPress={() => onNavigate('Create Job', String(cat.id))}
                  >
                    <View style={styles.chipIcon}>
                      <Icon size={17} color={Colors.link} strokeWidth={2} />
                    </View>
                    <Text style={styles.chipText}>{cat.name}</Text>
                  </Tap>
                );
              })}
            </ScrollView>
          )}

          {/* Active jobs: the count covers every active job, the list shows the first few. */}
          <SectionHeader
            title="Active jobs"
            count={activeJobs.length > 0 ? activeJobs.length : undefined}
            linkLabel="See all"
            onLinkPress={() => onNavigate('My Jobs')}
          />

          {jobs.error && <WidgetError message="Couldn't load your jobs" onRetry={jobs.reload} />}

          {!jobs.loading && !jobs.error && activeJobs.length === 0 && (
            <EmptyRow icon={ClipboardList} title="No active jobs" body="Jobs you post show up here." />
          )}

          {activeJobs.length > 0 && (
            <View style={styles.jobList}>
              {activeJobs.slice(0, ACTIVE_LIST_LIMIT).map((job) => {
                const status = jobRowStatus(job, pendingCountFor(job.id));
                return (
                  <JobRow
                    key={job.id}
                    testID={`home-job-${job.id}`}
                    title={job.title}
                    meta={status.meta}
                    tone={status.tone}
                    amount={job.budget != null ? peso(job.budget) : ''}
                    date={job.scheduled_at}
                    onPress={() => onNavigate('Job Detail', job.id)}
                  />
                );
              })}
            </View>
          )}
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: C.canvas },

    header: { paddingHorizontal: Spacing.screenH },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: Colors.primaryTonal,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarText: { color: Colors.primaryDeep, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    greetingColumn: { flex: 1, minWidth: 0, gap: 2 },
    greeting: { color: C.ink500, fontSize: 13, fontWeight: '400', fontFamily: 'Inter', lineHeight: 18 },
    userName: { color: C.ink900, fontSize: 18, fontWeight: '700', fontFamily: 'Inter', lineHeight: 24 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
    walletChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingLeft: 10, paddingRight: 12, paddingVertical: 8,
      borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
    },
    walletAmount: { color: C.ink900, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },
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
    widgetError: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
    widgetErrorText: { color: C.ink500, fontSize: 13.5, fontFamily: 'Inter', flexShrink: 1 },
    retryBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
    widgetRetry: { color: C.link, fontSize: 13.5, fontWeight: '800', fontFamily: 'Inter' },

    body: { paddingHorizontal: Spacing.screenH, paddingTop: 18, gap: 18 },

    askField: {
      flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54,
      paddingLeft: 10, paddingRight: 16, paddingVertical: 10,
      borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
    },
    askPlus: {
      width: 34, height: 34, borderRadius: 12,
      backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    },
    askText: {
      flex: 1, minWidth: 0, color: C.ink500,
      fontSize: 15, fontWeight: '500', fontFamily: 'Inter', lineHeight: 20,
    },

    // The blue hero card: used only while proposals need a decision. White text.
    attentionCard: { backgroundColor: Colors.hero, borderRadius: 20, padding: 18, gap: 8 },
    attentionChip: {
      alignSelf: 'flex-start', backgroundColor: Colors.heroCard,
      borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    },
    attentionChipText: { color: Colors.onHeroMuted, fontSize: 12, fontWeight: '600', fontFamily: 'Inter', lineHeight: 16 },
    attentionTitle: {
      color: Colors.onPrimary, fontSize: 24, fontWeight: '700', fontFamily: 'Inter',
      lineHeight: 30, letterSpacing: -0.2,
    },
    attentionLine: { color: Colors.onPrimary, fontSize: 13, fontWeight: '400', fontFamily: 'Inter', lineHeight: 18 },
    attentionFooter: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, paddingTop: 8,
    },
    attentionApplicants: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    attentionAvatars: { flexDirection: 'row' },
    attentionAvatar: {
      width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: Colors.hero,
      backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center',
    },
    attentionAvatarOverlap: { marginRight: -8 },
    attentionAvatarText: {
      color: Colors.primaryDeep, fontSize: 10, fontWeight: '700', fontFamily: 'Inter',
      lineHeight: 12, letterSpacing: 0.5,
    },
    attentionApplied: { color: Colors.onPrimary, fontSize: 13, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },
    attentionButton: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: Colors.onPrimary, borderRadius: 999,
      paddingLeft: 16, paddingRight: 14, paddingVertical: 10, flexShrink: 0,
    },
    attentionButtonText: { color: Colors.primary, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },

    // Caught-up hero: nothing needs a decision, so it is a quiet surface with a blue
    // View button. Sizes match the blue card so the hierarchy reads the same.
    nextCard: {
      backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line,
      borderRadius: 20, padding: 18, gap: 8,
    },
    nextChip: {
      alignSelf: 'flex-start', backgroundColor: Colors.primaryTonal,
      borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    },
    nextChipText: { color: Colors.primaryDeep, fontSize: 12, fontWeight: '600', fontFamily: 'Inter', lineHeight: 16 },
    nextTitle: {
      color: V6Colors.ink900, fontSize: 24, fontWeight: '700', fontFamily: 'Inter',
      lineHeight: 30, letterSpacing: -0.2,
    },
    nextLine: { color: V6Colors.ink700, fontSize: 13, fontWeight: '400', fontFamily: 'Inter', lineHeight: 18 },
    nextFooter: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 8 },
    nextButton: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: Colors.primary, borderRadius: 999,
      paddingLeft: 16, paddingRight: 14, paddingVertical: 10, flexShrink: 0,
    },
    nextButtonText: { color: Colors.onPrimary, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },

    // Service chips scroll sideways past the screen edge, as in Figma.
    chipScroll: { marginHorizontal: -Spacing.screenH },
    chipRow: { paddingHorizontal: Spacing.screenH, gap: 10 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingLeft: 6, paddingRight: 14, paddingVertical: 6,
      borderRadius: 999, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
    },
    chipIcon: {
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center',
    },
    chipText: { color: C.ink700, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },

    jobList: { gap: 8 },
  });
  return { Colors, V6Colors, C, styles };
}
