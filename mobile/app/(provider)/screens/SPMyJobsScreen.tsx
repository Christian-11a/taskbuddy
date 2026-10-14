/**
 * SPMyJobsScreen.tsx ("My Work" tab, list view)
 *
 * Figma "My Work · list" (79:2636): the title row with the List/Calendar switch
 * that App passes in, one row of filter pills with counts, and the jobs under
 * status headings. Every job is a JobRow. The hired jobs and the proposals each
 * load once; the rows, counts and groups are worked out on the device
 * (src/lib/myWork.ts).
 */

import React, { ReactNode, useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Briefcase,
  CalendarCheck,
  CircleCheck,
  CircleX,
  FileText,
  Hammer,
  type LucideIcon,
} from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { Spacing } from '../../../src/constants/theme';
import FilterPill from '../../../src/components/ui/FilterPill';
import JobRow from '../../../src/components/ui/JobRow';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import StaleHint from '../../../src/components/ui/StaleHint';
import SlowLoadNote from '../../../src/components/ui/SlowLoadNote';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useRetainedScroll, useRetainedState } from '../../../src/hooks/useRetainedState';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { isList } from '../../../src/lib/savedShapes';
import { useSlowLoad } from '../../../src/hooks/useSlowLoad';
import { api } from '../../../src/lib/api';
import { peso } from '../../../src/lib/format';
import { SPScreen } from '../../../src/types/navigation';
import {
  MY_WORK_FILTERS,
  buildMyWorkRows,
  countMyWork,
  myWorkSections,
  type MyWorkApplication,
  type MyWorkFilter,
} from '../../../src/lib/myWork';

/** What an empty filter says, and the icon for it. */
const EMPTY_COPY: Record<MyWorkFilter, { icon: LucideIcon; title: string; body: string }> = {
  all: {
    icon: Briefcase,
    title: 'No jobs yet',
    body: 'Send a proposal on an open job. Jobs you are hired for show up here.',
  },
  applied: {
    icon: FileText,
    title: 'No open proposals',
    body: 'Find an open job and submit a proposal. Jobs you are hired for move to Booked.',
  },
  booked: {
    icon: CalendarCheck,
    title: 'No booked jobs',
    body: 'Jobs will move here after a client hires you.',
  },
  working: {
    icon: Hammer,
    title: 'Nothing in progress',
    body: 'Jobs you have started show up here.',
  },
  done: {
    icon: CircleCheck,
    title: 'No completed jobs',
    body: 'Jobs you finish show up here.',
  },
  closed: {
    icon: CircleX,
    title: 'Nothing closed',
    body: 'Cancelled and expired jobs, and proposals that were not picked, show up here.',
  },
};

interface SPMyJobsScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string) => void;
  /** Rendered at the right end of the title row (App puts the List/Calendar switch here). */
  headerRight?: ReactNode;
}

export default function SPMyJobsScreen({ onNavigate, headerRight }: SPMyJobsScreenProps) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  // Retained so going back from a job lands on the filter it was opened from.
  const [filter, setFilter] = useRetainedState<MyWorkFilter>('sp.myWork.filter', 'all');
  const scroll = useRetainedScroll(`sp.myWork.${filter}`);

  const applications = useAsyncData(
    () => api.myApplications() as Promise<MyWorkApplication[]>,
    [],
    'sp-applications',
    { persist: true, validate: isList },
  );
  const assigned = useAsyncData(() => api.assignedJobs(), [], 'sp-assigned', { persist: true, validate: isList });

  const loading = applications.loading || assigned.loading;
  const error = applications.error ?? assigned.error;
  // The rows need both lists. With both on screen (saved or fetched) the rows stay up through a failed refresh,
  // and the hint says the data is saved.
  const hasData = applications.data !== null && assigned.data !== null;
  const settled = !loading && hasData;
  const slow = useSlowLoad(loading, hasData);
  const reload = () => {
    applications.reload();
    assigned.reload();
  };
  // Pull-to-refresh spins until both lists have settled.
  const refreshing = applications.refreshing || assigned.refreshing;

  const rows = useMemo(
    () => buildMyWorkRows(applications.data ?? [], assigned.data ?? []),
    [applications.data, assigned.data],
  );
  const counts = useMemo(() => countMyWork(rows), [rows]);
  const sections = useMemo(() => myWorkSections(rows, filter), [rows, filter]);
  const empty = EMPTY_COPY[filter];

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: headerTop }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>My Work</Text>
          {headerRight}
        </View>
      </View>

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          testID="my-work-filters"
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {MY_WORK_FILTERS.map(({ key, label }) => (
            <FilterPill
              key={key}
              label={label}
              count={settled ? counts[key] : undefined}
              selected={filter === key}
              onPress={() => setFilter(key)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        key={filter}
        testID="my-work-list"
        {...scroll}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={V6Colors.link} colors={[V6Colors.link]} />
        }
      >
        <StaleHint
          stale={hasData && (applications.stale || assigned.stale)}
          refreshing={refreshing}
          error={hasData ? error : null}
          onRetry={reload}
        />
        {slow && <SlowLoadNote />}
        {loading && <ContentSkeleton variant="list" />}
        {!!error && !loading && !hasData && (
          <LoadErrorCard title="Couldn't load your jobs" message={error} onRetry={reload} />
        )}

        {settled && sections.length === 0 && (
          <EmptyCard>
            <EmptyRow icon={empty.icon} title={empty.title} body={empty.body} />
          </EmptyCard>
        )}

        {settled && sections.map((section) => (
          <View key={section.group} style={styles.section}>
            {!!section.label && (
              <Text style={styles.sectionLabel} accessibilityRole="header">{section.label}</Text>
            )}
            <View style={styles.rows}>
              {section.rows.map((row) => (
                <JobRow
                  key={row.key}
                  title={row.title}
                  meta={row.meta}
                  tone={row.tone}
                  amount={row.budget != null ? peso(row.budget) : ''}
                  date={row.scheduledAt}
                  onPress={() => onNavigate('Job Detail', row.jobId)}
                />
              ))}
            </View>
          </View>
        ))}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },

    topBar: { backgroundColor: V6Colors.surface, paddingHorizontal: Spacing.screenH, paddingBottom: 12 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    title: {
      flexShrink: 1, color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 21.5, fontWeight: '800', letterSpacing: -0.3,
    },

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
  return { V6Colors, styles };
}
