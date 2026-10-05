/**
 * SPMyJobsScreen.tsx ("My Work" tab)
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-myjobs screen — a flat
 * white .topbar (not a colored hero), .job-tabs underline-style filter tabs,
 * and individual `.card` rows (not a single merged list surface).
 *
 * Four tabs, and a job is only ever in one of them:
 *   Applications — proposals still in play or turned down (pending, not
 *     selected, withdrawn). Once a client hires this provider the job moves
 *     to Active, so it no longer shows here as "Hired" at the same time.
 *   Active — hired work: awaiting this provider's confirmation, confirmed,
 *     or in progress, labelled from the provider's side.
 *   Completed.
 *   Cancelled — a booking this provider declined, or the client cancelled
 *     (indistinguishable in the data today), plus jobs that expired.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React from 'react';
import { useRetainedScroll, useRetainedState } from '../../../src/hooks/useRetainedState';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import { Briefcase, CalendarDays, FileText } from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import JobCard from '../../../src/components/JobCard';

import { SPScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { providerJobStatusMeta, shortDate } from '../../../src/lib/format';

const TABS = ['Applications', 'Active', 'Completed', 'Cancelled'] as const;
type Tab = (typeof TABS)[number];

interface ApplicationRow {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  jobs: {
    id: string;
    title: string;
    status: string;
    urgency: string;
    address: string;
    budget?: number | null;
    service_categories?: { name: string } | null;
  };
}

interface SPMyJobsScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string) => void;
}

export default function SPMyJobsScreen({ onNavigate }: SPMyJobsScreenProps) {
  const { C, APP_STATUS, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  // Retained so going back from a job lands on the filter it was opened from.
  const [tab, setTab] = useRetainedState<Tab>('sp.myWork.tab', 'Applications');
  const scroll = useRetainedScroll(`sp.myWork.${tab}`);

  const { data: applications, loading: loadingApps } = useAsyncData(
    () => api.myApplications() as Promise<ApplicationRow[]>,
    [],
    'sp-applications',
  );
  const { data: assigned, loading: loadingAssigned } = useAsyncData(
    () => api.assignedJobs(),
    [],
    'sp-assigned',
  );

  // Confirmed bookings and started work belong in Active. Legacy assigned
  // records remain visible until migration 0039 promotes them to confirmed.
  const activeJobs = (assigned ?? []).filter((j) =>
    ['assigned', 'confirmed', 'in_progress'].includes(j.status),
  );
  const completedJobs = (assigned ?? []).filter((j) => j.status === 'completed');
  const cancelledJobs = (assigned ?? []).filter(
    (j) => j.status === 'cancelled' || j.status === 'expired',
  );
  // Hired proposals live under Active from here on (see header comment).
  const openApplications = (applications ?? []).filter((a) => a.status !== 'accepted');
  const loading = tab === 'Applications' ? loadingApps : loadingAssigned;

  const jobsForTab: Record<Exclude<Tab, 'Applications'>, typeof activeJobs> = {
    Active: activeJobs,
    Completed: completedJobs,
    Cancelled: cancelledJobs,
  };

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle}>My Work</Text>
      </View>

      {/* Filter tabs — matches .job-tabs (underline style) */}
      <View style={styles.tabsWrap}>
        {TABS.map((t) => (
          <Tap key={t} style={styles.jobTab} onPress={() => setTab(t)} activeOpacity={0.7}>
            <Text style={[styles.jobTabText, tab === t && styles.jobTabTextActive]}>{t}</Text>
            {tab === t && <View style={styles.jobTabUnderline} />}
          </Tap>
        ))}
      </View>

      <ScrollView key={tab} {...scroll} style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {loading && <ContentSkeleton variant="list" />}

        {tab === 'Applications' && !loading && (
          openApplications.length === 0 ? (
            <View style={styles.emptyState}>
              <FileText size={30} color={C.ink300} />
              <Text style={styles.emptyTitle}>No open proposals</Text>
              <Text style={styles.emptyText}>
                Find an open job and submit a proposal. Jobs you're hired for appear under Active.
              </Text>
            </View>
          ) : (
            openApplications.map((app) => (
              <JobCard
                key={app.id}
                title={app.jobs.title}
                budget={app.jobs.budget}
                address={app.jobs.address}
                status={APP_STATUS[app.status]}
                urgency={app.jobs.urgency}
                pills={app.jobs.service_categories?.name
                  ? [{ label: app.jobs.service_categories.name, color: C.ink700, bg: C.ink50 }]
                  : []}
                onPress={() => onNavigate('Job Detail', app.jobs.id)}
              />
            ))
          )
        )}

        {tab !== 'Applications' && !loading && (
          jobsForTab[tab].length === 0 ? (
            <View style={styles.emptyState}>
              <Briefcase size={30} color={C.ink300} />
              <Text style={styles.emptyTitle}>No {tab.toLowerCase()} jobs</Text>
              <Text style={styles.emptyText}>
                {tab === 'Cancelled'
                  ? 'Bookings you decline or that get cancelled will appear here.'
                  : 'Jobs will move here after a client hires you.'}
              </Text>
            </View>
          ) : (
            jobsForTab[tab].map((job) => (
              <JobCard
                key={job.id}
                title={job.title}
                budget={job.budget}
                address={job.address}
                status={providerJobStatusMeta(job.status, V6Colors)}
                urgency={job.urgency}
                footer={[{
                  icon: <CalendarDays size={13} color={C.ink400} />,
                  text: job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible schedule',
                }]}
                onPress={() => onNavigate('Job Detail', job.id)}
              />
            ))
          )
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const APP_STATUS: Record<ApplicationRow['status'], { label: string; color: string; bg: string }> = {
    pending: { label: 'Proposal sent', color: V6Colors.warningText, bg: V6Colors.warningSurface },
    accepted: { label: 'Hired', color: V6Colors.successText, bg: V6Colors.successSurface },
    rejected: { label: 'Not selected', color: V6Colors.ink500, bg: V6Colors.canvas },
    withdrawn: { label: 'Withdrawn', color: V6Colors.ink500, bg: V6Colors.canvas },
  };
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

    tabsWrap: { flexDirection: 'row', gap: 24, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: Spacing.screenH },
    jobTab: { paddingVertical: 13, alignItems: 'center' },
    jobTabText: { color: C.ink400, fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter' },
    jobTabTextActive: { color: C.ink900, fontWeight: '800' },
    jobTabUnderline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: C.cyan700, borderRadius: 999 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
    emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

  });
  return { Colors, V6Colors, C, APP_STATUS, styles };
}
