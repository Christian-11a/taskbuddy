/**
 * SPJobDetailScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-job-detail screen — a
 * flat white .topbar, a borderless .detail-hero (kicker/title/price/facts,
 * bottom-divider only, not a card), .detail-section blocks, and a sticky
 * action bar whose primary button reflects the real job/application state.
 *
 * Deviation: the mockup has a 4-state job lifecycle (hired → in-progress →
 * pending-review → completed) with an explicit "Submit for Review" step.
 * This app's real backend only has 3 states after assignment (assigned →
 * in_progress → completed) — completion is homeowner-triggered, providers
 * have no "submit for review" action — so the in_progress state here shows
 * an informational locked message instead of fabricating a review step that
 * doesn't exist. The real "Decline Booking" feature (not in the mockup, but
 * real functionality via `api.declineJob`) is kept.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Image as ImageIcon, MapPin, MessageCircle, ShieldCheck, X } from 'lucide-react-native';
import { CalendarDays } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii } from '../../../src/constants/theme';

const C = V6Colors;
import { SPScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { shortDate } from '../../../src/lib/format';

interface MyApplication {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  jobs: { id: string };
}

interface SPJobDetailScreenProps {
  jobId: string | null;
  onBack: () => void;
  onNavigate: (screen: SPScreen, jobId?: string) => void;
  isUrgent?: boolean;
}

export default function SPJobDetailScreen({ jobId, onBack, onNavigate }: SPJobDetailScreenProps) {
  const { profile, isVerified } = useAuth();
  const { data: job, loading, error, reload } = useAsyncData(() => {
    if (!jobId) return Promise.reject(new Error('No job selected.'));
    return api.getJob(jobId);
  }, [jobId]);
  const { data: myApps } = useAsyncData(
    () => api.myApplications() as Promise<MyApplication[]>,
    [],
    'sp-applications',
  );
  const myApplication = (myApps ?? []).find((a) => a.jobs.id === jobId);

  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const isAssignedToMe = job?.assigned_provider_id === profile?.id;
  const canApply = job && ['open', 'recommending'].includes(job.status) && !isAssignedToMe && !myApplication;
  const canStart = isAssignedToMe && job?.status === 'assigned';
  const canDecline = isAssignedToMe && job?.status === 'assigned';
  const urgent = job?.urgency === 'urgent';

  const runAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      reload();
    } finally {
      setBusy(false);
    }
  };

  const submitDecline = async () => {
    if (!job || !declineReason.trim()) return;
    setDeclineOpen(false);
    await runAction(() => api.declineJob(job.id, declineReason.trim()));
    setDeclineReason('');
  };

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
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
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          {/* Hero — matches .detail-hero */}
          <View style={styles.hero}>
            <Text style={styles.kicker}>
              {isAssignedToMe ? 'YOUR HIRED JOB' : `${(job.service_categories?.name ?? 'JOB').toUpperCase()} OPPORTUNITY`}
            </Text>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>{job.title}</Text>
              {job.budget != null && <Text style={styles.heroPrice}>₱{Number(job.budget).toLocaleString()}</Text>}
            </View>
            {urgent && <Text style={styles.urgentTag}>URGENT</Text>}
            <View style={styles.factsGrid}>
              <View style={styles.fact}>
                <MapPin size={17} color={C.ink500} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.factLabel}>Location</Text>
                  <Text style={styles.factValue} numberOfLines={1}>{job.address}</Text>
                </View>
              </View>
              <View style={styles.fact}>
                <CalendarDays size={17} color={C.ink500} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.factLabel}>Schedule</Text>
                  <Text style={styles.factValue} numberOfLines={1}>
                    {job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What Needs To Be Done</Text>
            <Text style={styles.descText}>{job.description || 'No description provided.'}</Text>
          </View>

          {/* Job photos (real data — job.photo_urls) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Photos</Text>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <ImageIcon size={17} color={C.ink500} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Attached</Text>
                <Text style={styles.detailValue}>{job.photo_urls?.length ?? 0} photo(s)</Text>
              </View>
            </View>
          </View>

          {/* My proposal status (real data, not fabricated) */}
          {myApplication && (
            <View style={styles.trustNote}>
              <Text style={styles.trustNoteText}>
                <Text style={{ fontWeight: '800' }}>Your proposal</Text>
                {myApplication.status === 'pending' && ' · Waiting for the homeowner to choose a provider.'}
                {myApplication.status === 'rejected' && ' · The homeowner selected another provider.'}
                {myApplication.status === 'accepted' && ' · You were hired for this job.'}
                {myApplication.status === 'withdrawn' && ' · You withdrew this proposal.'}
              </Text>
            </View>
          )}

          {/* Actions — matches .detail-action-bar */}
          <View style={styles.actionBar}>
            {isAssignedToMe && job.status === 'assigned' && canStart && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => runAction(() => api.startJob(job.id))}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{busy ? 'Starting…' : 'Start Job'}</Text>
              </TouchableOpacity>
            )}
            {isAssignedToMe && job.status === 'in_progress' && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>Waiting for homeowner to confirm completion</Text>
              </View>
            )}
            {isAssignedToMe && job.status === 'completed' && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>Job Completed</Text>
              </View>
            )}

            {!isAssignedToMe && myApplication && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>
                  {myApplication.status === 'pending' ? 'Proposal Pending' : myApplication.status === 'rejected' ? 'Not Selected' : 'Proposal ' + myApplication.status}
                </Text>
              </View>
            )}
            {!isAssignedToMe && !myApplication && canApply && !isVerified && (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => onNavigate('Verification')} activeOpacity={0.85}>
                <View style={styles.primaryBtnContent}>
                  <ShieldCheck size={18} color={C.white} />
                  <Text style={styles.primaryBtnText}>Verify to Apply</Text>
                </View>
              </TouchableOpacity>
            )}
            {!isAssignedToMe && !myApplication && canApply && isVerified && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => runAction(() => api.applyToJob(job.id))}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{busy ? 'Sending…' : 'Submit Proposal'}</Text>
              </TouchableOpacity>
            )}
            {!isAssignedToMe && !myApplication && !canApply && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>Job unavailable</Text>
              </View>
            )}

            {isAssignedToMe && (
              <TouchableOpacity style={styles.outlineBtn} onPress={() => onNavigate('Chat', job.id)} activeOpacity={0.85}>
                <View style={styles.primaryBtnContent}>
                  <MessageCircle size={17} color={C.ink700} />
                  <Text style={styles.outlineBtnText}>Message Homeowner</Text>
                </View>
              </TouchableOpacity>
            )}

            {canDecline && (
              <TouchableOpacity
                style={styles.outlineDangerBtn}
                onPress={() => setDeclineOpen(true)}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.outlineDangerBtnText}>Decline Booking</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 10 }} />
        </ScrollView>
      )}

      {/* Decline reason modal */}
      <Modal visible={declineOpen} transparent animationType="fade" onRequestClose={() => setDeclineOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDeclineOpen(false)}>
          <Pressable style={styles.modalDialog} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Decline Booking</Text>
              <TouchableOpacity onPress={() => setDeclineOpen(false)} activeOpacity={0.8}>
                <X size={22} color={C.ink500} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMessage}>
              Let the client know why you can't take this job. This cancels the booking and refunds them.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason for declining"
              placeholderTextColor={C.ink400}
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setDeclineOpen(false)} activeOpacity={0.8}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, !declineReason.trim() && styles.modalConfirmBtnDisabled]}
                onPress={submitDecline}
                activeOpacity={0.85}
                disabled={!declineReason.trim()}
              >
                <Text style={styles.modalConfirmText}>Decline</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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

  hero: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  kicker: { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.9, fontWeight: '800', color: C.cyan700, marginBottom: 8, fontFamily: 'Inter' },
  heroTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  heroTitle: { flex: 1, fontSize: 21.5, lineHeight: 25, letterSpacing: -0.5, color: C.ink900, fontWeight: '700', fontFamily: 'Inter' },
  heroPrice: { fontSize: 21.5, fontWeight: '800', color: C.ink900, fontFamily: 'Inter' },
  urgentTag: { color: '#b91c1c', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginTop: 8, fontFamily: 'Inter' },
  factsGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  fact: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: '#f5f8fa', borderRadius: 12 },
  factLabel: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter' },
  factValue: { fontSize: 13.5, color: C.ink800, fontWeight: '700', fontFamily: 'Inter', marginTop: 1 },

  section: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  sectionTitle: { fontSize: 14, color: C.ink900, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12 },
  descText: { fontSize: 14, lineHeight: 21, color: C.ink700, fontFamily: 'Inter' },

  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#f6f8fa', alignItems: 'center', justifyContent: 'center' },
  detailLabel: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter', marginBottom: 2 },
  detailValue: { fontSize: 13.5, color: C.ink800, fontWeight: '600', fontFamily: 'Inter' },

  trustNote: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#f5fbfc', borderWidth: 1, borderColor: '#d8f0f4',
    borderRadius: 13, padding: 12, marginTop: 14,
  },
  trustNoteText: { flex: 1, color: C.cyan800, fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },

  actionBar: { paddingTop: 16, paddingBottom: 10, gap: 8 },
  primaryBtn: { backgroundColor: C.cyan700, borderRadius: V6Radii.btn, paddingVertical: 14, alignItems: 'center' },
  primaryBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtnText: { color: C.white, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  outlineBtn: { borderWidth: 1, borderColor: '#dce3e9', borderRadius: V6Radii.btn, paddingVertical: 14, alignItems: 'center' },
  outlineBtnText: { color: C.ink700, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  outlineDangerBtn: { borderWidth: 1, borderColor: '#ef4444', borderRadius: V6Radii.btn, paddingVertical: 14, alignItems: 'center' },
  outlineDangerBtnText: { color: '#ef4444', fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  lockedBtn: { backgroundColor: C.ink100, borderRadius: V6Radii.btn, paddingVertical: 14, alignItems: 'center' },
  lockedBtnText: { color: C.ink400, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' },

  modalOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,0.5)' },
  modalDialog: { backgroundColor: C.white, borderRadius: V6Radii.card, padding: 22 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
  modalMessage: { color: C.ink500, fontSize: 15.5, fontFamily: 'Inter', lineHeight: 19, marginBottom: 14 },
  modalInput: {
    borderWidth: 1, borderColor: '#dce3e9', borderRadius: 12,
    padding: 12, fontSize: 16, fontFamily: 'Inter', color: C.ink900,
    minHeight: 80, textAlignVertical: 'top', marginBottom: 18,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { borderWidth: 1, borderColor: '#dce3e9', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  modalCancelText: { color: C.ink500, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
  modalConfirmBtn: { backgroundColor: '#ef4444', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  modalConfirmBtnDisabled: { opacity: 0.5 },
  modalConfirmText: { color: C.white, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
});
