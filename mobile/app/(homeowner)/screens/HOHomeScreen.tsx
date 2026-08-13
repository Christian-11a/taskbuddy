/**
 * HOHomeScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-dashboard screen —
 * hero-clean gradient header with balance strip, primary task card,
 * category strip, active jobs list.
 */

import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Bell,
  BriefcaseBusiness,
  BrushCleaning,
  CheckCircle2,
  ClipboardList,
  Hammer,
  Hand,
  MapPin,
  Palette,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials, jobStatusMeta, peso, shortDate } from '../../../src/lib/format';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';

const C = V6Colors;

const CATEGORY_ICON: Record<string, typeof Wrench> = {
  Plumbing: Wrench,
  Cleaning: BrushCleaning,
  Handyman: Hammer,
  Manicure: Sparkles,
  Pedicure: Palette,
};

const ACTIVE_STATUSES = ['open', 'recommending', 'assigned', 'in_progress'];

const ACTIVITY_ICON: Record<string, typeof BriefcaseBusiness> = {
  recommendation_invite: BriefcaseBusiness,
  application_update: CheckCircle2,
  job_update: BriefcaseBusiness,
};

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  created_at: string;
}

interface HOHomeScreenProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function HOHomeScreen({ onNavigate }: HOHomeScreenProps) {
  const { profile } = useAuth();
  const { data, loading } = useAsyncData(async () => {
    const [wallet, jobs, cats, notifs, unreadCount] = await Promise.all([
      api.wallet(),
      api.myJobs(),
      api.categories(),
      api.notifications() as Promise<NotificationRow[]>,
      api.unreadNotificationCount(),
    ]);
    return { wallet, jobs, cats, notifs, unreadCount };
  }, [], 'ho-home');

  const name = profile?.full_name ?? '';
  const jobs = data?.jobs ?? [];
  const activeJobs = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const recentActivity = (data?.notifs ?? []).slice(0, 3);
  const unread = data?.unreadCount.count ?? 0;
  const location =
    [profile?.city, profile?.address].filter(Boolean).join(', ') || 'Set your location';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (loading) return <ScreenSkeleton variant="dashboard" />;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — mockup's final hero-clean gradient: 145deg #078eaa->#0b7288 */}
        <LinearGradient
          colors={['#078eaa', '#0b7288']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.greeting}>{greeting}</Text>
              <Text style={styles.userName}>{name || 'there'}</Text>
            </View>
            <View style={styles.heroActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => onNavigate('Notifications')}
                activeOpacity={0.8}
              >
                <Bell size={20} color={C.white} />
                {unread > 0 && (
                  <View style={styles.notifBadge}><Text style={styles.notifBadgeText}>{unread}</Text></View>
                )}
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

          <View style={styles.balanceStrip}>
            <View>
              <Text style={styles.balanceLabel}>Wallet balance</Text>
              <Text style={styles.balanceAmount}>{data ? peso(data.wallet.balance) : '—'}</Text>
            </View>
            <TouchableOpacity onPress={() => onNavigate('Wallet')} activeOpacity={0.8}>
              <Text style={styles.manageLink}>Manage wallet</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Body */}
        <View style={styles.body}>
          {/* Primary task card */}
          <TouchableOpacity
            style={styles.primaryTaskCard}
            onPress={() => onNavigate('Create Job')}
            activeOpacity={0.9}
          >
            <View style={styles.taskIcon}>
              <Sparkles size={22} color={C.cyan700} />
            </View>
            <View style={styles.taskCopy}>
              <Text style={styles.taskTitle}>Need something done?</Text>
              <Text style={styles.taskDesc}>Post a task and connect with a nearby verified provider.</Text>
            </View>
            <View style={styles.postBtn}>
              <Text style={styles.postBtnText}>+ Post</Text>
            </View>
          </TouchableOpacity>

          {/* Find a service */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Find a service</Text>
            </View>
            <TouchableOpacity
              style={styles.scopeSearch}
              onPress={() => onNavigate('Create Job')}
              activeOpacity={0.8}
            >
              <Search size={19} color={C.ink400} />
              <Text style={styles.scopeSearchText}>Search services or providers</Text>
            </TouchableOpacity>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryStrip}
            >
              {(data?.cats ?? []).map((cat) => {
                const Icon = CATEGORY_ICON[cat.name] ?? Hand;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={styles.categoryTile}
                    onPress={() => onNavigate('Create Job')}
                    activeOpacity={0.85}
                  >
                    <View style={styles.categoryIconWell}>
                      <Icon size={19} color={C.cyan700} />
                    </View>
                    <Text style={styles.categoryLabel}>{cat.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Active Jobs */}
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>
              Active Jobs
              {activeJobs.length > 0 ? (
                <Text style={styles.sectionCount}>  {activeJobs.length} active {activeJobs.length === 1 ? 'job' : 'jobs'}</Text>
              ) : null}
            </Text>
            <TouchableOpacity onPress={() => onNavigate('My Jobs')}>
              <Text style={styles.textLink}>See all</Text>
            </TouchableOpacity>
          </View>

          {activeJobs.length === 0 && (
            <View style={styles.emptyState}>
              <ClipboardList size={30} color={C.ink300} />
              <Text style={styles.emptyTitle}>No active jobs</Text>
              <Text style={styles.emptyText}>Tap a service above to post a job and start receiving offers.</Text>
            </View>
          )}

          {activeJobs.map((job) => {
            const meta = jobStatusMeta(job.status);
            return (
              <TouchableOpacity
                key={job.id}
                style={styles.jobCard}
                onPress={() => onNavigate('Job Detail', job.id)}
                activeOpacity={0.9}
              >
                <View style={styles.jobTitleRow}>
                  <Text style={styles.jobTitle} numberOfLines={1}>{job.title}</Text>
                </View>
                <View style={styles.jobMetaRow}>
                  <MapPin size={13} color={C.ink400} />
                  <Text style={styles.jobMeta} numberOfLines={1}>{job.address}</Text>
                </View>
                <View style={styles.jobBottomRow}>
                  <View style={styles.jobStatus}>
                    <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                    <Text style={styles.jobStatusText}>{meta.label}</Text>
                  </View>
                  <Text style={styles.jobAge}>Posted {shortDate(job.posted_at)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Recent Activity */}
          {recentActivity.length > 0 && (
            <>
              <View style={[styles.sectionHead, { marginTop: 22 }]}>
                <Text style={styles.sectionTitle}>Recent Activity</Text>
                <TouchableOpacity onPress={() => onNavigate('Notifications')}>
                  <Text style={styles.textLink}>View all</Text>
                </TouchableOpacity>
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
                        <Icon size={19} color={C.cyan700} />
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

          <View style={{ height: 20 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.canvas },

  // Hero — matches .hero-clean (linear-gradient 165deg cyan600->cyan700, rounded bottom corners)
  hero: {
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 20,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: { color: C.cyan100, fontSize: 14.5, fontFamily: 'Inter', fontWeight: '500' },
  userName: { color: C.white, fontSize: 24.5, fontWeight: '800', fontFamily: 'Inter', marginTop: 3 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  notifBadge: {
    position: 'absolute', top: -5, right: -4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
  },
  notifBadgeText: { color: C.white, fontSize: 11, fontWeight: '800' },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: C.white, fontWeight: '800', fontSize: 14.5, fontFamily: 'Inter' },

  // Balance strip
  balanceStrip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 16, padding: 13,
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 13.5, fontFamily: 'Inter', marginBottom: 2 },
  balanceAmount: { color: C.white, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
  manageLink: { color: C.white, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },

  // Body
  body: { paddingHorizontal: Spacing.screenH, paddingTop: 18 },

  primaryTaskCard: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: C.white, borderColor: C.cyan100, borderWidth: 1,
    borderRadius: V6Radii.card, padding: 17, marginBottom: 22,
    ...V6Shadows.sm,
  },
  taskIcon: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.cyan100,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  taskCopy: { flex: 1, minWidth: 0 },
  taskTitle: { fontSize: 16.5, fontWeight: '800', color: C.ink900, fontFamily: 'Inter', marginBottom: 3 },
  taskDesc: { fontSize: 14, color: C.ink500, fontFamily: 'Inter', lineHeight: 16 },
  postBtn: { backgroundColor: C.cyan700, borderRadius: V6Radii.btn, paddingHorizontal: 12, paddingVertical: 10 },
  postBtnText: { color: C.white, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },

  section: { marginBottom: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: C.ink900, fontFamily: 'Inter', letterSpacing: -0.15 },
  sectionCount: { fontWeight: '600', color: C.ink400, fontSize: 13.5 },
  textLink: { color: C.cyan700, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },

  scopeSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11,
    marginBottom: 12,
  },
  scopeSearchText: { fontSize: 13.5, color: C.ink400, fontFamily: 'Inter', flex: 1 },

  categoryStrip: { gap: 9, paddingRight: Spacing.screenH },
  categoryTile: {
    alignItems: 'center', width: 76,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.white,
    borderRadius: 14, paddingVertical: 11, paddingHorizontal: 6,
  },
  categoryIconWell: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: '#f3f8fa',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 7,
  },
  categoryLabel: { fontSize: 11.5, fontWeight: '700', color: C.ink700, fontFamily: 'Inter', textAlign: 'center' },

  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 22 },
  emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
  emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

  jobCard: {
    backgroundColor: C.white, borderColor: C.line, borderWidth: 1,
    borderRadius: V6Radii.cardSm, padding: 15, marginBottom: 10,
    ...V6Shadows.sm,
  },
  jobTitleRow: { marginBottom: 5 },
  jobTitle: { color: C.ink900, fontSize: 17.5, fontWeight: '800', fontFamily: 'Inter' },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 11 },
  jobMeta: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', flex: 1 },
  jobBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  jobStatusText: { color: C.ink700, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
  jobAge: { color: C.ink400, fontSize: 13.5, fontFamily: 'Inter' },

  // Recent Activity — matches .activity-list/.activity-row
  activityList: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, overflow: 'hidden',
  },
  activityRow: { flexDirection: 'row', gap: 11, padding: 14, alignItems: 'flex-start' },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f3f6' },
  activityIcon: {
    width: 32, height: 32, borderRadius: 11,
    backgroundColor: '#f3f8fa', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  activityCopy: { flex: 1 },
  activityTitle: { color: C.ink900, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
  activityBody: { color: C.ink400, fontSize: 12, fontFamily: 'Inter', lineHeight: 15 },
});
