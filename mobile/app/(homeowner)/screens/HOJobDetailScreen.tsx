/**
 * HOJobDetailScreen.tsx
 *
 * Figma Source: "HO - My Jobs Details" (id: 46:832)
 *
 * Design:
 * - Teal header with job title and status
 * - Provider info card with rating and chat button
 * - Job details (location, date, time, service type)
 * - Payment breakdown
 * - Action buttons: Chat, Cancel, Dispute
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
import {
  ArrowLeft,
  AlignLeft,
  CalendarDays,
  CircleAlert,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Star,
  TriangleAlert,
  Wrench,
} from 'lucide-react-native';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials, jobStatusMeta, shortDate } from '../../../src/lib/format';

interface HOJobDetailScreenProps {
  jobId: string | null;
  onBack: () => void;
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function HOJobDetailScreen({ jobId, onBack, onNavigate }: HOJobDetailScreenProps) {
  const { data, loading, error, reload } = useAsyncData(async () => {
    if (!jobId) throw new Error('No job selected.');
    const job = await api.getJob(jobId);
    const provider = job.assigned_provider_id
      ? await api.getProvider(job.assigned_provider_id).catch(() => null)
      : null;
    return { job, provider };
  }, [jobId]);

  const [busy, setBusy] = useState(false);

  const job = data?.job;
  const provider = data?.provider;
  const meta = job ? jobStatusMeta(job.status) : null;

  const runAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      reload();
    } finally {
      setBusy(false);
    }
  };

  const canCancel =
    job && ['open', 'recommending', 'assigned', 'in_progress'].includes(job.status);
  const canComplete = job?.status === 'in_progress';

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Job Details</Text>
          <TouchableOpacity style={styles.moreBtn} activeOpacity={0.8}>
            <MoreHorizontal size={18} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Job overview */}
        <View style={styles.jobOverview}>
          <Text style={styles.jobTitle}>{job?.title ?? 'Job Details'}</Text>
          {meta && (
            <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
              <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          )}
        </View>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 40 }} color={Colors.brandTeal} />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

      {job && (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Provider card */}
          {provider ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Service Provider</Text>
              <View style={styles.providerRow}>
                <View style={styles.providerAvatar}>
                  <Text style={styles.providerAvatarText}>{initials(provider.profiles?.full_name)}</Text>
                </View>
                <View style={styles.providerInfo}>
                  <Text style={styles.providerName}>{provider.profiles?.full_name ?? 'Provider'}</Text>
                  <View style={styles.providerRatingRow}>
                    <Star size={12} color={Colors.slate} fill={Colors.slate} />
                    <Text style={styles.providerRating}>
                      {provider.cached_avg_rating != null
                        ? `${Number(provider.cached_avg_rating).toFixed(1)} · `
                        : 'New · '}
                      {provider.cached_completed_jobs} jobs completed
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.chatBtn}
                  onPress={() => onNavigate('Chat', job.id)}
                  activeOpacity={0.8}
                >
                  <MessageCircle size={16} color={Colors.white} />
                  <Text style={styles.chatBtnText}>Chat</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Service Provider</Text>
              <Text style={styles.detailValue}>
                No provider assigned yet. You'll be notified when someone is matched.
              </Text>
            </View>
          )}

          {job && (
            <View style={styles.linkGrid}>
              <TouchableOpacity
                style={styles.linkCard}
                onPress={() => onNavigate('Job Applications', job.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.linkCardTitle}>View Offers</Text>
                <Text style={styles.linkCardSubtitle}>See provider proposals for this job</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkCard}
                onPress={() => onNavigate('Leave Review', job.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.linkCardTitle}>Leave Review</Text>
                <Text style={styles.linkCardSubtitle}>Submit feedback after work is finished</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Job details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Job Details</Text>
            {[
              { icon: Wrench, label: 'Service', value: job.service_categories?.name ?? '—' },
              { icon: MapPin, label: 'Location', value: job.address },
              { icon: TriangleAlert, label: 'Urgency', value: job.urgency },
              { icon: CalendarDays, label: 'Posted', value: shortDate(job.posted_at) },
              { icon: AlignLeft, label: 'Description', value: job.description },
            ].map((item) => (
              <View key={item.label} style={styles.detailRow}>
                <item.icon size={18} color={Colors.brandTeal} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>{item.label}</Text>
                  <Text style={styles.detailValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Timeline (derived from the job's real timestamps) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Timeline</Text>
            {[
              { label: 'Job Posted', date: shortDate(job.posted_at), done: true },
              { label: 'Provider Assigned', date: job.assigned_at ? shortDate(job.assigned_at as string) : '—', done: !!job.assigned_provider_id },
              { label: 'In Progress', date: job.status === 'in_progress' || job.status === 'completed' ? '✓' : '—', done: job.status === 'in_progress' || job.status === 'completed' },
              { label: 'Completed', date: job.completed_at ? shortDate(job.completed_at as string) : '—', done: job.status === 'completed' },
            ].map((item, i, arr) => (
              <View key={item.label} style={styles.timelineRow}>
                <View style={[styles.timelineDot, item.done && styles.timelineDotDone]} />
                {i < arr.length - 1 && <View style={[styles.timelineLine, item.done && styles.timelineLineDone]} />}
                <View style={styles.timelineContent}>
                  <Text style={[styles.timelineLabel, item.done && styles.timelineLabelDone]}>{item.label}</Text>
                  <Text style={styles.timelineDate}>{item.date}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Actions */}
          {provider && (
            <TouchableOpacity
              style={styles.chatFullBtn}
              onPress={() => onNavigate('Chat', job.id)}
              activeOpacity={0.85}
            >
              <View style={styles.chatFullBtnContent}>
                <MessageCircle size={16} color={Colors.white} />
                <Text style={styles.chatFullBtnText}>Open Chat with Provider</Text>
              </View>
            </TouchableOpacity>
          )}

          {canComplete && (
            <TouchableOpacity
              style={styles.completeBtn}
              onPress={() => runAction(() => api.completeJob(job.id))}
              activeOpacity={0.85}
              disabled={busy}
            >
              <Text style={styles.completeBtnText}>Mark as Completed</Text>
            </TouchableOpacity>
          )}

          {canCancel && (
            <TouchableOpacity
              style={styles.disputeBtn}
              onPress={() => runAction(async () => { await api.cancelJob(job.id); onBack(); })}
              activeOpacity={0.85}
              disabled={busy}
            >
              <View style={styles.disputeBtnContent}>
                <CircleAlert size={16} color={Colors.error} />
                <Text style={styles.disputeBtnText}>Cancel Job</Text>
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.disputeBtn}
            onPress={() => onNavigate('Dispute Filing')}
            activeOpacity={0.85}
          >
            <View style={styles.disputeBtnContent}>
              <CircleAlert size={16} color={Colors.error} />
              <Text style={styles.disputeBtnText}>File a Dispute</Text>
            </View>
          </TouchableOpacity>

          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.brandDark,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, marginBottom: 16,
  },
  headerTitle: { color: Colors.white, fontSize: 18, fontWeight: '700', fontFamily: 'Inter' },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: Colors.white, fontSize: 20, fontWeight: '600' },
  moreBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  moreIcon: { color: Colors.white, fontSize: 18 },

  jobOverview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  jobTitle: { color: Colors.white, fontSize: 20, fontWeight: '800', fontFamily: 'Inter', flex: 1 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,197,94,0.2)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E' },
  statusText: { color: '#22C55E', fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },

  card: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 18, marginBottom: 14, ...Shadows.card },
  cardTitle: { color: Colors.brandDark, fontSize: 15, fontWeight: '800', fontFamily: 'Inter', marginBottom: 14 },

  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerAvatar: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center',
  },
  providerAvatarText: { color: Colors.white, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  providerInfo: { flex: 1 },
  providerName: { color: Colors.brandDark, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
  providerRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  providerRating: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  chatBtn: {
    backgroundColor: Colors.brandTeal, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', gap: 2,
  },
  chatBtnIcon: { fontSize: 16 },
  chatBtnText: { color: Colors.white, fontSize: 11, fontWeight: '700', fontFamily: 'Inter' },

  detailRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 10 },
  detailIcon: { fontSize: 18, width: 24 },
  detailContent: { flex: 1 },
  detailLabel: { color: Colors.muted, fontSize: 11, fontWeight: '600', fontFamily: 'Inter', marginBottom: 2 },
  detailValue: { color: Colors.brandDark, fontSize: 14, fontFamily: 'Inter', lineHeight: 20 },

  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  payLabel: { color: Colors.slate, fontSize: 13, fontFamily: 'Inter' },
  payValue: { color: Colors.brandDark, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  payTotal: { borderBottomWidth: 0, marginTop: 4 },
  payTotalLabel: { color: Colors.brandDark, fontSize: 15, fontWeight: '800', fontFamily: 'Inter' },
  payTotalValue: { color: Colors.brandDark, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  escrowNote: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10 },
  escrowIcon: { fontSize: 16 },
  escrowText: { color: '#22C55E', fontSize: 12, fontFamily: 'Inter', flex: 1 },

  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, position: 'relative' },
  timelineDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(144,153,184,0.4)', backgroundColor: Colors.white, marginTop: 2, marginRight: 12 },
  timelineDotDone: { backgroundColor: Colors.brandTeal, borderColor: Colors.brandTeal },
  timelineLine: { position: 'absolute', left: 6, top: 16, width: 2, height: 28, backgroundColor: 'rgba(144,153,184,0.3)' },
  timelineLineDone: { backgroundColor: Colors.brandTeal },
  timelineContent: { flex: 1 },
  timelineLabel: { color: Colors.muted, fontSize: 13, fontWeight: '600', fontFamily: 'Inter', marginBottom: 1 },
  timelineLabelDone: { color: Colors.brandDark },
  timelineDate: { color: Colors.muted, fontSize: 11, fontFamily: 'Inter' },

  linkGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  linkCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radii.card,
    padding: 16,
    ...Shadows.card,
  },
  linkCardTitle: { color: Colors.brandDark, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 6 },
  linkCardSubtitle: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  chatFullBtn: {
    backgroundColor: Colors.brandTeal, borderRadius: 24, padding: 15,
    alignItems: 'center', marginBottom: 10,
    shadowColor: Colors.brandTeal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5,
  },
  chatFullBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chatFullBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  stateText: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', marginTop: 30, paddingHorizontal: Spacing.screenH },
  completeBtn: {
    backgroundColor: '#22C55E', borderRadius: 24, padding: 15, alignItems: 'center', marginBottom: 10,
  },
  completeBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  disputeBtn: {
    borderWidth: 1, borderColor: '#EF4444', borderRadius: 24, padding: 15,
    alignItems: 'center', marginBottom: 10,
  },
  disputeBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  disputeBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
});
