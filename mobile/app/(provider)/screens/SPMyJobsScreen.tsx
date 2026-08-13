/**
 * SPMyJobsScreen.tsx ("My Work" tab)
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-myjobs screen — a flat
 * white .topbar (not a colored hero), .job-tabs underline-style filter tabs,
 * and individual `.card` rows (not a single merged list surface).
 *
 * The mockup's 3 tabs are Applications / Active / Completed — "Applications"
 * shows the provider's own submitted proposals (pending/hired/not selected),
 * which this app already has a real endpoint for (`api.myApplications()`)
 * but had never wired up anywhere. That's used here instead of the previous
 * All/Active/Upcoming/Completed filter over assigned jobs only.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Briefcase, FileText, MapPin } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;
import { SPScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { jobStatusMeta } from '../../../src/lib/format';

const TABS = ['Applications', 'Active', 'Completed'] as const;
type Tab = (typeof TABS)[number];

interface ApplicationRow {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  jobs: {
    id: string;
    title: string;
    status: string;
    urgency: string;
    address: string;
    service_categories?: { name: string } | null;
  };
}

const APP_STATUS_LABEL: Record<ApplicationRow['status'], string> = {
  pending: 'Pending',
  accepted: 'Hired',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn',
};
const APP_STATUS_COLOR: Record<ApplicationRow['status'], string> = {
  pending: '#9a6700',
  accepted: '#15803d',
  rejected: '#64748b',
  withdrawn: '#64748b',
};

interface SPMyJobsScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string) => void;
}

export default function SPMyJobsScreen({ onNavigate }: SPMyJobsScreenProps) {
  const [tab, setTab] = useState<Tab>('Applications');

  const { data: applications, loading: loadingApps } = useAsyncData(
    () => api.myApplications() as Promise<ApplicationRow[]>,
    [],
    'sp-applications',
  );
  const { data: assigned, loading: loadingAssigned } = useAsyncData(
    () => api.assignedJobs(),
    [],
    'sp-assigned',
  );

  // 'assigned' is a booking request awaiting this provider's answer and
  // 'confirmed' one they accepted — both are live work, so both are Active.
  const activeJobs = (assigned ?? []).filter((j) =>
    ['assigned', 'confirmed', 'in_progress'].includes(j.status),
  );
  const completedJobs = (assigned ?? []).filter((j) => j.status === 'completed');
  const loading = tab === 'Applications' ? loadingApps : loadingAssigned;

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Work</Text>
      </View>

      {/* Filter tabs — matches .job-tabs (underline style) */}
      <View style={styles.tabsWrap}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={styles.jobTab} onPress={() => setTab(t)} activeOpacity={0.7}>
            <Text style={[styles.jobTabText, tab === t && styles.jobTabTextActive]}>{t}</Text>
            {tab === t && <View style={styles.jobTabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {loading && <ActivityIndicator style={{ marginTop: 30 }} color={C.cyan700} />}

        {tab === 'Applications' && !loading && (
          (applications ?? []).length === 0 ? (
            <View style={styles.emptyState}>
              <FileText size={30} color={C.ink300} />
              <Text style={styles.emptyTitle}>No proposals yet</Text>
              <Text style={styles.emptyText}>Find an open job and submit a proposal.</Text>
            </View>
          ) : (
            (applications ?? []).map((app) => (
              <TouchableOpacity
                key={app.id}
                style={styles.card}
                onPress={() => onNavigate('Job Detail', app.jobs.id)}
                activeOpacity={0.85}
              >
                <View style={styles.cardRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{app.jobs.title}</Text>
                    <Text style={styles.cardSub}>{app.jobs.service_categories?.name ?? ''}</Text>
                  </View>
                  <View style={[styles.statusPill, { borderColor: APP_STATUS_COLOR[app.status] }]}>
                    <Text style={[styles.statusPillText, { color: APP_STATUS_COLOR[app.status] }]}>
                      {APP_STATUS_LABEL[app.status]}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )
        )}

        {tab !== 'Applications' && !loading && (
          (tab === 'Active' ? activeJobs : completedJobs).length === 0 ? (
            <View style={styles.emptyState}>
              <Briefcase size={30} color={C.ink300} />
              <Text style={styles.emptyTitle}>No {tab.toLowerCase()} jobs</Text>
              <Text style={styles.emptyText}>Jobs will move here after a homeowner hires you.</Text>
            </View>
          ) : (
            (tab === 'Active' ? activeJobs : completedJobs).map((job) => {
              const meta = jobStatusMeta(job.status);
              return (
                <TouchableOpacity
                  key={job.id}
                  style={styles.card}
                  onPress={() => onNavigate('Job Detail', job.id)}
                  activeOpacity={0.85}
                >
                  <View style={styles.cardRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{job.title}</Text>
                      <View style={styles.cardLocationRow}>
                        <MapPin size={13} color={C.ink400} />
                        <Text style={styles.cardSub} numberOfLines={1}>{job.address}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg, borderColor: meta.bg }]}>
                      <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )
        )}

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
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

  tabsWrap: { flexDirection: 'row', gap: 24, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: Spacing.screenH },
  jobTab: { paddingVertical: 13, alignItems: 'center' },
  jobTabText: { color: C.ink400, fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter' },
  jobTabTextActive: { color: C.ink900, fontWeight: '800' },
  jobTabUnderline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2.5, backgroundColor: C.cyan700, borderRadius: 999 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

  emptyState: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
  emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

  card: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: V6Radii.card, padding: 15, marginBottom: 11, ...V6Shadows.sm,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: C.ink900, fontFamily: 'Inter' },
  cardLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  cardSub: { fontSize: 12, color: C.ink400, fontFamily: 'Inter', marginTop: 4 },
  statusPill: {
    alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center',
    paddingHorizontal: 9, borderRadius: 999, borderWidth: 1,
  },
  statusPillText: { fontSize: 11, fontWeight: '800', fontFamily: 'Inter' },
});
