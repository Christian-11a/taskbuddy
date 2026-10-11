/**
 * DeleteAccountModal.tsx
 *
 * Self-serve account deletion against `DELETE /profiles/me`. Shared by both
 * Settings screens, which offer the identical flow. A bottom sheet, because
 * deleting is destructive: the red button names the action.
 *
 * Two states, because the backend has two answers:
 *
 * - **confirm** — what deletion actually does, before it happens. The word DELETE
 *   must be typed first, so a stray tap on the red button cannot delete anything,
 *   and nothing is sent until "Delete my account" is pressed.
 * - **blocked** — the 409. The API lists *every* outstanding obligation at
 *   once, so they are all rendered together; a user who has both a balance and
 *   a live job should not have to delete twice to learn that. Nothing is deleted.
 *
 * On success the caller signs out. The access token stays syntactically valid
 * until it expires, so the app must drop it deliberately; the backend bans the
 * auth user and rotates the address, which is what stops it being used again.
 *
 * The copy only claims what the backend does: deletion is a soft delete, the
 * identifying fields are cleared, and the jobs, reviews and payments rows stay
 * because other people's records still point at them.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import TextField from './ui/TextField';
import { Trash2 } from 'lucide-react-native';
import { api, deletionBlockersFrom, type DeletionBlocker } from '../lib/api';

const LINK_HIT_SLOP = { top: 15, bottom: 15, left: 8, right: 8 } as const;

/** The word the person types before the account can be deleted. */
export const CONFIRM_WORD = 'DELETE';

/** True when the typed text is the confirm word, ignoring case and the spaces around it. */
export function confirmsDeletion(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}

const WHAT_HAPPENS = [
  "Your account is closed right away and you're signed out.",
  'Your name, phone, photo and address are removed.',
  "Past jobs, reviews and payments stay on record for the other people involved. This can't be undone.",
];

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
  const { C, styles, V6Colors, Colors } = useThemedStyles(createThemedStyles);
  const [deleting, setDeleting] = useState(false);
  const [blockers, setBlockers] = useState<DeletionBlocker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  // Set before the request starts, so a second press before the re-render cannot send another.
  const inFlight = useRef(false);
  const confirmed = confirmsDeletion(typed);

  // Each time the sheet opens, the word has to be typed again.
  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);

  const close = () => {
    setBlockers([]);
    setError(null);
    setTyped('');
    onClose();
  };

  const confirmDelete = async () => {
    if (inFlight.current || !confirmsDeletion(typed)) return;
    inFlight.current = true;
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
      inFlight.current = false;
      setDeleting(false);
    }
  };

  const isBlocked = blockers.length > 0;

  return (
    <SheetFrame
      visible={visible}
      // Locked while the request is in flight, so the sheet cannot close mid-delete.
      onClose={deleting ? undefined : close}
      contentStyle={styles.sheet}
      cardProps={{ accessibilityRole: 'alert' }}
    >
      <View style={styles.iconWell}>
        <Trash2 size={22} color={V6Colors.dangerText} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {isBlocked ? "You can't delete your account yet" : 'Delete your account?'}
      </Text>

      {isBlocked ? (
        <>
          <Text style={styles.body}>Settle these first, then try again:</Text>
          <ScrollView style={styles.listScroll}>
            {blockers.map((blocker) => (
              <View key={blocker.code} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{blocker.message}</Text>
              </View>
            ))}
          </ScrollView>
          <Tap
            style={styles.closeBtn}
            onPress={close}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeText}>Close</Text>
          </Tap>
        </>
      ) : (
        <>
          <View style={styles.list}>
            {WHAT_HAPPENS.map((line) => (
              <View key={line} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>
          <View style={styles.confirmField}>
            <TextField
              label="Type DELETE to confirm"
              value={typed}
              onChangeText={setTyped}
              helper="This can't be undone, so please type DELETE."
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deleting}
              testID="input-delete-account-confirm"
            />
          </View>
          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          <Tap
            style={[styles.dangerBtn, (deleting || !confirmed) && styles.disabled]}
            onPress={confirmDelete}
            disabled={deleting || !confirmed}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
            accessibilityState={{ disabled: deleting || !confirmed }}
            testID="btn-delete-account-confirm"
          >
            {deleting ? (
              <ActivityIndicator color={Colors.onPrimary} />
            ) : (
              <Text style={styles.dangerText}>Delete my account</Text>
            )}
          </Tap>
          <Tap
            style={styles.keepBtn}
            onPress={close}
            disabled={deleting}
            activeOpacity={0.8}
            hitSlop={LINK_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Keep my account"
            accessibilityState={{ disabled: deleting }}
          >
            <Text style={[styles.keepText, { color: deleting ? C.ink400 : Colors.link }]}>Keep my account</Text>
          </Tap>
        </>
      )}
    </SheetFrame>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    sheet: { backgroundColor: C.surface, paddingHorizontal: 22, paddingTop: 4 },
    iconWell: {
      width: 48, height: 48, borderRadius: 14, backgroundColor: V6Colors.dangerSurface,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    title: { color: C.ink900, fontSize: 20, fontWeight: '800', fontFamily: 'Inter' },
    body: { color: C.ink500, fontSize: 14.5, fontFamily: 'Inter', lineHeight: 20, marginTop: 10 },

    list: { gap: 10, marginTop: 12, marginBottom: 16 },
    confirmField: { marginBottom: 16 },
    listScroll: { maxHeight: 220, marginTop: 12, marginBottom: 4 },
    bulletRow: { flexDirection: 'row', gap: 8 },
    bullet: { color: C.ink500, fontSize: 15, fontFamily: 'Inter', lineHeight: 21 },
    bulletText: { flex: 1, color: C.ink700, fontSize: 14.5, fontFamily: 'Inter', lineHeight: 21 },

    error: { color: V6Colors.dangerText, fontSize: 14, fontFamily: 'Inter', marginBottom: 10 },

    dangerBtn: {
      backgroundColor: V6Colors.dangerSolid, borderRadius: 14, minHeight: 50,
      alignItems: 'center', justifyContent: 'center',
    },
    dangerText: { color: Colors.onPrimary, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
    disabled: { opacity: 0.6 },
    keepBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 4 },
    keepText: { fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },

    closeBtn: {
      backgroundColor: Colors.primary, borderRadius: 14, minHeight: 50,
      alignItems: 'center', justifyContent: 'center', marginTop: 16,
    },
    closeText: { color: Colors.onPrimary, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, C, styles };
}
