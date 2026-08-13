/**
 * HOCalendarScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-calendar screen — flat
 * white topbar + a month calendar + the selected day's jobs below. Extracted
 * out of HOMyJobs.tsx (which used to embed this inline, from before this
 * screen existed in the mockup as its own bottom-nav tab).
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { CalendarDays, MapPin } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { jobStatusMeta, peso, timeAgo } from '../../../src/lib/format';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';

const C = V6Colors;

interface HOCalendarScreenProps {
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function HOCalendarScreen({ onNavigate }: HOCalendarScreenProps) {
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const { data, loading, error, reload } = useAsyncData(() => api.myJobs(), [], 'ho-jobs');
  const jobs = data ?? [];

  const markedDates = useMemo(() => {
    const m: Record<string, any> = {};
    jobs.forEach((job) => {
      if (!job.scheduled_at) return;
      if (job.status === 'cancelled') return;
      const d = new Date(job.scheduled_at);
      if (Number.isNaN(d.getTime())) return;
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
      if (!job.scheduled_at) return false;
      if (job.status === 'cancelled') return false;
      const d = new Date(job.scheduled_at);
      if (Number.isNaN(d.getTime())) return false;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return key === selectedDate;
    });
  }, [jobs, selectedDate]);

  if (loading) return <ScreenSkeleton variant="list" />;

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Calendar</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.calendarCard}>
          <Calendar
            current={selectedDate}
            onDayPress={(day) => setSelectedDate(day.dateString)}
            markedDates={markedDates}
            theme={{
              todayTextColor: C.cyan700,
              arrowColor: C.cyan700,
              selectedDayBackgroundColor: C.cyan700,
            }}
          />
        </View>

        <View style={styles.selectedDateHeader}>
          <Text style={styles.selectedDateTitle}>
            {new Date(selectedDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => setSelectedDate(todayKey)}>
            <Text style={styles.textLink}>Today</Text>
          </TouchableOpacity>
        </View>

        {!!error && (
          <View style={styles.emptyState}>
            <CalendarDays size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>Couldn't load your jobs</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity onPress={reload} activeOpacity={0.8}>
              <Text style={[styles.textLink, { marginTop: 10 }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!error && jobsForSelectedDate.length === 0 && (
          <View style={styles.emptyState}>
            <CalendarDays size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>No jobs on this day</Text>
            <Text style={styles.emptyText}>Jobs with a scheduled date will show up here.</Text>
          </View>
        )}

        {!error && jobsForSelectedDate.map((job) => {
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
  headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

  calendarCard: {
    backgroundColor: C.white, borderRadius: V6Radii.card, padding: 4,
    borderWidth: 1, borderColor: C.line, marginBottom: 20,
    ...V6Shadows.sm,
  },
  selectedDateHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
  selectedDateTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  textLink: { color: C.cyan700, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },

  emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 22 },
  emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
  emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

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
});
