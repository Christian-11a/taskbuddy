/**
 * HOMyJobs.tsx (HO - My Jobs List)
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-myjobs screen — white
 * topbar with a "+ New" action, underline-style .job-tabs, and .clean-job-card
 * rows. The calendar that used to be embedded here (before this screen
 * existed in the mockup as its own tab) now lives in HOCalendarScreen.tsx.
 *
 * The mockup's filter tabs (All/Open/Hired/Active/Review/Done) don't map
 * cleanly onto this app's real job-status enum — there's no "hired" or
 * "pending-review" state in the backend — so the tabs here use real buckets
 * (All/Open/Assigned/Active/Completed) with the mockup's exact tab styling.
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ClipboardList, MapPin, Plus } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { jobStatusMeta, peso } from '../../../src/lib/format';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';

const C = V6Colors;

const FILTER_TABS = ['All', 'Open', 'Assigned', 'Active', 'Completed'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

function matchesFilter(status: string, filter: FilterTab): boolean {
  switch (filter) {
    case 'All':
      return true;
    case 'Open':
      return status === 'open' || status === 'recommending';
    case 'Assigned':
      return status === 'assigned';
    case 'Active':
      return status === 'in_progress';
    case 'Completed':
      return status === 'completed';
  }
}

interface MyJobsProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function MyJobs({ onNavigate }: MyJobsProps) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
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
          horizontal
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
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
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

        {filtered.map((job) => {
          const meta = jobStatusMeta(job.status);
          return (
            <TouchableOpacity
              key={job.id}
              style={styles.jobCard}
              onPress={() => onNavigate('Job Detail', job.id)}
              activeOpacity={0.9}
            >
              <View style={styles.jobTopRow}>
                <Text style={styles.jobTitle} numberOfLines={1}>{job.title}</Text>
                {job.budget != null && <Text style={styles.jobPrice}>{peso(job.budget)}</Text>}
              </View>
              <View style={styles.jobMetaRow}>
                <MapPin size={14} color={C.ink400} />
                <Text style={styles.jobMeta} numberOfLines={1}>{job.address}</Text>
              </View>
              <View style={styles.jobBottomRow}>
                <View style={styles.jobStatus}>
                  <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                  <Text style={styles.jobStatusText}>{meta.label}</Text>
                </View>
                <Text style={styles.jobProvider} numberOfLines={1}>
                  {job.assigned_provider?.full_name ?? 'Waiting for a provider'}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

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
  tabsContent: { gap: 24 },
  jobTab: { paddingVertical: 13, alignItems: 'center' },
  jobTabText: { color: C.ink400, fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter' },
  jobTabTextActive: { color: C.ink900, fontWeight: '800' },
  jobTabUnderline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: C.cyan700, borderRadius: 999 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

  jobCard: {
    backgroundColor: C.white, borderRadius: V6Radii.cardSm,
    marginBottom: 10, padding: 15,
    borderWidth: 1, borderColor: C.line,
    ...V6Shadows.sm,
  },
  jobTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 5 },
  jobTitle: { color: C.ink900, fontSize: 15.5, fontWeight: '800', fontFamily: 'Inter', flex: 1 },
  jobPrice: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  jobMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 11 },
  jobMeta: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter', flex: 1 },
  jobBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  jobStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  jobStatusText: { color: C.ink700, fontSize: 12.5, fontWeight: '700', fontFamily: 'Inter' },
  jobProvider: { color: C.ink500, fontSize: 12.5, fontWeight: '600', fontFamily: 'Inter' },

  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
  emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },
});
