/**
 * SPJobDetailScreen.tsx
 *
 * Figma Source: "SP - Accepted Job Details" (id: 234:714)
 * Also covers: "SP - Urgent Posted Job Detail Screen" (id: 46:1084) via isUrgent prop
 */

import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AlertTriangle, ArrowLeft, AlignLeft, CalendarDays, Check, MapPin, MessageCircle, MoreVertical, ShieldCheck, TriangleAlert, Wrench, X } from 'lucide-react-native';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';
import { SPScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { jobStatusMeta, shortDate } from '../../../src/lib/format';

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

  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  const isAssignedToMe = job?.assigned_provider_id === profile?.id;
  const canApply = job && ['open', 'recommending'].includes(job.status) && !isAssignedToMe;
  const canStart = isAssignedToMe && job?.status === 'assigned';
  const canDecline = isAssignedToMe && job?.status === 'assigned';
  const showProgress = isAssignedToMe && !!job && ['assigned', 'in_progress', 'completed'].includes(job.status);
  const urgent = job?.urgency === 'urgent';
  const meta = job ? jobStatusMeta(job.status) : null;

  const PROGRESS_STEPS = [
    { key: 'assigned', label: 'Booking Confirmed' },
    { key: 'in_progress', label: 'Work In Progress' },
    { key: 'completed', label: 'Job Completed' },
  ] as const;
  const progressIndex = job ? PROGRESS_STEPS.findIndex((s) => s.key === job.status) : -1;

  const runAction = async (fn: () => Promise<unknown>, successMsg: string) => {
    setBusy(true);
    setActionMsg(null);
    try {
      await fn();
      setActionMsg(successMsg);
      reload();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitDecline = async () => {
    if (!job || !declineReason.trim()) return;
    setDeclineOpen(false);
    await runAction(() => api.declineJob(job.id, declineReason.trim()), 'Booking declined.');
    setDeclineReason('');
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Job Details</Text>
          <TouchableOpacity style={styles.moreBtn} activeOpacity={0.8}>
            <MoreVertical size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.jobOverview}>
          {urgent && (
            <View style={styles.urgentTag}>
              <View style={styles.urgentTagContent}>
                <AlertTriangle size={14} color={Colors.error} />
                <Text style={styles.urgentTagText}>URGENT</Text>
              </View>
            </View>
          )}
          <Text style={styles.jobTitle}>{job?.title ?? 'Job Details'}</Text>
          {meta && (
            <View style={styles.budgetRow}>
              <Text style={styles.statusLabel}>{meta.label}</Text>
            </View>
          )}
        </View>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 40 }} color={Colors.brandTeal} />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

      {job && (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          {/* Job details */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Job Details</Text>
            {[
              { icon: Wrench, label: 'Service Type', value: job.service_categories?.name ?? '—' },
              { icon: MapPin, label: 'Location', value: job.address },
              { icon: TriangleAlert, label: 'Urgency', value: job.urgency },
              { icon: CalendarDays, label: 'Posted', value: shortDate(job.posted_at) },
              { icon: AlignLeft, label: 'Description', value: job.description },
            ].map((item) => (
              <View key={item.label} style={styles.detailRow}>
                <item.icon size={18} color={Colors.brandTeal} />
                <View style={styles.detailBody}>
                  <Text style={styles.detailLabel}>{item.label}</Text>
                  <Text style={styles.detailValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Post-accept progress / task list */}
          {showProgress && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Job Progress</Text>
              {PROGRESS_STEPS.map((step, i) => {
                const reached = i <= progressIndex;
                const current = i === progressIndex;
                return (
                  <View key={step.key} style={styles.progressRow}>
                    <View style={[styles.progressDot, reached && styles.progressDotDone, current && styles.progressDotCurrent]}>
                      {reached && <Check size={12} color={Colors.white} />}
                    </View>
                    <Text style={[styles.progressLabel, reached && styles.progressLabelDone]}>
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {!!actionMsg && <Text style={styles.actionMsg}>{actionMsg}</Text>}

          {/* Actions */}
          {isAssignedToMe && (
            <TouchableOpacity style={styles.chatFullBtn} onPress={() => onNavigate('Chat', job.id)} activeOpacity={0.85}>
              <View style={styles.chatBtnContent}>
                <MessageCircle size={16} color={Colors.white} />
                <Text style={styles.acceptBtnText}>Chat with Client</Text>
              </View>
            </TouchableOpacity>
          )}

          {canStart && (
            <TouchableOpacity
              style={styles.acceptBtnFull}
              onPress={() => runAction(() => api.startJob(job.id), 'Job started.')}
              activeOpacity={0.85}
              disabled={busy}
            >
              <Text style={styles.acceptBtnText}>Start Work</Text>
            </TouchableOpacity>
          )}

          {canDecline && (
            <TouchableOpacity
              style={styles.declineBtnFull}
              onPress={() => setDeclineOpen(true)}
              activeOpacity={0.85}
              disabled={busy}
            >
              <Text style={styles.declineBtnText}>Decline Booking</Text>
            </TouchableOpacity>
          )}

          {canApply && !isVerified && (
            <TouchableOpacity
              style={styles.verifyPromptBtn}
              onPress={() => onNavigate('Verification')}
              activeOpacity={0.85}
            >
              <ShieldCheck size={16} color={Colors.white} />
              <Text style={styles.acceptBtnText}>Get Verified to Apply</Text>
            </TouchableOpacity>
          )}

          {canApply && isVerified && (
            <TouchableOpacity
              style={[styles.acceptBtnFull, urgent && styles.urgentClaimBtn]}
              onPress={() => runAction(() => api.applyToJob(job.id), 'Application sent!')}
              activeOpacity={0.85}
              disabled={busy}
            >
              <Text style={styles.acceptBtnText}>
                {busy ? 'Sending…' : urgent ? 'Claim Urgent Job' : 'Apply for this Job'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {/* Decline reason modal */}
      <Modal visible={declineOpen} transparent animationType="fade" onRequestClose={() => setDeclineOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDeclineOpen(false)}>
          <Pressable style={styles.modalDialog} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Decline Booking</Text>
              <TouchableOpacity onPress={() => setDeclineOpen(false)} activeOpacity={0.8}>
                <X size={20} color={Colors.slate} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalMessage}>
              Let the client know why you can't take this job. This cancels the booking and refunds them.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Reason for declining"
              placeholderTextColor={Colors.muted}
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
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.brandDark, paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH, paddingBottom: 24,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginBottom: 16 },
  headerTitle: { color: Colors.white, fontSize: 18, fontWeight: '700', fontFamily: 'Inter' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  moreBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  jobOverview: { gap: 6 },
  urgentTag: { alignSelf: 'flex-start', backgroundColor: '#FEE2E2', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  urgentTagContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  urgentTagText: { color: '#EF4444', fontSize: 12, fontWeight: '800', fontFamily: 'Inter' },
  jobTitle: { color: Colors.white, fontSize: 22, fontWeight: '800', fontFamily: 'Inter' },
  budgetRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  statusLabel: { color: Colors.brandCyan, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  stateText: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', marginTop: 30, paddingHorizontal: Spacing.screenH },
  actionMsg: { color: Colors.brandTeal, fontSize: 13, fontFamily: 'Inter', textAlign: 'center', marginBottom: 12 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },
  card: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 18, marginBottom: 14, ...Shadows.card },
  cardTitle: { color: Colors.brandDark, fontSize: 15, fontWeight: '800', fontFamily: 'Inter', marginBottom: 14 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clientAvatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center' },
  clientAvatarText: { color: Colors.white, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  clientInfo: { flex: 1 },
  clientName: { color: Colors.brandDark, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
  clientRating: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  clientRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatBtn: { backgroundColor: Colors.brandTeal, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  chatBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  chatBtnText: { color: Colors.white, fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 10 },
  detailBody: { flex: 1 },
  detailLabel: { color: Colors.muted, fontSize: 11, fontWeight: '600', fontFamily: 'Inter', marginBottom: 2 },
  detailValue: { color: Colors.brandDark, fontSize: 14, fontFamily: 'Inter', lineHeight: 20 },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  payLabel: { color: Colors.slate, fontSize: 13, fontFamily: 'Inter' },
  payValue: { color: Colors.brandDark, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  payTotalRow: { borderBottomWidth: 0, marginTop: 4 },
  payTotalLabel: { color: Colors.brandDark, fontSize: 15, fontWeight: '800', fontFamily: 'Inter' },
  payTotalValue: { color: '#22C55E', fontSize: 20, fontWeight: '800', fontFamily: 'Inter' },
  mapPlaceholder: { backgroundColor: Colors.white, borderRadius: Radii.card, height: 90, alignItems: 'center', justifyContent: 'center', marginBottom: 14, ...Shadows.card, gap: 6, flexDirection: 'row' },
  mapText: { color: Colors.brandTeal, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  acceptBtnFull: { backgroundColor: Colors.brandTeal, borderRadius: 24, padding: 15, alignItems: 'center', marginBottom: 10, shadowColor: Colors.brandTeal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 },
  acceptBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  chatFullBtn: { backgroundColor: Colors.brandTeal, borderRadius: 24, padding: 15, alignItems: 'center', marginBottom: 10 },
  urgentClaimBtn: { backgroundColor: '#EF4444', shadowColor: '#EF4444' },
  declineBtnFull: { backgroundColor: Colors.white, borderWidth: 1.5, borderColor: '#EF4444', borderRadius: 24, padding: 15, alignItems: 'center', marginBottom: 10 },
  declineBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  verifyPromptBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.brandDark, borderRadius: 24, padding: 15, marginBottom: 10,
  },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  progressDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(144,153,184,0.35)', alignItems: 'center', justifyContent: 'center' },
  progressDotDone: { backgroundColor: Colors.brandTeal, borderColor: Colors.brandTeal },
  progressDotCurrent: { borderColor: Colors.brandTeal },
  progressLabel: { color: Colors.muted, fontSize: 14, fontFamily: 'Inter' },
  progressLabelDone: { color: Colors.brandDark, fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(6, 61, 77, 0.5)' },
  modalDialog: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 22 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: Colors.brandDark, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  modalMessage: { color: Colors.slate, fontSize: 13, fontFamily: 'Inter', lineHeight: 19, marginBottom: 14 },
  modalInput: {
    borderWidth: 1, borderColor: 'rgba(144,153,184,0.35)', borderRadius: 12,
    padding: 12, fontSize: 14, fontFamily: 'Inter', color: Colors.brandDark,
    minHeight: 80, textAlignVertical: 'top', marginBottom: 18,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { borderWidth: 1, borderColor: 'rgba(144,153,184,0.45)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  modalCancelText: { color: Colors.slate, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
  modalConfirmBtn: { backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  modalConfirmBtnDisabled: { opacity: 0.5 },
  modalConfirmText: { color: Colors.white, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
});
