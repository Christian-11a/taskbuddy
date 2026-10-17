/**
 * SPCalendarScreen.tsx (My Work · Calendar view)
 *
 * Figma "My Work · calendar" (144:7290): the calendar of My Jobs, for the
 * provider. A month card with round chevrons, a dot on each day with a booking,
 * today ringed and the picked day filled. Below it, the picked day's bookings
 * as JobRows. App.tsx passes the title and the List/Calendar switch.
 */

import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { Spacing, V6Shadows } from '../../../src/constants/theme';
import Tap from '../../../src/components/ui/Tap';
import JobRow from '../../../src/components/ui/JobRow';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import { CalendarDay, CalendarWeekdays, type CalendarDayProps } from '../../../src/components/ui/MonthGrid';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { api, type Booking } from '../../../src/lib/api';
import { plural, timeOfDay } from '../../../src/lib/format';
import { bookingCounts, bookingMarks, bookingRowStatus, bookingsOnDay } from '../../../src/lib/bookingCalendar';
import { dayHeading, monthTitle, shiftMonth } from '../../../src/lib/jobCalendar';
import { dateKey, parseDateKey } from '../../../src/lib/localDate';
import { SPScreen } from '../../../src/types/navigation';

interface SPCalendarScreenProps {
  onNavigate?: (screen: SPScreen, jobId?: string) => void;
  /** Screen title. My Work passes its own title so it doesn't change when the view switches. */
  title?: string;
  /** Rendered at the right end of the title row (App puts the List/Calendar switch here). */
  headerRight?: ReactNode;
}

const NAV_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };
const LINK_HIT_SLOP = { top: 15, bottom: 15, left: 8, right: 8 };

/**
 * The calendar's own header (its title, arrows and weekday names) is hidden: the
 * month row and the weekday row above the grid replace it.
 */
const NoCalendarHeader = () => null;

export default function SPCalendarScreen({ onNavigate, title = 'Calendar', headerRight }: SPCalendarScreenProps) {
  const { styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const todayKey = dateKey(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  // "YYYY-MM-DD" of a day in the month on screen. Paging the calendar fetches that month.
  const [visibleMonth, setVisibleMonth] = useState<string>(todayKey);

  const monthStart = parseDateKey(visibleMonth);
  const from = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1).toISOString();
  const to = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const { data, loading, error, reload } = useAsyncData(
    () => api.bookings({ from, to }),
    [from, to],
  );
  const [refreshing, setRefreshing] = useState(false);
  // reload() is fire-and-forget; a new `data` or `error` means the fetch settled.
  useEffect(() => {
    setRefreshing(false);
  }, [data, error]);
  const onRefresh = () => {
    setRefreshing(true);
    reload();
  };
  const bookings = useMemo(() => data ?? [], [data]);

  const marks = useMemo(() => bookingMarks(bookings, selectedDate, new Date()), [bookings, selectedDate]);
  // Each day's booking count, for its label. The day cell is rebuilt only when the bookings change, so the cells are not remounted on every render.
  const counts = useMemo(() => bookingCounts(bookings), [bookings]);
  const DayCell = useMemo(
    () => function BookingDay(props: CalendarDayProps) {
      return <CalendarDay {...props} jobCount={props.date ? counts[props.date.dateString] : undefined} />;
    },
    [counts],
  );
  const dayBookings = useMemo(() => bookingsOnDay(bookings, selectedDate), [bookings, selectedDate]);
  const settled = !loading && !error;

  const renderBooking = (booking: Booking) => {
    const status = bookingRowStatus(booking);
    return (
      <JobRow
        key={booking.id}
        title={booking.jobs?.title ?? 'Booking'}
        meta={status.meta}
        tone={status.tone}
        amount={timeOfDay(booking.scheduled_at)}
        date={booking.scheduled_at}
        onPress={() => onNavigate?.('Job Detail', booking.job_id)}
      />
    );
  };

  return (
    <View style={styles.screen}>
      {/* The title row stays up while the bookings load, so the List/Calendar switch doesn't blank. */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {headerRight}
        </View>
      </View>

      <ScrollView
        testID="calendar-scroll"
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={V6Colors.link} colors={[V6Colors.link]} />
        }
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
            dayComponent={DayCell}
            theme={{
              calendarBackground: V6Colors.surface,
              backgroundColor: V6Colors.surface,
            }}
          />
        </View>

        <View style={styles.dayHeader}>
          <Text style={styles.dayTitle} accessibilityRole="header">{dayHeading(selectedDate)}</Text>
          <View style={styles.dayMeta}>
            {settled && <Text style={styles.dayCount}>{plural(dayBookings.length, 'job')}</Text>}
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
        </View>

        {loading && <ContentSkeleton variant="list" />}

        {!loading && !!error && (
          <LoadErrorCard title="Couldn't load your schedule" message={error} onRetry={reload} />
        )}

        {settled && dayBookings.length === 0 && (
          <EmptyCard>
            <EmptyRow
              icon={CalendarDays}
              title="Nothing scheduled"
              body="Jobs appear here after a client hires you."
            />
          </EmptyCard>
        )}

        {settled && dayBookings.length > 0 && <View style={styles.rows}>{dayBookings.map(renderBooking)}</View>}

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

    rows: { gap: 8 },
  });
  return { appearance: theme.appearance, V6Colors, styles };
}
