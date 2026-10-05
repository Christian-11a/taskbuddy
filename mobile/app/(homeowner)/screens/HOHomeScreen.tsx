import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { useNotifications } from '../../../src/context/NotificationsContext';
/**
 * HOHomeScreen.tsx
 *
 * Theme C "Sky" (Figma "FINAL · Homeowner"): flat brand header with the
 * wallet balance card, five service shortcuts in one row, active jobs list.
 */

import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Bell,
  BriefcaseBusiness,
  BrushCleaning,
  CheckCircle2,
  ChevronRight,
  Footprints,
  Hammer,
  Hand,
  Clock,
  Sparkles,
  Wrench,
} from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { api } from '../../../src/lib/api';
import { jobStatusMeta, peso, shortDate } from '../../../src/lib/format';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';
import JobCard from '../../../src/components/JobCard';
import OwnAvatar from '../../../src/components/OwnAvatar';
import Tap from '../../../src/components/ui/Tap';

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

const ACTIVITY_ICON: Record<string, typeof BriefcaseBusiness> = {
  recommendation_invite: BriefcaseBusiness,
  application_update: CheckCircle2,
  job_update: BriefcaseBusiness,
};

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

export default function HOHomeScreen({ onNavigate }: HOHomeScreenProps) {
  const { C, styles } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { profile } = useAuth();
  const wallet = useAsyncData(() => api.wallet(), [], 'ho-home-wallet');
  const jobs = useAsyncData(() => api.myJobs(), [], 'ho-home-jobs');
  const categories = useAsyncData(() => api.categories(), [], 'ho-home-categories');
  const notifications = useNotifications();

  const name = profile?.full_name ?? '';
  const activeJobs = (jobs.data ?? []).filter((j) => ACTIVE_STATUSES.includes(j.status));
  const recentActivity = notifications.notifications.slice(0, 3);
  const unread = notifications.unreadCount;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (wallet.loading && jobs.loading && categories.loading && notifications.loading) {
    return <ScreenSkeleton variant="dashboard" />;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — flat brand header, rounded bottom corners. */}
        <View style={[styles.hero, { paddingTop: headerTop }]}>
          <View style={styles.heroTopRow}>
            <View testID="hero-text" style={styles.heroText}>
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
            <View testID="hero-actions" style={styles.heroActions}>
              <View>
                <Tap
                  style={styles.iconBtn}
                  rippleColor={C.rippleOnHero}
                  accessibilityRole="button"
                  accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
                  onPress={() => onNavigate('Notifications')}
                >
                  <Bell size={21} color={C.onPrimary} strokeWidth={2.2} />
                </Tap>
                {unread > 0 && (
                  <View pointerEvents="none" style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText} maxFontSizeMultiplier={1.2}>{unread > 99 ? '99+' : unread}</Text>
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

          <View style={styles.balanceStrip}>
            <View style={styles.balanceCopy}>
              <Text style={styles.balanceLabel}>Wallet balance</Text>
              {wallet.error ? (
                <WidgetError message="Couldn't load your wallet" onRetry={wallet.reload} />
              ) : (
                <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit>
                  {wallet.data ? peso(wallet.data.balance) : '—'}
                </Text>
              )}
            </View>
            <Tap style={styles.manageBtn} scale onPress={() => onNavigate('Wallet')} accessibilityRole="button">
              <Text style={styles.manageLink}>Manage wallet</Text>
            </Tap>
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Find a service */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Find a service</Text>
            </View>
            <View style={styles.categoryStrip}>
              {categories.error ? (
                <WidgetError message="Couldn't load services" onRetry={categories.reload} />
              ) : (categories.data ?? []).map((cat) => {
                const Icon = CATEGORY_ICON[cat.name] ?? Hand;
                return (
                  <Tap
                    key={cat.id}
                    style={styles.categoryTile}
                    accessibilityRole="button"
                    accessibilityLabel={cat.name}
                    // The tapped tile answers the flow's first question, so it
                    // travels with the navigation and step 1 is skipped.
                    onPress={() => onNavigate('Create Job', String(cat.id))}
                  >
                    <View style={styles.categoryIconWell}>
                      <Icon size={24} color={C.link} strokeWidth={2} />
                    </View>
                    <Text style={styles.categoryLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{cat.name}</Text>
                  </Tap>
                );
              })}
            </View>
          </View>

          {/* Active Jobs */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              Active jobs
              {activeJobs.length > 0 ? (
                <Text style={styles.sectionCount}>  {activeJobs.length}</Text>
              ) : null}
            </Text>
            <Tap onPress={() => onNavigate('My Jobs')} style={styles.linkBtn} hitSlop={8} accessibilityRole="button">
              <Text style={styles.textLink}>See all</Text>
            </Tap>
          </View>

          {jobs.error && <WidgetError message="Couldn't load your jobs" onRetry={jobs.reload} />}

          {/* "Need something done?" is the empty state, not a permanent card:
              once there are active jobs, the list is what matters. */}
          {!jobs.loading && !jobs.error && activeJobs.length === 0 && (
            <Tap
              style={styles.primaryTaskCard}
              onPress={() => onNavigate('Create Job')}
              scale
              accessibilityRole="button"
              testID="home-post-job"
            >
              <View style={styles.taskIcon}>
                <Sparkles size={22} color={C.link} />
              </View>
              <View style={styles.taskCopy}>
                <Text style={styles.taskTitle}>Need something done?</Text>
                <Text style={styles.taskDesc}>You have no active jobs. Post a task and connect with a nearby verified provider.</Text>
              </View>
              <ChevronRight size={20} color={C.ink400} />
            </Tap>
          )}

          {activeJobs.map((job) => (
            <JobCard
              key={job.id}
              title={job.title}
              budget={job.budget}
              address={job.address}
              status={jobStatusMeta(job.status, C)}
              urgency={job.urgency}
              footer={[{ icon: <Clock size={14} color={C.ink400} />, text: `Posted ${shortDate(job.posted_at)}` }]}
              onPress={() => onNavigate('Job Detail', job.id)}
            />
          ))}

          {/* Recent Activity */}
          {notifications.error ? (
            <WidgetError message="Couldn't load your notifications" onRetry={notifications.reload} />
          ) : recentActivity.length > 0 && (
            <>
              <View style={[styles.sectionHead, { marginTop: 22 }]}>
                <Text style={styles.sectionTitle}>Recent activity</Text>
                <Tap onPress={() => onNavigate('Notifications')} style={styles.linkBtn} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.textLink}>View all</Text>
                </Tap>
              </View>
              <View style={styles.activityList}>
                {recentActivity.map((n, i) => {
                  const Icon = ACTIVITY_ICON[n.type] ?? BriefcaseBusiness;
                  return (
                    <View
                      key={n.id}
                      style={[styles.activityRow, i < recentActivity.length - 1 && styles.activityRowBorder]}
                    >
                      <View style={styles.activityIcon}>
                        <Icon size={18} color={C.link} />
                      </View>
                      <View style={styles.activityCopy}>
                        <Text style={styles.activityTitle} numberOfLines={1}>{n.title}</Text>
                        <Text style={styles.activityBody} numberOfLines={2}>{n.body}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Room for the floating "Post a job" button above the nav bar. */}
          <View style={{ height: 96 }} />
        </View>
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

    hero: {
      backgroundColor: C.hero,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 20,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    heroTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    greeting: { color: C.onHeroMuted, fontSize: 15, fontFamily: 'Inter', fontWeight: '500' },
    userName: { color: C.onPrimary, fontSize: 24, fontWeight: '800', fontFamily: 'Inter', marginTop: 2, letterSpacing: -0.3 },
    // The name column yields to the actions, never the other way round: the
    // avatar is the only route to Profile (and Log out), so a long name must
    // truncate rather than push it off-screen.
    heroText: { flex: 1, minWidth: 0, marginRight: 12 },
    heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
    iconBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.heroCard,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    notifBadge: {
      position: 'absolute', top: -3, right: -3,
      minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
      backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: C.hero,
    },
    notifBadgeText: { color: '#ffffff', fontSize: 10.5, fontWeight: '800', fontFamily: 'Inter' },
    avatarCircle: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.primaryTonalStrong,
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarText: { color: C.primaryDeep, fontWeight: '800', fontSize: 15, fontFamily: 'Inter' },

    balanceStrip: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 20, paddingVertical: 16, paddingHorizontal: 16, gap: 12,
      backgroundColor: C.heroCard,
      borderWidth: 1, borderColor: C.heroCardBorder,
      borderRadius: 18,
    },
    balanceCopy: { flex: 1, minWidth: 0 },
    balanceLabel: { color: C.onHeroMuted, fontSize: 14, fontFamily: 'Inter', fontWeight: '500', marginBottom: 2 },
    balanceAmount: { color: C.onPrimary, fontSize: 28, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.5 },
    manageBtn: {
      backgroundColor: '#ffffff', borderRadius: 999, overflow: 'hidden',
      paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', flexShrink: 0,
    },
    manageLink: { color: '#0369a1', fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    widgetError: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 8 },
    widgetErrorText: { color: C.ink500, fontSize: 13.5, fontFamily: 'Inter', flexShrink: 1 },
    retryBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, overflow: 'hidden' },
    widgetRetry: { color: C.link, fontSize: 13.5, fontWeight: '800', fontFamily: 'Inter' },

    body: { paddingHorizontal: Spacing.screenH, paddingTop: 22 },

    primaryTaskCard: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: C.surface, borderColor: C.line, borderWidth: 1,
      borderRadius: 20, padding: 16, marginBottom: 22, overflow: 'hidden',
    },
    taskIcon: {
      width: 46, height: 46, borderRadius: 14,
      backgroundColor: C.primaryTonal,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    taskCopy: { flex: 1, minWidth: 0 },
    taskTitle: { fontSize: 16.5, fontWeight: '800', color: C.ink900, fontFamily: 'Inter', marginBottom: 3 },
    taskDesc: { fontSize: 14, color: C.ink500, fontFamily: 'Inter', lineHeight: 19 },

    section: { marginBottom: 26 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    sectionTitle: { fontSize: 19, fontWeight: '800', color: C.ink900, fontFamily: 'Inter', letterSpacing: -0.2 },
    sectionCount: { fontWeight: '700', color: C.ink400, fontSize: 15 },
    linkBtn: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
    textLink: { color: C.link, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },

    // Five equal shortcut tiles in one row (Figma). Wraps if more are added.
    categoryStrip: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 12 },
    categoryTile: {
      width: '20%', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 4,
      borderRadius: 16, overflow: 'hidden',
    },
    categoryIconWell: {
      width: 56, height: 56, borderRadius: 18,
      backgroundColor: C.primaryTonal,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: 8,
    },
    categoryLabel: { fontSize: 12.5, fontWeight: '600', color: C.ink800, fontFamily: 'Inter', textAlign: 'center' },

    activityList: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: 20, overflow: 'hidden',
    },
    activityRow: { flexDirection: 'row', gap: 12, padding: 14, alignItems: 'flex-start' },
    activityRowBorder: { borderBottomWidth: 1, borderBottomColor: C.hairline },
    activityIcon: {
      width: 36, height: 36, borderRadius: 12,
      backgroundColor: C.primaryTonal, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    activityCopy: { flex: 1 },
    activityTitle: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
    activityBody: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18 },
  });
  return { Colors, V6Colors, C, styles };
}
