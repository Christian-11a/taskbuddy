/**
 * HOMyJobs.tsx (HO - My Jobs list)
 *
 * Figma "My Jobs · List": the title row (+ New, and the List/Calendar switch
 * that App passes in), one row of filter pills with counts, and the jobs under
 * date headings. Every job is a JobRow. All of the homeowner's jobs load once;
 * the filters, counts and groups are worked out on the device.
 */

import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CalendarCheck,
  CircleCheck,
  CircleX,
  ClipboardList,
  Hourglass,
  Inbox,
  Plus,
  type LucideIcon,
} from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { Spacing } from '../../../src/constants/theme';
import Tap from '../../../src/components/ui/Tap';
import FilterPill from '../../../src/components/ui/FilterPill';
import JobRow from '../../../src/components/ui/JobRow';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import StaleHint from '../../../src/components/ui/StaleHint';
import SlowLoadNote from '../../../src/components/ui/SlowLoadNote';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useRetainedScroll, useRetainedState } from '../../../src/hooks/useRetainedState';
import { isList } from '../../../src/lib/savedShapes';
import { useSlowLoad } from '../../../src/hooks/useSlowLoad';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useProposalCountsStatus } from '../../../src/hooks/useProposalCounts';
import { api } from '../../../src/lib/api';
import { peso } from '../../../src/lib/format';
import { jobRowStatus } from '../../../src/lib/jobRowStatus';
import {
  JOB_LIST_FILTERS,
  countJobsByFilter,
  filterPillCount,
  jobListSections,
  type JobListFilter,
} from '../../../src/lib/myJobsList';

/** What an empty filter says, and the icon for it. */
const EMPTY_COPY: Record<JobListFilter, { icon: LucideIcon; title: string; body: string }> = {
  all: { icon: ClipboardList, title: 'No jobs yet', body: 'Post a job when you need help.' },
  needs: { icon: Inbox, title: 'Nothing needs you', body: 'Open jobs with new proposals show up here.' },
  booked: { icon: CalendarCheck, title: 'No booked jobs', body: 'Jobs with a confirmed provider show up here.' },
  waiting: { icon: Hourglass, title: 'Nothing waiting', body: 'Open jobs that have no proposals yet show up here.' },
  done: { icon: CircleCheck, title: 'No completed jobs', body: 'Jobs you finish show up here.' },
  closed: { icon: CircleX, title: 'No cancelled or expired jobs', body: 'Jobs you cancel, or that expire, show up here.' },
};

interface MyJobsProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
  /** Rendered at the right end of the title row (App puts the List/Calendar switch here). */
  headerRight?: ReactNode;
}

export default function MyJobs({ onNavigate, headerRight }: MyJobsProps) {
  const { Colors, V6Colors, styles } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [filter, setFilter] = useRetainedState<JobListFilter>('ho.myJobs.filter', 'all');
  const scroll = useRetainedScroll(`ho.myJobs.${filter}`);
  const { data, loading, error, reload, stale, refreshing: fetching } = useAsyncData(
    () => api.myJobs(),
    [],
    'ho-jobs',
    { persist: true, validate: isList },
  );
  const [refreshing, setRefreshing] = useState(false);
  // useAsyncData's reload() is fire-and-forget; a new `data` or `error` means the fetch settled.
  useEffect(() => {
    setRefreshing(false);
  }, [data, error]);

  const jobs = useMemo(() => data ?? [], [data]);
  const { counts: proposals, loading: proposalsLoading } = useProposalCountsStatus(jobs);
  const counts = useMemo(() => countJobsByFilter(jobs, proposals), [jobs, proposals]);
  const sections = useMemo(
    () => jobListSections(jobs, filter, proposals, new Date()),
    [jobs, filter, proposals],
  );
  // Each job's position in the list, for the my-jobs-card-N test ids the maestro flows use.
  const positions = useMemo(
    () => new Map(sections.flatMap((section) => section.jobs).map((job, index): [string, number] => [job.id, index])),
    [sections],
  );
  // Rows show whenever there is data, even when a refresh failed: the hint says it is saved data.
  const settled = !loading && data !== null;
  const slow = useSlowLoad(loading, data !== null);
  const empty = EMPTY_COPY[filter];

  const onRefresh = () => {
    setRefreshing(true);
    reload();
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: headerTop }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>My Jobs</Text>
          <View style={styles.titleActions}>
            <Tap
              style={styles.newButton}
              onPress={() => onNavigate('Create Job')}
              accessibilityRole="button"
              accessibilityLabel="New job"
              hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            >
              <Plus size={16} color={Colors.link} strokeWidth={2.5} />
              <Text style={styles.newText}>New</Text>
            </Tap>
            {headerRight}
          </View>
        </View>
      </View>

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          testID="my-jobs-filters"
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {JOB_LIST_FILTERS.map(({ key, label }) => (
            <FilterPill
              key={key}
              label={label}
              count={settled ? filterPillCount(key, counts, proposalsLoading) : undefined}
              selected={filter === key}
              onPress={() => setFilter(key)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        key={filter}
        testID="my-jobs-list"
        {...scroll}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={V6Colors.link}
            colors={[V6Colors.link]}
          />
        }
      >
        <StaleHint stale={stale} refreshing={fetching} error={error} onRetry={reload} />
        {slow && <SlowLoadNote />}
        {loading && <ScreenSkeleton variant="list" />}
        {!!error && !loading && data === null && (
          <LoadErrorCard title="Couldn't load your jobs" message={error} onRetry={reload} />
        )}

        {settled && sections.length === 0 && (
          <EmptyCard>
            <EmptyRow
              icon={empty.icon}
              title={empty.title}
              body={empty.body}
              actionLabel={filter === 'all' ? 'Post a job' : undefined}
              onAction={filter === 'all' ? () => onNavigate('Create Job') : undefined}
            />
          </EmptyCard>
        )}

        {settled && sections.map((section) => (
          <View key={section.key} style={styles.section}>
            {!!section.label && (
              <Text style={styles.sectionLabel} accessibilityRole="header">{section.label}</Text>
            )}
            <View style={styles.rows}>
              {section.jobs.map((job) => {
                const status = jobRowStatus(job, proposals[job.id]);
                return (
                  <JobRow
                    key={job.id}
                    testID={`my-jobs-card-${positions.get(job.id)}`}
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
          </View>
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },

    topBar: { backgroundColor: V6Colors.surface, paddingHorizontal: Spacing.screenH, paddingBottom: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    title: {
      flexShrink: 1, color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 21.5, fontWeight: '800', letterSpacing: -0.3,
    },
    titleActions: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
    newButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 4 },
    newText: { color: Colors.link, fontFamily: 'Inter', fontSize: 14.5, fontWeight: '700' },

    filterBar: { backgroundColor: V6Colors.surface, borderBottomWidth: 1, borderBottomColor: V6Colors.line },
    filterScroll: { flexGrow: 0 },
    filterRow: { gap: 8, paddingHorizontal: Spacing.screenH, paddingVertical: 12 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },
    section: { marginBottom: 18 },
    sectionLabel: {
      color: V6Colors.ink500, fontFamily: 'Inter', fontSize: 12, fontWeight: '700', letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 8,
    },
    rows: { gap: 8 },
  });
  return { Colors, V6Colors, styles };
}
