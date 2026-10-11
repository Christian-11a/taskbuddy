/**
 * HOCalendarScreen.tsx
 *
 * Figma "My Jobs · Calendar", the calendar view of My Jobs: a month card with
 * round chevrons, a dot on each day with jobs, today ringed and the picked day
 * filled. Below it the picked day's jobs, then the jobs not scheduled yet, all
 * as JobRows. App.tsx passes the title and the List/Calendar switch.
 */

import React, { ReactNode, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { Spacing, V6Shadows } from '../../../src/constants/theme';
import Tap from '../../../src/components/ui/Tap';
import JobRow from '../../../src/components/ui/JobRow';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import SectionHeader from '../../../src/components/ui/SectionHeader';
import { CalendarDay, CalendarWeekdays } from '../../../src/components/ui/MonthGrid';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useProposalCounts } from '../../../src/hooks/useProposalCounts';
import { api, type Job } from '../../../src/lib/api';
import { peso, plural } from '../../../src/lib/format';
import { jobRowStatus } from '../../../src/lib/jobRowStatus';
import {
  calendarMarks,
  dayHeading,
  jobsOnDay,
  monthTitle,
  shiftMonth,
  unscheduledJobs,
} from '../../../src/lib/jobCalendar';
import { dateKey } from '../../../src/lib/localDate';

interface HOCalendarScreenProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
  /** Screen title. My Jobs passes its own title so it doesn't change when the view switches. */
  title?: string;
  /** Rendered at the right end of the title row (App puts the List/Calendar switch here). */
  headerRight?: ReactNode;
}

/**
 * The calendar's own header (its title, arrows and weekday names) is hidden: the
 * month row and the weekday row above the grid replace it.
 */
const NoCalendarHeader = () => null;

const NAV_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };
const LINK_HIT_SLOP = { top: 15, bottom: 15, left: 8, right: 8 };

export default function HOCalendarScreen({ onNavigate, title = 'Calendar', headerRight }: HOCalendarScreenProps) {
  const { styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const todayKey = dateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [visibleMonth, setVisibleMonth] = useState<string>(todayKey);
  const { data, loading, error, reload } = useAsyncData(() => api.myJobs(), [], 'ho-jobs');
  const jobs = useMemo(() => data ?? [], [data]);
  const proposals = useProposalCounts(jobs);

  const dayJobs = useMemo(() => jobsOnDay(jobs, selectedDate, new Date()), [jobs, selectedDate]);
  const unscheduled = useMemo(() => unscheduledJobs(jobs), [jobs]);
  const marks = useMemo(() => calendarMarks(jobs, new Date(), selectedDate), [jobs, selectedDate]);

  // The title row stays up while jobs load, so switching views from the list
  // doesn't blank the header or the List/Calendar switch.
  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {headerRight}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        {header}
        <ScreenSkeleton variant="list" />
      </View>
    );
  }

  const renderJob = (job: Job) => {
    const status = jobRowStatus(job, proposals[job.id]);
    return (
      <JobRow
        key={job.id}
        title={job.title}
        meta={status.meta}
        tone={status.tone}
        amount={job.budget != null ? peso(job.budget) : ''}
        date={job.scheduled_at}
        onPress={() => onNavigate('Job Detail', job.id)}
      />
    );
  };

  return (
    <View style={styles.screen}>
      {header}

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.calendarCard}>
          <View style={styles.monthRow}>
            <Text style={styles.monthTitle} accessibilityRole="header">{monthTitle(visibleMonth)}</Text>
            <View style={styles.monthNav}>
              <Tap
                style={styles.navButton}
                hitSlop={NAV_HIT_SLOP}
                onPress={() => setVisibleMonth((month) => shiftMonth(month, -1))}
                accessibilityRole="button"
                accessibilityLabel="Previous month"
              >
                <ChevronLeft size={18} color={V6Colors.ink700} />
              </Tap>
              <Tap
                style={styles.navButton}
                hitSlop={NAV_HIT_SLOP}
                onPress={() => setVisibleMonth((month) => shiftMonth(month, 1))}
                accessibilityRole="button"
                accessibilityLabel="Next month"
              >
                <ChevronRight size={18} color={V6Colors.ink700} />
              </Tap>
            </View>
          </View>
          <CalendarWeekdays />
          <Calendar
            key={appearance}
            current={visibleMonth}
            customHeader={NoCalendarHeader}
            hideExtraDays
            firstDay={0}
            onMonthChange={(month) => setVisibleMonth(month.dateString)}
            onDayPress={(day) => setSelectedDate(day.dateString)}
            markedDates={marks}
            dayComponent={CalendarDay}
            theme={{
              calendarBackground: V6Colors.surface,
              backgroundColor: V6Colors.surface,
            }}
          />
        </View>

        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle} accessibilityRole="header">{dayHeading(selectedDate)}</Text>
          {!error && (
            <View style={styles.dayMeta}>
              <Text style={styles.dayCount}>{plural(dayJobs.length, 'job')}</Text>
              {selectedDate !== todayKey && (
                <Tap
                  onPress={() => {
                    setSelectedDate(todayKey);
                    setVisibleMonth(todayKey);
                  }}
                  hitSlop={LINK_HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Go to today"
                >
                  <Text style={styles.textLink}>Today</Text>
                </Tap>
              )}
            </View>
          )}
        </View>

        {!!error && <LoadErrorCard title="Couldn't load your schedule" message={error} onRetry={reload} />}

        {!error && dayJobs.length === 0 && (
          <EmptyCard>
            <EmptyRow
              icon={CalendarDays}
              title="No jobs on this day"
              body="Jobs with a scheduled date will show up here."
            />
          </EmptyCard>
        )}
        {!error && dayJobs.length > 0 && <View style={styles.rows}>{dayJobs.map(renderJob)}</View>}

        {!error && unscheduled.length > 0 && (
          <>
            <View style={styles.notScheduled}>
              <SectionHeader title="Not scheduled yet" count={unscheduled.length} />
            </View>
            <View style={styles.rows}>{unscheduled.map(renderJob)}</View>
          </>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },

    header: {
      backgroundColor: V6Colors.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: V6Colors.line,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    headerTitle: {
      flexShrink: 1, color: V6Colors.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3,
    },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    calendarCard: {
      backgroundColor: V6Colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: V6Colors.line,
      paddingHorizontal: 10,
      paddingTop: 12,
      paddingBottom: 8,
      ...V6Shadows.sm,
    },
    monthRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8,
    },
    monthTitle: { color: V6Colors.ink900, fontSize: 17, fontWeight: '700', fontFamily: 'Inter' },
    monthNav: { flexDirection: 'row', gap: 8 },
    navButton: {
      width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },

    dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 10 },
    dayTitle: { color: V6Colors.ink900, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
    dayMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dayCount: { color: V6Colors.ink500, fontSize: 13, fontWeight: '500', fontFamily: 'Inter' },
    textLink: { color: Colors.link, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },

    notScheduled: { marginTop: 20, marginBottom: 10 },
    rows: { gap: 8 },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
