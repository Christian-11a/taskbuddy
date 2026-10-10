/**
 * HODisputeFilingScreen.tsx
 *
 * "Report a problem" (was "File a Complaint"). The homeowner and the provider both file here.
 * The form sends the same raiseDispute call as before: the same reason values and the same
 * description limit. Nothing is pre-selected, so a reason must be chosen. Photos are not part of this
 * form; the screen says they can be added from the job chat after the report is sent.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { useAuth } from '../../../src/context/AuthContext';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import RadioRow from '../../../src/components/ui/RadioRow';
import TextField from '../../../src/components/ui/TextField';
import { ArrowLeft } from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';

import { api } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { heldAmount } from '../../../src/lib/heldMoney';
import {
  REPORT_REASONS,
  reasonLabel,
  reportChipText,
  reportConfirmMessage,
  reportOtherParty,
} from '../../../src/lib/reportView';

/** The backend accepts a description of up to 1000 characters and no minimum. */
const DETAILS_MAX = 1000;

interface HODisputeFilingScreenProps {
  jobId: string | null;
  onBack: () => void;
  onSubmitted: () => void;
}

export default function HODisputeFilingScreen({ jobId, onBack, onSubmitted }: HODisputeFilingScreenProps) {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { role } = useAuth();
  const isProvider = role === 'provider';
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: job } = useAsyncData(
    useCallback(
      () => (jobId ? api.getJob(jobId) : Promise.resolve(null)),
      [jobId],
    ),
  );

  const submitDispute = async () => {
    if (!jobId || !reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.raiseDispute(jobId, {
        reason,
        details: details.trim() || undefined,
      });
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the report.');
    } finally {
      setSubmitting(false);
    }
  };

  const chip = reportChipText(job, isProvider) ?? 'Loading job…';
  const canSend = !!reason && !!jobId && !submitting;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.8}
          hitSlop={5}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <Text style={styles.headerTitle}>Report a problem</Text>
      </View>

      {/* Keeps the description box and Send report above the keyboard (K2). */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={2}>{chip}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle} accessibilityRole="header">What went wrong?</Text>
            <View style={styles.reasonList}>
              {REPORT_REASONS.map((value) => (
                <RadioRow
                  key={value}
                  label={reasonLabel(value, isProvider)}
                  selected={reason === value}
                  onSelect={() => setReason(value)}
                />
              ))}
            </View>
          </View>

          <TextField
            label="Tell us what happened"
            value={details}
            onChangeText={setDetails}
            helper={`Optional · ${details.length} / ${DETAILS_MAX}`}
            multiline
            maxLength={DETAILS_MAX}
            textAlignVertical="top"
            placeholder="Give support enough detail to review the issue…"
            keyboardAppearance={appearance}
            style={styles.detailsInput}
          />

          <Text style={styles.photoNote}>You can add photos from the job chat after you send this.</Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Tap
            style={[styles.submitButton, !canSend && styles.submitButtonDisabled]}
            onPress={() => setShowConfirmation(true)}
            disabled={!canSend}
            scale
            accessibilityRole="button"
            accessibilityLabel="Send report"
          >
            {submitting ? (
              <ActivityIndicator color={V6Colors.onPrimary} />
            ) : (
              <Text style={styles.submitText}>Send report</Text>
            )}
          </Tap>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmationModal
        visible={showConfirmation}
        title="Send this report?"
        message={reportConfirmMessage({
          held: heldAmount(job, new Date()),
          otherParty: reportOtherParty(job, isProvider),
        })}
        confirmLabel="Send report"
        cancelLabel="Keep editing"
        onCancel={() => setShowConfirmation(false)}
        onConfirm={() => { setShowConfirmation(false); void submitDispute(); }}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: C.canvas },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backButton: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

    content: { padding: Spacing.screenH, paddingTop: 16, gap: 18 },

    chip: {
      backgroundColor: Colors.primaryTonal, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10,
    },
    chipText: { color: Colors.primaryDeep, fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter' },

    section: { gap: 10 },
    sectionTitle: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
    reasonList: { gap: 10 },

    detailsInput: { minHeight: 120 },
    photoNote: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18 },

    submitButton: {
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.primary, borderRadius: V6Radii.btn, paddingVertical: 14, marginTop: 4,
      ...V6Shadows.primaryButton,
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitText: { color: Colors.onPrimary, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
    errorText: { color: V6Colors.dangerText, fontFamily: 'Inter', fontSize: 15, textAlign: 'center' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
