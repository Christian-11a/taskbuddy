/**
 * DeleteAccountModal.tsx
 *
 * Self-serve account deletion against `DELETE /profiles/me`. Shared by both
 * Settings screens, which offer the identical flow.
 *
 * Three states, because the backend has three answers:
 *
 * - **confirm** — what deletion actually does, before it happens.
 * - **blocked** — the 409. The API lists *every* outstanding obligation at
 *   once rather than one per attempt, so they are all rendered together; a
 *   user who has both a balance and a live job should not have to delete
 *   twice to learn that.
 * - **deleting** — in flight.
 *
 * On success the caller signs out. The access token stays syntactically valid
 * until it expires, so the app must drop it deliberately; the backend bans the
 * auth user and rotates the address, which is what stops it being used again.
 *
 * The copy avoids promising erasure. Deletion is a soft delete: identifying
 * fields are overwritten, but the row survives because jobs, reviews and
 * ledger entries still reference it.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { V6Colors, V6Radii } from '../constants/theme';
import { api, deletionBlockersFrom, type DeletionBlocker } from '../lib/api';

const C = V6Colors;

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called after the account is gone — sign the user out here. */
  onDeleted: () => void;
}

export default function DeleteAccountModal({
  visible,
  onClose,
  onDeleted,
}: DeleteAccountModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setBlockers([]);
    setError(null);
    onClose();
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount();
      close();
      onDeleted();
    } catch (e) {
      const found = deletionBlockersFrom(e);
      if (found.length > 0) {
        setBlockers(found);
      } else {
        setError(e instanceof Error ? e.message : 'Could not delete the account.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const isBlocked = blockers.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessible={false}>
        <Pressable
          style={styles.card}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <View style={styles.titleRow}>
            <AlertTriangle size={20} color="#ef4444" />
            <Text style={styles.title} accessibilityRole="header">
              {isBlocked ? 'Not just yet' : 'Delete your account?'}
            </Text>
          </View>

          {isBlocked ? (
            <>
              <Text style={styles.body}>
                There{blockers.length === 1 ? "'s" : ' are'} still{' '}
                {blockers.length === 1 ? 'something' : 'a few things'} to settle
                first:
              </Text>
              <ScrollView style={styles.blockerScroll}>
                {blockers.map((blocker) => (
                  <View key={blocker.code} style={styles.blockerRow}>
                    <Text style={styles.blockerBullet}>•</Text>
                    <Text style={styles.blockerText}>{blocker.message}</Text>
                  </View>
                ))}
              </ScrollView>
              <Pressable
                style={[styles.btn, styles.confirmNeutral]}
                onPress={close}
                accessibilityRole="button"
              >
                <Text style={styles.confirmNeutralText}>Got it</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.body}>
                Your profile, contact details and settings are removed and you
                won't be able to sign in again. Jobs and reviews you were part
                of stay on record for the people on the other side of them.
                {'\n\n'}
                This can't be undone.
              </Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.actions}>
                <Pressable
                  style={[styles.btn, styles.cancel]}
                  onPress={close}
                  disabled={deleting}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelText}>Keep My Account</Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.danger, deleting && styles.btnDisabled]}
                  onPress={confirmDelete}
                  disabled={deleting}
                  accessibilityRole="button"
                >
                  {deleting ? (
                    <ActivityIndicator color={C.white} />
                  ) : (
                    <Text style={styles.dangerText}>Delete</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: { width: '100%', backgroundColor: C.white, borderRadius: V6Radii.card, padding: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: C.ink900, fontSize: 20, fontWeight: '800', fontFamily: 'Inter', flex: 1 },
  body: { color: C.ink500, fontSize: 15, fontFamily: 'Inter', lineHeight: 20, marginTop: 10 },

  blockerScroll: { maxHeight: 200, marginTop: 12 },
  blockerRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  blockerBullet: { color: '#ef4444', fontSize: 15, fontFamily: 'Inter', lineHeight: 20 },
  blockerText: { flex: 1, color: C.ink800, fontSize: 14.5, fontFamily: 'Inter', lineHeight: 20 },

  error: { color: '#ef4444', fontSize: 14, fontFamily: 'Inter', marginTop: 10 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: V6Radii.btn,
    paddingVertical: 13,
  },
  btnDisabled: { opacity: 0.6 },
  cancel: { backgroundColor: C.ink50 },
  cancelText: { color: C.ink700, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  danger: { backgroundColor: '#ef4444' },
  dangerText: { color: C.white, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
  confirmNeutral: { backgroundColor: C.cyan700, marginTop: 18 },
  confirmNeutralText: { color: C.white, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
});
