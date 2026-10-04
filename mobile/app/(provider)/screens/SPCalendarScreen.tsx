/**
 * SPCalendarScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-calendar screen — a flat
 * white .topbar, a full month-grid `.card` (react-native-calendars, same
 * component the homeowner side's calendar uses, not the old horizontal
 * day-scroller), and a "Your Schedule" list of flat bordered rows below.
 *
 * Deviation: the mockup's schedule list shows all upcoming jobs, un-filtered
 * by date. This app already had a more useful real feature — filtering
 * bookings by the calendar's selected day — which is kept, since it's more
 * capable than what the mockup demo needs to show. Also wired the schedule
 * rows to actually navigate to Job Detail (`booking.job_id`), which the old
 * version had a decorative, non-functional arrow for.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { CalendarDays, UserRound } from 'lucide-react-native';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { jobStatusMeta, timeOfDay } from '../../../src/lib/format';
import { SPScreen } from '../../../src/types/navigation';

interface SPCalendarScreenProps {
  onNavigate?: (screen: SPScreen, jobId?: string) => void;
}

export default function SPCalendarScreen({ onNavigate }: SPCalendarScreenProps) {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);

  // The month on screen, not today's month: paging the calendar used to show
  // empty months because only the current one was ever fetched.
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const from = new Date(visibleMonth.year, visibleMonth.month, 1).toISOString();
  const to = new Date(visibleMonth.year, visibleMonth.month + 1, 0, 23, 59, 59).toISOString();
  const { data, loading, error, reload } = useAsyncData(
    () => api.bookings({ from, to }),
    [from, to],
  );
  const bookings = data ?? [];

  const dateKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const markedDates = useMemo(() => {
    const m: Record<string, any> = {};
    bookings.forEach((b) => {
      const key = dateKey(b.scheduled_at);
      m[key] = { ...(m[key] || {}), marked: true, dotColor: C.cyan700 };
    });
    if (selectedDate) {
      m[selectedDate] = { ...(m[selectedDate] || {}), selected: true, selectedColor: C.cyan700 };
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, selectedDate]);

  const daySchedule = bookings
    .filter((b) => dateKey(b.scheduled_at) === selectedDate)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle}>Calendar</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <View style={styles.calendarCard}>
          <Calendar key={appearance}
            current={`${visibleMonth.year}-${String(visibleMonth.month + 1).padStart(2, '0')}-01`}
            onDayPress={(day) => setSelectedDate(day.dateString)}
            onMonthChange={(m) => setVisibleMonth({ year: m.year, month: m.month - 1 })}
            markedDates={markedDates}
            theme={{
              calendarBackground: V6Colors.surface,
              backgroundColor: V6Colors.surface,
              dayTextColor: V6Colors.ink900,
              textDisabledColor: V6Colors.ink400,
              monthTextColor: V6Colors.ink900,
              textSectionTitleColor: V6Colors.ink500,
              todayTextColor: V6Colors.link,
              arrowColor: V6Colors.link,
              selectedDayBackgroundColor: C.cyan700,
            }}
          />
        </View>

        <Text style={styles.sectionTitle}>Your Schedule</Text>

        {loading && <ActivityIndicator style={{ marginTop: 10 }} color={V6Colors.link} />}

        {!loading && !!error && (
          <View style={styles.emptyState}>
            <CalendarDays size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>Couldn't load your schedule</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity onPress={reload} activeOpacity={0.8}>
              <Text style={styles.retryLink}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && daySchedule.length === 0 && (
          <View style={styles.emptyState}>
            <CalendarDays size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>Nothing scheduled</Text>
            <Text style={styles.emptyText}>Jobs appear here after a client hires you.</Text>
          </View>
        )}

        {!loading && !error && daySchedule.map((booking) => {
          return (
            <TouchableOpacity
              key={booking.id}
              style={styles.scheduleCard}
              onPress={() => onNavigate?.('Job Detail', booking.job_id)}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.scheduleTitle} numberOfLines={1}>{booking.jobs?.title ?? 'Booking'}</Text>
                <Text style={styles.scheduleTime}>{timeOfDay(booking.scheduled_at)}</Text>
                <View style={styles.scheduleClientRow}>
                  <UserRound size={13} color={C.ink400} />
                  <Text style={styles.scheduleClientLabel}>{booking.client?.full_name ?? 'Client'}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: jobStatusMeta(booking.status === 'scheduled' ? 'assigned' : booking.status, V6Colors).bg }]}>
                <Text style={[styles.statusBadgeText, { color: jobStatusMeta(booking.status === 'scheduled' ? 'assigned' : booking.status, V6Colors).color }]}>
                  {booking.status === 'scheduled' ? 'Scheduled' : booking.status === 'completed' ? 'Completed' : 'Cancelled'}
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

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    calendarCard: {
      backgroundColor: C.surface, borderRadius: V6Radii.card, padding: 4,
      borderWidth: 1, borderColor: C.line, marginBottom: 20,
      ...V6Shadows.sm,
    },
    sectionTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12 },

    emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
    emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
    emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },
    retryLink: { color: V6Colors.link, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter', marginTop: 10 },

    scheduleCard: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: V6Radii.card, padding: 14, marginBottom: 10,
      flexDirection: 'row', alignItems: 'center', gap: 10, ...V6Shadows.sm,
    },
    scheduleTitle: { color: C.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    scheduleTime: { color: C.ink400, fontSize: 13, fontFamily: 'Inter', marginTop: 2 },
    scheduleClientRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
    scheduleClientLabel: { color: C.ink500, fontSize: 13.5, fontFamily: 'Inter' },
    statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    statusBadgeText: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
