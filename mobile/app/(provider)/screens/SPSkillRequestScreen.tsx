/**
 * SPSkillRequestScreen.tsx ("My Services")
 *
 * A provider's service is what clients hire them for, so it no longer
 * changes from Edit Profile. Here the provider sees their main service, asks
 * the admins to change it or to add another one, and follows the answer.
 * Only one request can be open at a time (enforced by the API, 0034).
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft, BadgeCheck, Clock, XCircle } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, type SkillRequest, type SkillRequestType } from '../../../src/lib/api';
import { shortDate } from '../../../src/lib/format';
import { showToast } from '../../../src/components/Toast';
import ConfirmationModal from '../../../src/components/ConfirmationModal';

const C = V6Colors;
const REASON_MIN = 10;
const REASON_MAX = 500;

const TYPE_OPTIONS: { value: SkillRequestType; label: string; hint: string }[] = [
  { value: 'change_primary', label: 'Change my main service', hint: 'Replace the service clients see on your profile.' },
  { value: 'add_secondary', label: 'Add another service', hint: 'Offer a second service alongside your main one.' },
];

const STATUS_META: Record<SkillRequest['status'], { label: string; color: string; bg: string }> = {
  pending: { label: 'Under review', color: '#B45309', bg: '#FFF7ED' },
  approved: { label: 'Approved', color: '#15803d', bg: '#F0FDF4' },
  rejected: { label: 'Not approved', color: '#b91c1c', bg: '#FEF2F2' },
  cancelled: { label: 'Cancelled', color: '#64748b', bg: '#F1F5F9' },
};

interface SPSkillRequestScreenProps {
  onBack: () => void;
}

export default function SPSkillRequestScreen({ onBack }: SPSkillRequestScreenProps) {
  const { providerProfile, refreshProfile } = useAuth();
  const categories = useAsyncData(() => api.categories(), []);
  const requests = useAsyncData(() => api.mySkillRequests(), []);

  const [type, setType] = useState<SkillRequestType>('change_primary');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<SkillRequest | null>(null);

  const mainService = providerProfile?.service_categories?.name ?? '—';
  const pending = (requests.data ?? []).find((r) => r.status === 'pending') ?? null;
  const history = (requests.data ?? []).filter((r) => r.status !== 'pending');
  const choices = (categories.data ?? []).filter((c) => c.id !== providerProfile?.category_id);
  const canSubmit = !!categoryId && reason.trim().length >= REASON_MIN && !submitting;

  const submit = async () => {
    if (!categoryId) {
      setError('Choose a service.');
      return;
    }
    if (reason.trim().length < REASON_MIN) {
      setError(`Tell the admins a little more (at least ${REASON_MIN} characters).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createSkillRequest({ type, category_id: categoryId, reason: reason.trim() });
      setCategoryId(null);
      setReason('');
      showToast('Request sent to the admins', 'success');
      requests.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request.');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRequest = async (request: SkillRequest) => {
    setConfirmCancel(null);
    try {
      await api.cancelSkillRequest(request.id);
      showToast('Request cancelled');
      requests.reload();
      // An approval may have landed meanwhile; keep the main service honest.
      void refreshProfile();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not cancel the request.', 'error');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8} accessibilityLabel="Back">
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Services</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardLabel}>MAIN SERVICE</Text>
          <View style={styles.mainRow}>
            <BadgeCheck size={18} color={C.cyan700} />
            <Text style={styles.mainService}>{mainService}</Text>
          </View>
          <Text style={styles.cardNote}>
            Changes to your services are reviewed by the TaskBuddy team, so clients can trust what
            you're listed for.
          </Text>
        </View>

        {requests.loading && <ActivityIndicator color={C.cyan700} style={{ marginTop: 16 }} />}

        {pending && (
          <View style={styles.card}>
            <View style={styles.pendingHead}>
              <Clock size={16} color="#B45309" />
              <Text style={styles.pendingTitle}>Request under review</Text>
            </View>
            <Text style={styles.pendingBody}>
              {pending.type === 'change_primary' ? 'Change main service to ' : 'Add '}
              <Text style={styles.bold}>{pending.category?.name ?? 'a service'}</Text> · sent {shortDate(pending.created_at)}
            </Text>
            <Text style={styles.reasonQuote}>“{pending.reason}”</Text>
            <TouchableOpacity onPress={() => setConfirmCancel(pending)} activeOpacity={0.8} style={styles.cancelLink}>
              <Text style={styles.cancelLinkText}>Cancel request</Text>
            </TouchableOpacity>
          </View>
        )}

        {!pending && !requests.loading && (
          <View style={styles.card}>
            <Text style={styles.formTitle}>Request a change</Text>

            {TYPE_OPTIONS.map((opt) => {
              const selected = type === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.option, selected && styles.optionOn]}
                  onPress={() => setType(opt.value)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.radio, selected && styles.radioOn]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionLabel}>{opt.label}</Text>
                    <Text style={styles.optionHint}>{opt.hint}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            <Text style={styles.fieldLabel}>Service</Text>
            <View style={styles.chipGrid}>
              {choices.map((cat) => {
                const active = categoryId === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setCategoryId(cat.id)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Why are you qualified?</Text>
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="Years of experience, licences or certificates, past jobs…"
              placeholderTextColor={C.ink400}
              multiline
              maxLength={REASON_MAX}
              textAlignVertical="top"
              editable={!submitting}
            />
            <Text style={styles.counter}>{reason.length}/{REASON_MAX}</Text>

            {!!error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.disabled]}
              onPress={() => void submit()}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {submitting ? <ActivityIndicator color={C.white} /> : <Text style={styles.submitText}>Send to admins</Text>}
            </TouchableOpacity>
          </View>
        )}

        {history.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Past requests</Text>
            {history.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <View key={r.id} style={styles.historyRow}>
                  {r.status === 'rejected' ? <XCircle size={16} color={meta.color} /> : <Clock size={16} color={meta.color} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.historyTitle} numberOfLines={1}>
                      {r.type === 'change_primary' ? 'Change to ' : 'Add '}
                      {r.category?.name ?? 'a service'}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {shortDate(r.reviewed_at ?? r.created_at)}
                      {r.review_note ? ` · ${r.review_note}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.pill, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.pillText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <ConfirmationModal
        visible={!!confirmCancel}
        title="Cancel this request?"
        message="The admins won't review it. You can send a new one afterwards."
        confirmLabel="Cancel request"
        cancelLabel="Keep it"
        onConfirm={() => confirmCancel && void cancelRequest(confirmCancel)}
        onCancel={() => setConfirmCancel(null)}
      />
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
    borderBottomWidth: 1, borderBottomColor: C.hairline,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
  body: { flex: 1 },
  bodyContent: { padding: Spacing.screenH, paddingBottom: 32 },

  card: { backgroundColor: C.white, borderRadius: V6Radii.card, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 14 },
  cardLabel: { color: C.ink400, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, fontFamily: 'Inter' },
  mainRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  mainService: { color: C.ink900, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  cardNote: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18, marginTop: 8 },

  pendingHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pendingTitle: { color: '#B45309', fontSize: 14.5, fontWeight: '800', fontFamily: 'Inter' },
  pendingBody: { color: C.ink700, fontSize: 14, fontFamily: 'Inter', marginTop: 6 },
  bold: { fontWeight: '800' },
  reasonQuote: { color: C.ink500, fontSize: 13.5, fontStyle: 'italic', fontFamily: 'Inter', marginTop: 8, lineHeight: 19 },
  cancelLink: { alignSelf: 'flex-start', marginTop: 10 },
  cancelLinkText: { color: '#b91c1c', fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },

  formTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, marginBottom: 8 },
  optionOn: { borderColor: C.cyan600, backgroundColor: C.cyan50 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.ink300, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.cyan700 },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.cyan700 },
  optionLabel: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
  optionHint: { color: C.ink500, fontSize: 12.5, fontFamily: 'Inter', marginTop: 1 },

  fieldLabel: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 8 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7, backgroundColor: C.white },
  chipActive: { backgroundColor: C.cyan700, borderColor: C.cyan700 },
  chipText: { color: C.ink700, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  chipTextActive: { color: C.white, fontWeight: '700' },
  reasonInput: {
    minHeight: 96, borderWidth: 1, borderColor: '#dce3e9', borderRadius: 12, backgroundColor: '#f8fafc',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14.5, color: C.ink900, fontFamily: 'Inter',
  },
  counter: { alignSelf: 'flex-end', color: C.ink400, fontSize: 12, fontFamily: 'Inter', marginTop: 4 },
  error: { color: '#b91c1c', fontSize: 13.5, fontFamily: 'Inter', marginTop: 6 },
  submitBtn: { backgroundColor: C.cyan700, borderRadius: 12, minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  submitText: { color: C.white, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  disabled: { opacity: 0.5 },

  sectionTitle: { color: C.ink400, fontSize: 12.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: 'Inter', marginTop: 6, marginBottom: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, marginBottom: 8 },
  historyTitle: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
  historyMeta: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter', marginTop: 1 },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 11.5, fontWeight: '800', fontFamily: 'Inter' },
});
