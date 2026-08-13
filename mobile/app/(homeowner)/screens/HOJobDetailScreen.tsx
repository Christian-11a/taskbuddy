/**
 * HOJobDetailScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-job-detail screen — a
 * flat white .topbar (not a colored hero), then a borderless "hero" block
 * with kicker/title/price/facts separated by hairline dividers (not a
 * card-per-section stack), a horizontal step timeline, and a sticky bottom
 * action bar.
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
  Star,
  TriangleAlert,
  Wrench,
} from 'lucide-react-native';
import { Spacing, Sizes, V6Colors } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials, jobStatusMeta, shortDate } from '../../../src/lib/format';

const C = V6Colors;

const JOB_STAGES = ['Posted', 'Hired', 'In Progress', 'Review', 'Done'];

function stageIndex(status: string): number {
  switch (status) {
    case 'open':
    case 'recommending':
      return 0;
    case 'assigned':
      return 1;
    case 'in_progress':
      return 2;
    case 'completed':
      return 4;
    default:
      return 0;
  }
}

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
  const stage = job ? stageIndex(job.status) : 0;

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
      {/* Header — matches .topbar (flat white, not a colored hero) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Details</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 40 }} color={C.cyan700} />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

      {job && (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — matches .detail-hero (borderless, bottom-divider only) */}
          <View style={styles.hero}>
            <Text style={styles.kicker}>
              {(job.service_categories?.name ?? 'Service').toUpperCase()}
            </Text>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>{job.title}</Text>
              {meta && (
                <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              )}
            </View>
            {job.budget != null && (
              <Text style={styles.heroPrice}>₱{Number(job.budget).toLocaleString()}</Text>
            )}
            <View style={styles.factsGrid}>
              <View style={styles.fact}>
                <CalendarDays size={17} color={C.ink500} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.factLabel}>Schedule</Text>
                  <Text style={styles.factValue} numberOfLines={1}>
                    {job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible'}
                  </Text>
                </View>
              </View>
              <View style={styles.fact}>
                <TriangleAlert size={17} color={C.ink500} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.factLabel}>Urgency</Text>
                  <Text style={styles.factValue} numberOfLines={1}>{job.urgency}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Job progress — matches .timeline (horizontal steps) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Progress</Text>
            <View style={styles.timeline}>
              <View style={styles.timelineLine} />
              {JOB_STAGES.map((label, i) => (
                <View key={label} style={styles.timelineStep}>
                  <View style={[
                    styles.timelineDot,
                    i < stage && styles.timelineDotDone,
                    i === stage && styles.timelineDotCurrent,
                  ]} />
                  <Text style={[styles.timelineLabel, i <= stage && styles.timelineLabelDone]}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Description</Text>
            <Text style={styles.descText}>{job.description || 'No description provided.'}</Text>
          </View>

          {/* Location & category — real data the mockup's demo doesn't show,
              kept in the same .detail-row pattern used elsewhere in the mockup. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            {[
              { icon: Wrench, label: 'Service', value: job.service_categories?.name ?? '—' },
              { icon: MapPin, label: 'Location', value: job.address },
            ].map((item, i) => (
              <View key={item.label} style={[styles.detailRow, i > 0 && styles.detailRowBorder]}>
                <View style={styles.detailIcon}>
                  <item.icon size={17} color={C.ink500} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailLabel}>{item.label}</Text>
                  <Text style={styles.detailValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Hired provider */}
          {provider ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hired Provider</Text>
              <View style={styles.providerCard}>
                <View style={styles.providerAvatar}>
                  <Text style={styles.providerAvatarText}>{initials(provider.profiles?.full_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.providerName}>{provider.profiles?.full_name ?? 'Provider'}</Text>
                  <View style={styles.providerRatingRow}>
                    <Star size={12} color={C.ink400} fill={C.ink400} />
                    <Text style={styles.providerRating}>
                      {provider.cached_avg_rating != null
                        ? `${Number(provider.cached_avg_rating).toFixed(1)} · `
                        : 'New · '}
                      {provider.cached_completed_jobs} jobs completed
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.messageBtn}
                  onPress={() => onNavigate('Chat', job.id)}
                  activeOpacity={0.8}
                >
                  <MessageCircle size={15} color={C.ink700} />
                  <Text style={styles.messageBtnText}>Message</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Service Provider</Text>
              <Text style={styles.detailValue}>
                No provider assigned yet. You'll be notified when someone is matched.
              </Text>
            </View>
          )}

          {/* Related links — real app functionality, kept as flat rows */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => onNavigate('Job Applications', job.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.linkRowText}>View Offers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.linkRow, styles.detailRowBorder]}
              onPress={() => onNavigate('Leave Review', job.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.linkRowText}>Leave Review</Text>
            </TouchableOpacity>
          </View>

          {/* Actions — matches .detail-action-bar */}
          <View style={styles.actionBar}>
            {canComplete && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => runAction(() => api.completeJob(job.id))}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>Mark as Completed</Text>
              </TouchableOpacity>
            )}

            {canCancel && (
              <TouchableOpacity
                style={styles.outlineDangerBtn}
                onPress={() => runAction(async () => { await api.cancelJob(job.id); onBack(); })}
                activeOpacity={0.85}
                disabled={busy}
              >
                <View style={styles.outlineBtnContent}>
                  <CircleAlert size={17} color="#ef4444" />
                  <Text style={styles.outlineDangerBtnText}>Cancel Job</Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => onNavigate('Dispute Filing')}
              activeOpacity={0.85}
            >
              <Text style={styles.outlineBtnText}>File a Dispute</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 10 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 4 },
  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30, paddingHorizontal: Spacing.screenH },

  // Hero
  hero: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  kicker: { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.9, fontWeight: '800', color: C.cyan700, marginBottom: 8, fontFamily: 'Inter' },
  heroTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  heroTitle: { flex: 1, fontSize: 21.5, lineHeight: 25, letterSpacing: -0.5, color: C.ink900, fontWeight: '700', fontFamily: 'Inter' },
  statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  statusBadgeText: { fontSize: 12.5, fontWeight: '700', fontFamily: 'Inter' },
  heroPrice: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7, color: C.ink900, marginTop: 16, fontFamily: 'Inter' },
  factsGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  fact: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: '#f5f8fa', borderRadius: 12 },
  factLabel: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter' },
  factValue: { fontSize: 13.5, color: C.ink800, fontWeight: '700', fontFamily: 'Inter', marginTop: 1 },

  // Sections — borderless, bottom-divider only
  section: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  sectionTitle: { fontSize: 14, color: C.ink900, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12 },
  descText: { fontSize: 14, lineHeight: 21, color: C.ink700, fontFamily: 'Inter' },

  // Horizontal timeline
  timeline: { flexDirection: 'row', justifyContent: 'space-between', position: 'relative', marginTop: 4 },
  timelineLine: { position: 'absolute', left: '10%', right: '10%', top: 7, height: 2, backgroundColor: '#e6ebef' },
  timelineStep: { width: '20%', alignItems: 'center' },
  timelineDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: '#d6dde3', backgroundColor: C.white, marginBottom: 6 },
  timelineDotDone: { backgroundColor: C.cyan700, borderColor: C.cyan700 },
  timelineDotCurrent: { borderColor: C.cyan700 },
  timelineLabel: { fontSize: 9.5, lineHeight: 12, color: C.ink400, fontFamily: 'Inter', textAlign: 'center' },
  timelineLabelDone: { color: C.ink700, fontWeight: '700' },

  // Detail rows
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  detailRowBorder: { borderTopWidth: 1, borderTopColor: '#f1f4f6' },
  detailIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#f6f8fa', alignItems: 'center', justifyContent: 'center' },
  detailLabel: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter', marginBottom: 2 },
  detailValue: { fontSize: 13.5, color: C.ink800, fontWeight: '600', fontFamily: 'Inter', lineHeight: 17 },

  // Provider card
  providerCard: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  providerAvatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: C.cyan700, alignItems: 'center', justifyContent: 'center' },
  providerAvatarText: { color: C.white, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  providerName: { fontSize: 14.5, fontWeight: '700', color: C.ink900, fontFamily: 'Inter' },
  providerRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  providerRating: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter' },
  messageBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  messageBtnText: { color: C.ink700, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },

  // Link rows
  linkRow: { paddingVertical: 12 },
  linkRowText: { color: C.cyan700, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },

  // Action bar
  actionBar: { paddingTop: 16, paddingBottom: 10, gap: 8 },
  primaryBtn: { backgroundColor: C.cyan700, borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: C.white, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  outlineBtn: { borderWidth: 1, borderColor: '#dce3e9', borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  outlineBtnText: { color: C.ink700, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  outlineDangerBtn: { borderWidth: 1, borderColor: '#ef4444', borderRadius: 13, paddingVertical: 14, alignItems: 'center' },
  outlineBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  outlineDangerBtnText: { color: '#ef4444', fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
});
