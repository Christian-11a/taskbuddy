/**
 * MyJobs.tsx (HO - My Jobs List)
 *
 * Figma Source: "HO - My Jobs List" (id: 46:850)
 *
 * Design:
 * - Dark teal header with title "My Jobs" and filter tabs
 * - Job cards list with status indicators
 * - Floating action button for creating new job
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CalendarDays, ClipboardList, MapPin, Plus, UserRound, WalletCards } from 'lucide-react-native';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { jobFilterBucket, jobStatusMeta, peso, timeAgo } from '../../../src/lib/format';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';

const FILTER_TABS = ['All', 'Active', 'Pending', 'Completed'];

interface MyJobsProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function MyJobs({ onNavigate }: MyJobsProps) {
  const [activeFilter, setActiveFilter] = useState('All');
  const { data, loading, error } = useAsyncData(() => api.myJobs(), []);
  const jobs = data ?? [];

  const filtered =
    activeFilter === 'All'
      ? jobs
      : jobs.filter((j) => jobFilterBucket(j.status) === activeFilter);

  if (loading) return <ScreenSkeleton variant="list" />;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View>
            <Text style={styles.headerSubtitle}>Customer · Calendar</Text>
            <Text style={styles.headerTitle}>My Jobs</Text>
          </View>
          <View style={styles.jobsBadge}>
            <Text style={styles.jobsBadgeText}>{jobs.length} jobs</Text>
          </View>
        </View>

        {/* Filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabsContent}
        >
          {FILTER_TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.filterTab, activeFilter === tab && styles.filterTabActive]}
              onPress={() => setActiveFilter(tab)}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterTabText, activeFilter === tab && styles.filterTabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Jobs list */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}
        {!loading && !error && filtered.length === 0 && (
          <View style={styles.emptyState}>
            <ClipboardList size={40} color={Colors.brandTeal} />
            <Text style={styles.emptyTitle}>{jobs.length === 0 ? 'No jobs yet' : 'No matching jobs'}</Text>
            <Text style={styles.stateText}>{jobs.length === 0 ? 'Post a job to find the right service provider.' : 'Try another filter to see your jobs.'}</Text>
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
              <View style={[styles.jobBar, { backgroundColor: meta.color }]} />
              <View style={styles.jobContent}>
                <View style={styles.jobCardHeader}>
                  <Text style={styles.jobTitle}>{job.title}</Text>
                  <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
                <Text style={styles.jobCategory}>{job.service_categories?.name ?? ''}</Text>
                <View style={styles.jobLocationRow}>
                  <MapPin size={13} color={Colors.slate} />
                  <Text style={styles.jobLocation}>{job.address}</Text>
                </View>
                <View style={styles.jobFooter}>
                  <View style={styles.jobDetails}>
                    <View style={styles.jobMetaItem}>
                      <CalendarDays size={13} color={Colors.slate} />
                      <Text style={styles.jobMeta}>{timeAgo(job.posted_at)}</Text>
                    </View>
                    <View style={styles.jobMetaItem}>
                      <WalletCards size={13} color={Colors.slate} />
                      <Text style={styles.jobMeta}>{job.budget != null ? peso(job.budget) : 'Budget not set'}</Text>
                    </View>
                    <View style={styles.jobMetaItem}>
                      <UserRound size={13} color={Colors.slate} />
                      <Text style={styles.jobMeta}>{job.assigned_provider?.full_name ?? 'No provider assigned yet'}</Text>
                    </View>
                  </View>
                  <Text style={styles.jobUrgency}>{job.urgency}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* FAB - Create Job */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => onNavigate('Create Job')}
        activeOpacity={0.85}
      >
        <Plus size={28} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.brandDark,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginBottom: 16,
  },
  headerSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: 'Inter', marginBottom: 2 },
  headerTitle: { color: Colors.white, fontSize: 24, fontWeight: '800', fontFamily: 'Inter' },
  jobsBadge: {
    backgroundColor: Colors.brandTeal, borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  jobsBadgeText: { color: Colors.white, fontWeight: '700', fontSize: 13, fontFamily: 'Inter' },

  filterTabsContent: { gap: 8, paddingRight: 4 },
  filterTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  filterTabActive: { backgroundColor: Colors.white },
  filterTabText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  filterTabTextActive: { color: Colors.brandDark },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 28, paddingBottom: 80 },

  jobCard: {
    backgroundColor: Colors.white, borderRadius: Radii.card,
    marginBottom: 14, flexDirection: 'row', overflow: 'hidden',
    ...Shadows.card,
  },
  jobBar: { width: 5, borderRadius: 0 },
  jobContent: { flex: 1, padding: 16 },
  jobCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  jobTitle: { color: Colors.brandDark, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', flex: 1, marginRight: 8 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 11, fontWeight: '600', fontFamily: 'Inter' },
  jobCategory: { color: Colors.brandTeal, fontSize: 12, fontWeight: '600', fontFamily: 'Inter', marginBottom: 4 },
  jobLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  jobLocation: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  jobMetaRow: { marginBottom: 10 },
  jobMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  jobMeta: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  jobFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  jobDetails: { gap: 5, flex: 1, marginRight: 8 },
  jobProviderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  jobProvider: { color: Colors.muted, fontSize: 12, fontFamily: 'Inter' },
  jobUrgency: { color: Colors.brandTeal, fontSize: 12, fontWeight: '700', fontFamily: 'Inter', textTransform: 'capitalize' },
  stateText: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { color: Colors.brandDark, fontSize: 17, fontWeight: '800', fontFamily: 'Inter', marginTop: 12 },

  fab: {
    position: 'absolute', bottom: 24, right: Spacing.screenH,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.brandTeal,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.brandTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  fabText: { color: Colors.white, fontSize: 28, fontWeight: '300', lineHeight: 32 },
});
