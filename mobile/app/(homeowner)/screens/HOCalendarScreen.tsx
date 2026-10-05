/**
 * HOCalendarScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-calendar screen — flat
 * white topbar + a month calendar + the selected day's jobs below. Extracted
 * out of HOMyJobs.tsx (which used to embed this inline, from before this
 * screen existed in the mockup as its own bottom-nav tab).
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import { Calendar } from 'react-native-calendars';
import { CalendarDays, User } from 'lucide-react-native';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { jobStatusMeta } from '../../../src/lib/format';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';
import JobCard from '../../../src/components/JobCard';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

interface HOCalendarScreenProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function HOCalendarScreen({ onNavigate }: HOCalendarScreenProps) {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(selectedDate);
  const { data, loading, error, reload } = useAsyncData(() => api.myJobs(), [], 'ho-jobs');
  const jobs = data ?? [];

  // A job belongs on the calendar only while it can still happen: not once
  // it's cancelled or expired, and not an unfilled job whose date has passed.
  const isOnCalendar = (job: (typeof jobs)[number]) => {
    if (!job.scheduled_at) return false;
    if (job.status === 'cancelled' || job.status === 'expired') return false;
    const d = new Date(job.scheduled_at);
    if (Number.isNaN(d.getTime())) return false;
    const unfilled = job.status === 'open' || job.status === 'recommending';
    if (unfilled && d.getTime() < Date.now()) return false;
    return true;
  };

  const markedDates = useMemo(() => {
    const m: Record<string, any> = {};
    jobs.forEach((job) => {
      if (!isOnCalendar(job)) return;
      const d = new Date(job.scheduled_at!);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      m[key] = { ...(m[key] || {}), marked: true, dotColor: C.cyan700 };
    });
    if (selectedDate) {
      m[selectedDate] = { ...(m[selectedDate] || {}), selected: true, selectedColor: C.cyan700 };
    }
    return m;
  }, [jobs, selectedDate]);

  const jobsForSelectedDate = useMemo(() => {
    return jobs.filter((job) => {
      if (!isOnCalendar(job)) return false;
      const d = new Date(job.scheduled_at!);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return key === selectedDate;
    });
  }, [jobs, selectedDate]);

  if (loading) return <ScreenSkeleton variant="list" />;

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle}>Calendar</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.calendarCard}>
          <Calendar key={appearance}
            current={visibleMonth}
            onMonthChange={(month) => setVisibleMonth(month.dateString)}
            onDayPress={(day) => setSelectedDate(day.dateString)}
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

        <View style={styles.selectedDateHeader}>
          <Text style={styles.selectedDateTitle}>
            {new Date(selectedDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </Text>
          <Tap onPress={() => setSelectedDate(todayKey)}>
            <Text style={styles.textLink}>Today</Text>
          </Tap>
        </View>

        {!!error && (
          <View style={styles.emptyState}>
            <CalendarDays size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>Couldn't load your jobs</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <Tap onPress={reload} activeOpacity={0.8}>
              <Text style={[styles.textLink, { marginTop: 10 }]}>Retry</Text>
            </Tap>
          </View>
        )}

        {!error && jobsForSelectedDate.length === 0 && (
          <View style={styles.emptyState}>
            <CalendarDays size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>No jobs on this day</Text>
            <Text style={styles.emptyText}>Jobs with a scheduled date will show up here.</Text>
          </View>
        )}

        {!error && jobsForSelectedDate.map((job) => (
          <JobCard
            key={job.id}
            title={job.title}
            budget={job.budget}
            address={job.address}
            status={jobStatusMeta(job.status, V6Colors)}
            urgency={job.urgency}
            footer={[{
              icon: <User size={13} color={C.ink400} />,
              text: job.assigned_provider?.full_name ?? 'Waiting for a provider',
            }]}
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
    headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    calendarCard: {
      backgroundColor: C.surface, borderRadius: V6Radii.card, padding: 4,
      borderWidth: 1, borderColor: C.line, marginBottom: 20,
      ...V6Shadows.sm,
    },
    selectedDateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
    selectedDateTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
    textLink: { color: V6Colors.link, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },

    emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 22 },
    emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
    emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
