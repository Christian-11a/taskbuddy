/**
 * HOMyJobs.tsx (HO - My Jobs List)
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-myjobs screen — white
 * topbar with a "+ New" action, underline-style .job-tabs, and .clean-job-card
 * rows. The calendar that used to be embedded here (before this screen
 * existed in the mockup as its own tab) now lives in HOCalendarScreen.tsx.
 *
 * The mockup's filter tabs (All/Open/Hired/Active/Review/Done) don't map
 * cleanly onto this app's real job-status enum — there's no "pending-review"
 * state in the backend — so the tabs here follow the real lifecycle
 * (All/Open/Awaiting/Confirmed/In Progress/Completed/Cancelled) with the
 * mockup's exact tab styling.
 *
 * Each card carries the seven things a homeowner needs to tell one job from
 * another without opening it: name, location, status, urgency, price, how
 * long it has been up, and who is doing it.
 */

import React from 'react';
import { useRetainedScroll, useRetainedState } from '../../../src/hooks/useRetainedState';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ClipboardList, Clock, Plus, User } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { jobStatusMeta, timeAgo } from '../../../src/lib/format';
import JobCard from '../../../src/components/JobCard';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';

const C = V6Colors;

const FILTER_TABS = [
  'All',
  'Open',
  'Awaiting',
  'Confirmed',
  'In Progress',
  'Completed',
  'Cancelled',
] as const;
type FilterTab = (typeof FILTER_TABS)[number];

function matchesFilter(status: string, filter: FilterTab): boolean {
  switch (filter) {
    case 'All':
      return true;
    case 'Open':
      return status === 'open' || status === 'recommending';
    // Hired, but the provider has not answered yet.
    case 'Awaiting':
      return status === 'assigned';
    case 'Confirmed':
      return status === 'confirmed';
    case 'In Progress':
      return status === 'in_progress';
    case 'Completed':
      return status === 'completed';
    case 'Cancelled':
      return status === 'cancelled' || status === 'expired';
  }
}

interface MyJobsProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function MyJobs({ onNavigate }: MyJobsProps) {
  const [activeFilter, setActiveFilter] = useRetainedState<FilterTab>('ho.myJobs.filter', 'All');
  const scroll = useRetainedScroll(`ho.myJobs.${activeFilter}`);
  const { data, loading, error } = useAsyncData(() => api.myJobs(), [], 'ho-jobs');
  const jobs = data ?? [];

  const filtered = jobs.filter((j) => matchesFilter(j.status, activeFilter));

  if (loading) return <ScreenSkeleton variant="list" />;

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>My Jobs</Text>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => onNavigate('Create Job')}
            activeOpacity={0.8}
          >
            <Plus size={15} color={C.cyan700} strokeWidth={2.5} />
            <Text style={styles.newBtnText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter tabs — matches .job-tabs (underline style) */}
      <View style={styles.tabsWrap}>
        <ScrollView
          testID="my-jobs-tabs"
          horizontal
          alwaysBounceHorizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
        >
          {FILTER_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={styles.jobTab}
              onPress={() => setActiveFilter(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.jobTabText, activeFilter === tab && styles.jobTabTextActive]}>
                {tab}
              </Text>
              {activeFilter === tab && <View style={styles.jobTabUnderline} />}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Job list */}
      <ScrollView
        key={activeFilter}
        {...scroll}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

        {!loading && !error && filtered.length === 0 && (
          <View style={styles.emptyState}>
            <ClipboardList size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>{jobs.length === 0 ? 'No jobs here yet' : 'No matching jobs'}</Text>
            <Text style={styles.emptyText}>
              {jobs.length === 0 ? 'Post a new job when you need help.' : 'Jobs will appear here as their status changes.'}
            </Text>
          </View>
        )}

        {filtered.map((job, index) => (
          <JobCard
            key={job.id}
            testID={`my-jobs-card-${index}`}
            title={job.title}
            budget={job.budget}
            address={job.address}
            status={jobStatusMeta(job.status)}
            urgency={job.urgency}
            footer={[
              {
                icon: <User size={13} color={C.ink400} />,
                text: job.assigned_provider?.full_name ?? 'No provider yet',
              },
              // Elapsed since posting — how long this has been waiting.
              { icon: <Clock size={13} color={C.ink400} />, text: timeAgo(job.posted_at) },
            ]}
            onPress={() => onNavigate('Job Detail', job.id)}
          />
        ))}

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
    borderBottomWidth: 1,
    borderBottomColor: '#edf1f4',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 4,
  },
  newBtnText: { color: C.cyan700, fontWeight: '700', fontSize: 14.5, fontFamily: 'Inter' },

  tabsWrap: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: Spacing.screenH },
  tabsContent: { gap: 24, paddingRight: Spacing.screenH },
  jobTab: { paddingVertical: 13, alignItems: 'center' },
  jobTabText: { color: C.ink400, fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter' },
  jobTabTextActive: { color: C.ink900, fontWeight: '800' },
  jobTabUnderline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: C.cyan700, borderRadius: 999 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
  emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },
});
