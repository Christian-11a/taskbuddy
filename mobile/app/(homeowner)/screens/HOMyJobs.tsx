/**
 * HOMyJobs.tsx (HO - My Jobs List)
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-myjobs screen — white
 * topbar with a "+ New" action, underline-style .job-tabs, and .clean-job-card
 * rows. The calendar that used to be embedded here (before this screen
 * existed in the mockup as its own tab) now lives in HOCalendarScreen.tsx.
 *
 * Filters are All / Active / Completed / Cancelled (QA asked for fewer). The
 * card's status pill carries the fine-grained state (Open, Awaiting
 * Provider, Confirmed, In Progress).
 *
 * Each card carries the seven things a homeowner needs to tell one job from
 * another without opening it: name, location, status, urgency, price, how
 * long it has been up, and who is doing it.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
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
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { useAuth } from '../../../src/context/AuthContext';
import { jobStatusMeta, timeAgo } from '../../../src/lib/format';
import JobCard from '../../../src/components/JobCard';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';

// Grouped filters, not one per status: the status pill on each card already
// says exactly where a job is, so the tabs only need to split live work from
// finished work.
const FILTER_TABS = ['All', 'Active', 'Ongoing', 'Completed', 'Cancelled'] as const;
type FilterTab = (typeof FILTER_TABS)[number];

interface MyJobsProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function MyJobs({ onNavigate }: MyJobsProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [activeFilter, setActiveFilter] = useRetainedState<FilterTab>('ho.myJobs.filter', 'All');
  const [categoryId, setCategoryId] = useRetainedState<number | null>('ho.myJobs.category', null);
  const { profile } = useAuth();
  const categories = useAsyncData(() => api.categories(), []);
  const scroll = useRetainedScroll(`ho.myJobs.${activeFilter}.${categoryId ?? 'all'}`);
  const { data, loading, error, reload } = useAsyncData(() => api.myJobs({
    category_id: categoryId ?? undefined,
    status_group: activeFilter === 'All' ? undefined : activeFilter.toLowerCase() as 'active' | 'ongoing' | 'completed' | 'cancelled',
  }), [activeFilter, categoryId], `ho-jobs:${profile?.id}:${activeFilter}:${categoryId ?? 'all'}`);
  const jobs = data ?? [];
  const hasFilter = activeFilter !== 'All' || categoryId !== null;

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>My Jobs</Text>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => onNavigate('Create Job')}
            activeOpacity={0.8}
          >
            <Plus size={15} color={V6Colors.link} strokeWidth={2.5} />
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

      <View style={styles.categoriesWrap}>
        <Text style={styles.categoryLabel}>Service category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChips}>
          {[{ id: null, name: 'All services' }, ...(categories.data ?? [])].map((category) => (
            <TouchableOpacity key={category.id ?? 'all'} accessibilityRole="radio"
              accessibilityState={{ selected: categoryId === category.id }}
              onPress={() => setCategoryId(category.id)}
              style={[styles.categoryChip, categoryId === category.id && styles.categoryChipActive]}>
              <Text style={[styles.categoryText, categoryId === category.id && styles.categoryTextActive]}>{category.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {!!categories.error && <Text style={styles.stateText}>{categories.error}</Text>}
        {hasFilter && <TouchableOpacity onPress={() => { setActiveFilter('All'); setCategoryId(null); }}><Text style={styles.reset}>Clear filters</Text></TouchableOpacity>}
      </View>

      {/* Job list */}
      <ScrollView
        key={`${activeFilter}:${categoryId ?? 'all'}`}
        testID="my-jobs-list"
        {...scroll}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {loading && <ScreenSkeleton variant="list" />}
        {!!error && !loading && <View><Text style={styles.stateText}>{error}</Text><TouchableOpacity onPress={reload}><Text style={styles.reset}>Try again</Text></TouchableOpacity></View>}

        {!loading && !error && jobs.length === 0 && (
          <View style={styles.emptyState}>
            <ClipboardList size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>{hasFilter ? 'No matching jobs' : 'No jobs here yet'}</Text>
            <Text style={styles.emptyText}>
              {hasFilter ? 'Choose another status or service category, or clear the filters.' : 'Post a new job when you need help.'}
            </Text>
          </View>
        )}

        {!loading && !error && jobs.map((job, index) => (
          <JobCard
            key={job.id}
            testID={`my-jobs-card-${index}`}
            title={job.title}
            budget={job.budget}
            address={job.address}
            status={jobStatusMeta(job.status, V6Colors)}
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

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: V6Colors.line,
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
    newBtnText: { color: V6Colors.link, fontWeight: '700', fontSize: 14.5, fontFamily: 'Inter' },

    tabsWrap: { backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: Spacing.screenH },
    tabsContent: { gap: 24, paddingRight: Spacing.screenH },
    jobTab: { paddingVertical: 13, alignItems: 'center' },
    jobTabText: { color: C.ink400, fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter' },
    jobTabTextActive: { color: C.ink900, fontWeight: '800' },
    jobTabUnderline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: C.cyan700, borderRadius: 999 },

    categoriesWrap: { paddingHorizontal: Spacing.screenH, paddingVertical: 12, backgroundColor: C.surface },
    categoryLabel: { color: C.ink500, fontSize: 12, marginBottom: 8 },
    categoryChips: { gap: 8 },
    categoryChip: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
    categoryChipActive: { backgroundColor: C.cyan700, borderColor: C.cyan700 },
    categoryText: { color: C.ink700, fontSize: 13 },
    categoryTextActive: { color: C.onPrimary },
    reset: { color: V6Colors.link, paddingVertical: 10, textAlign: 'center', fontWeight: '600' },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
    emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
    emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },
  });
  return { Colors, V6Colors, C, styles };
}
