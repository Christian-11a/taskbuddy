/**
 * HODisputeStatusScreen.tsx
 *
 * Shows progress on a dispute already filed for a job. There is no stored
 * step-history for a dispute — `disputes` is a single row carrying its
 * current `status`/`resolution` (see backend/src/escrow/disputes.service.ts)
 * — so this timeline is derived client-side from that one row rather than
 * read from a real event log. Three steps only: Filed, Under Review,
 * Resolved/Cancelled. If a future backend adds a genuine per-step history
 * table, this can switch to rendering that instead.
 */

import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, CheckCircle2, CircleDashed, CircleDot } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, Dispute } from '../../../src/lib/api';
import { shortDate, timeOfDay } from '../../../src/lib/format';

interface HODisputeStatusScreenProps {
  jobId: string | null;
  onBack: () => void;
}

interface TimelineStep {
  key: string;
  title: string;
  detail: string;
  timestamp: string | null;
  state: 'done' | 'active' | 'upcoming';
}

function resolutionOutcome(dispute: Dispute): string {
  if (dispute.status === 'cancelled') return 'Dispute Cancelled';
  if (dispute.resolution === 'refunded_to_client') return 'Resolved — Refunded to You';
  if (dispute.resolution === 'released_to_provider') return 'Resolved — Released to Provider';
  return 'Resolved';
}

function buildSteps(dispute: Dispute): TimelineStep[] {
  const isOpen = dispute.status === 'open';
  const isClosed = dispute.status === 'resolved' || dispute.status === 'cancelled';

  return [
    {
      key: 'filed',
      title: 'Dispute Filed',
      detail: dispute.reason,
      timestamp: dispute.created_at,
      state: 'done',
    },
    {
      key: 'review',
      title: 'Under Review',
      detail: isOpen
        ? 'Our support team is looking into this.'
        : 'Reviewed by our support team.',
      timestamp: null,
      state: isOpen ? 'active' : 'done',
    },
    {
      key: 'resolved',
      title: isClosed ? resolutionOutcome(dispute) : 'Resolution',
      detail:
        dispute.resolution_note ??
        (isClosed
          ? 'A decision has been recorded for this dispute.'
          : 'You will be notified once a decision is made.'),
      timestamp: dispute.resolved_at,
      state: isClosed ? 'done' : 'upcoming',
    },
  ];
}

export default function HODisputeStatusScreen({ jobId, onBack }: HODisputeStatusScreenProps) {
  const { data: dispute, loading, error } = useAsyncData(
    () => (jobId ? api.jobDispute(jobId) : Promise.resolve(null)),
    [jobId],
  );

  const steps = dispute ? buildSteps(dispute) : [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispute Status</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 40 }} color={C.cyan700} />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}
      {!loading && !error && !dispute && (
        <Text style={styles.stateText}>No dispute has been filed for this job.</Text>
      )}

      {dispute && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Reason</Text>
            <Text style={styles.summaryValue}>{dispute.reason}</Text>
            {!!dispute.details && (
              <>
                <Text style={[styles.summaryLabel, { marginTop: 10 }]}>Details</Text>
                <Text style={styles.summaryValue}>{dispute.details}</Text>
              </>
            )}
          </View>

          <View style={styles.timeline}>
            {steps.map((step, i) => {
              const Icon =
                step.state === 'done' ? CheckCircle2 : step.state === 'active' ? CircleDot : CircleDashed;
              const iconColor =
                step.state === 'done' ? '#16a34a' : step.state === 'active' ? C.cyan700 : C.ink300;
              return (
                <View key={step.key} style={styles.stepRow}>
                  <View style={styles.stepRail}>
                    <Icon size={22} color={iconColor} />
                    {i < steps.length - 1 && (
                      <View
                        style={[
                          styles.stepConnector,
                          step.state === 'done' && styles.stepConnectorDone,
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.stepBody}>
                    <Text
                      style={[
                        styles.stepTitle,
                        step.state === 'upcoming' && styles.stepTitleUpcoming,
                      ]}
                    >
                      {step.title}
                    </Text>
                    <Text style={styles.stepDetail}>{step.detail}</Text>
                    {!!step.timestamp && (
                      <Text style={styles.stepTimestamp}>
                        {shortDate(step.timestamp)} · {timeOfDay(step.timestamp)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
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
  stateText: { color: C.ink500, fontSize: 16, fontFamily: 'Inter', textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },

  content: { padding: Spacing.screenH, paddingTop: 18, paddingBottom: 30 },

  summaryCard: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: V6Radii.card, padding: 16, marginBottom: 22, ...V6Shadows.sm,
  },
  summaryLabel: { color: C.ink400, fontSize: 12, fontWeight: '700', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue: { color: C.ink900, fontSize: 15, fontFamily: 'Inter', lineHeight: 20, marginTop: 3 },

  timeline: { paddingLeft: 2 },
  stepRow: { flexDirection: 'row' },
  stepRail: { alignItems: 'center', width: 30 },
  stepConnector: { flex: 1, width: 2, minHeight: 30, backgroundColor: C.line, marginVertical: 2 },
  stepConnectorDone: { backgroundColor: '#16a34a' },
  stepBody: { flex: 1, paddingBottom: 22 },
  stepTitle: { color: C.ink900, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
  stepTitleUpcoming: { color: C.ink400 },
  stepDetail: { color: C.ink500, fontSize: 13.5, fontFamily: 'Inter', lineHeight: 18, marginTop: 3 },
  stepTimestamp: { color: C.ink400, fontSize: 12, fontFamily: 'Inter', marginTop: 4 },
});
