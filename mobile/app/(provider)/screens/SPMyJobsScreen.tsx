/**
 * SPMyJobsScreen.tsx ("My Work" tab)
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-myjobs screen — a flat
 * white .topbar (not a colored hero), .job-tabs underline-style filter tabs,
 * and individual `.card` rows (not a single merged list surface).
 *
 * Three tabs, and a job is only ever in one of them:
 *   Applications — proposals still in play or turned down (pending, not
 *     selected, withdrawn). Once a client hires this provider the job moves
 *     to Active, so it no longer shows here as "Hired" at the same time.
 *   Active — hired work: awaiting this provider's confirmation, confirmed,
 *     or in progress, labelled from the provider's side.
 *   Completed.
 */

import React from 'react';
import { useRetainedScroll, useRetainedState } from '../../../src/hooks/useRetainedState';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Briefcase, CalendarDays, FileText } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';
import JobCard from '../../../src/components/JobCard';

const C = V6Colors;
import { SPScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { providerJobStatusMeta, shortDate } from '../../../src/lib/format';

const TABS = ['Applications', 'Active', 'Completed'] as const;
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

const APP_STATUS: Record<ApplicationRow['status'], { label: string; color: string; bg: string }> = {
  pending: { label: 'Proposal sent', color: '#9a6700', bg: '#FFF7ED' },
  accepted: { label: 'Hired', color: '#15803d', bg: '#F0FDF4' },
  rejected: { label: 'Not selected', color: '#64748b', bg: '#F1F5F9' },
  withdrawn: { label: 'Withdrawn', color: '#64748b', bg: '#F1F5F9' },
};

interface SPMyJobsScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string) => void;
}

export default function SPMyJobsScreen({ onNavigate }: SPMyJobsScreenProps) {
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

  // 'assigned' is a booking request awaiting this provider's answer and
  // 'confirmed' one they accepted — both are live work, so both are Active.
  const activeJobs = (assigned ?? []).filter((j) =>
    ['assigned', 'confirmed', 'in_progress'].includes(j.status),
  );
  const completedJobs = (assigned ?? []).filter((j) => j.status === 'completed');
  // Hired proposals live under Active from here on (see header comment).
  const openApplications = (applications ?? []).filter((a) => a.status !== 'accepted');
  const loading = tab === 'Applications' ? loadingApps : loadingAssigned;

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Work</Text>
      </View>

      {/* Filter tabs — matches .job-tabs (underline style) */}
      <View style={styles.tabsWrap}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={styles.jobTab} onPress={() => setTab(t)} activeOpacity={0.7}>
            <Text style={[styles.jobTabText, tab === t && styles.jobTabTextActive]}>{t}</Text>
            {tab === t && <View style={styles.jobTabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView key={tab} {...scroll} style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator style={{ marginTop: 30 }} color={C.cyan700} />}

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
          (tab === 'Active' ? activeJobs : completedJobs).length === 0 ? (
            <View style={styles.emptyState}>
              <Briefcase size={30} color={C.ink300} />
              <Text style={styles.emptyTitle}>No {tab.toLowerCase()} jobs</Text>
              <Text style={styles.emptyText}>Jobs will move here after a client hires you.</Text>
            </View>
          ) : (
            (tab === 'Active' ? activeJobs : completedJobs).map((job) => (
              <JobCard
                key={job.id}
                title={job.title}
                budget={job.budget}
                address={job.address}
                status={providerJobStatusMeta(job.status)}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

  tabsWrap: { flexDirection: 'row', gap: 24, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: Spacing.screenH },
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
