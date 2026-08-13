/**
 * DeclineBookingModal.tsx
 *
 * The reason prompt a provider must fill in to turn down a booking. Shared by
 * the feed (SPHomeScreen) and the job screen (SPJobDetailScreen) so both ask
 * for the same thing in the same words — declining is one action that happens
 * to have two entry points.
 *
 * A reason is required, not encouraged: the backend rejects an empty one
 * (DeclineJobDto, 1–200 characters) and the homeowner is told what it was, so
 * the Decline button stays disabled until something has been typed. Quick
 * reasons are offered because the common ones are few, and typing on a phone
 * mid-job is not.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { V6Colors, V6Radii } from '../constants/theme';

const C = V6Colors;

/** Mirrors DeclineJobDto's @Length(1, 200) — see backend/src/jobs/dto. */
export const DECLINE_REASON_MAX = 200;

const QUICK_REASONS = [
  'Already booked at that time',
  'Too far from my service area',
  'Job needs skills I do not offer',
  'Budget is too low for this work',
];

interface DeclineBookingModalProps {
  visible: boolean;
  jobTitle?: string;
  submitting?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export default function DeclineBookingModal({
  visible,
  jobTitle,
  submitting = false,
  error = null,
  onCancel,
  onConfirm,
}: DeclineBookingModalProps) {
  const [reason, setReason] = useState('');

  // Reopening the dialog for a different booking must not inherit the last
  // one's reason.
  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  const trimmed = reason.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel} accessible={false}>
        <Pressable
          style={styles.dialog}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={styles.headerRow}>
            <Text style={styles.title} accessibilityRole="header">Decline Booking</Text>
            <TouchableOpacity onPress={onCancel} activeOpacity={0.8} accessibilityLabel="Close">
              <X size={22} color={C.ink500} />
            </TouchableOpacity>
          </View>

          <Text style={styles.message}>
            {jobTitle
              ? `Tell the homeowner why you can't take "${jobTitle}". `
              : "Tell the homeowner why you can't take this job. "}
            This cancels the booking and refunds them.
          </Text>

          <View style={styles.quickRow}>
            {QUICK_REASONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.quickChip, trimmed === option && styles.quickChipActive]}
                onPress={() => setReason(option)}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.quickChipText, trimmed === option && styles.quickChipTextActive]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Reason for declining"
            placeholderTextColor={C.ink400}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            maxLength={DECLINE_REASON_MAX}
            editable={!submitting}
            accessibilityLabel="Reason for declining"
          />
          <Text style={styles.counter}>
            {reason.length}/{DECLINE_REASON_MAX}
          </Text>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.8}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>Keep Booking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !canSubmit && styles.confirmBtnDisabled]}
              onPress={() => onConfirm(trimmed)}
              activeOpacity={0.85}
              disabled={!canSubmit}
            >
              {submitting ? (
                <ActivityIndicator color={C.white} size="small" />
              ) : (
                <Text style={styles.confirmText}>Decline</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(15,23,42,0.5)' },
  dialog: { backgroundColor: C.white, borderRadius: V6Radii.card, padding: 22 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
  message: { color: C.ink500, fontSize: 14.5, fontFamily: 'Inter', lineHeight: 19, marginBottom: 14 },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  quickChip: {
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.white,
  },
  quickChipActive: { backgroundColor: C.ink900, borderColor: C.ink900 },
  quickChipText: { color: C.ink500, fontSize: 12, fontWeight: '600', fontFamily: 'Inter' },
  quickChipTextActive: { color: C.white },

  input: {
    borderWidth: 1, borderColor: '#dce3e9', borderRadius: 12,
    padding: 12, fontSize: 15.5, fontFamily: 'Inter', color: C.ink900,
    minHeight: 78, textAlignVertical: 'top',
  },
  counter: { color: C.ink400, fontSize: 11.5, fontFamily: 'Inter', textAlign: 'right', marginTop: 5 },
  error: { color: '#ef4444', fontSize: 13.5, fontFamily: 'Inter', marginTop: 8 },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelBtn: { borderWidth: 1, borderColor: '#dce3e9', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  cancelText: { color: C.ink500, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
  confirmBtn: { backgroundColor: '#ef4444', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11, minWidth: 96, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmText: { color: C.white, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
});
