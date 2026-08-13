/**
 * HODisputeFilingScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-dispute screen — a flat
 * white .topbar (not a colored hero), flat .field-style inputs with no card
 * wrapping, and a single flat cyan-700 "Submit Dispute" button (the mockup
 * does not use a red/danger button here).
 *
 * Deviation: kept the reason list as tappable radio rows rather than the
 * mockup's HTML <select>, since that's the standard RN pattern for this kind
 * of choice; kept the header subtitle (job title + provider) since it's
 * real, useful context the mockup's generic demo copy doesn't need.
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;
import { api } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';

interface HODisputeFilingScreenProps {
  jobId: string | null;
  onBack: () => void;
  onSubmitted: () => void;
}

const REASONS = ['Work not completed', 'Work quality issue', 'Provider did not arrive', 'Payment issue', 'Other'];

export default function HODisputeFilingScreen({ jobId, onBack, onSubmitted }: HODisputeFilingScreenProps) {
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [detailsFocused, setDetailsFocused] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: job } = useAsyncData(
    useCallback(
      () => (jobId ? api.getJob(jobId) : Promise.resolve(null)),
      [jobId],
    ),
  );

  // Falls back to the plain title until the job loads; never a placeholder name.
  const subtitle = job
    ? [job.title, job.assigned_provider?.full_name].filter(Boolean).join(' · ')
    : 'Loading job…';

  const submitDispute = async () => {
    if (!jobId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.raiseDispute(jobId, {
        reason,
        details: details.trim() || undefined,
      });
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not file the dispute.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a colored hero) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>File a Dispute</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Issue</Text>
          <View style={styles.reasonList}>
            {REASONS.map((item) => {
              const selected = item === reason;
              return (
                <TouchableOpacity key={item} style={styles.reasonRow} onPress={() => setReason(item)} activeOpacity={0.8}>
                  <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
                  <Text style={styles.reasonText}>{item}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Describe what happened</Text>
          <TextInput
            style={[styles.detailsInput, detailsFocused && styles.detailsInputFocused]}
            value={details}
            onChangeText={setDetails}
            multiline
            textAlignVertical="top"
            placeholder="Give support enough detail to review the issue…"
            placeholderTextColor={C.ink400}
            onFocus={() => setDetailsFocused(true)}
            onBlur={() => setDetailsFocused(false)}
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, (submitting || !jobId) && styles.submitButtonDisabled]}
          onPress={() => setShowConfirmation(true)}
          disabled={submitting || !jobId}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={C.white} />
          ) : (
            <Text style={styles.submitText}>Submit Dispute</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <ConfirmationModal
        visible={showConfirmation}
        title="Submit dispute report?"
        message="You are about to file this dispute for review. You can add more information when our support team contacts you."
        confirmLabel="Submit Report"
        onCancel={() => setShowConfirmation(false)}
        onConfirm={() => { setShowConfirmation(false); void submitDispute(); }}
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
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backButton: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
  headerSubtitle: { color: C.ink500, fontSize: 13.5, fontFamily: 'Inter', marginTop: 1 },

  content: { padding: Spacing.screenH, paddingTop: 18, gap: 16 },

  fieldGroup: { marginBottom: 2 },
  label: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 10 },
  reasonList: { gap: 14 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.ink300, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: C.cyan700 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.cyan700 },
  reasonText: { color: C.ink700, fontSize: 15.5, fontFamily: 'Inter' },

  detailsInput: {
    minHeight: 120, borderRadius: 12, backgroundColor: C.white,
    borderWidth: 1, borderColor: '#dce3e9',
    padding: 14, color: C.ink900, fontFamily: 'Inter', fontSize: 15,
  },
  detailsInputFocused: { borderColor: C.cyan500 },

  submitButton: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.cyan700, borderRadius: V6Radii.btn, paddingVertical: 14, marginTop: 4,
    ...V6Shadows.primaryButton,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitText: { color: C.white, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  errorText: { color: '#ef4444', fontFamily: 'Inter', fontSize: 15, textAlign: 'center' },
});
