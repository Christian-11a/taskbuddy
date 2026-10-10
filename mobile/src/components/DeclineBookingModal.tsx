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
 * the Decline button stays disabled until one of the reasons is chosen. A
 * short optional note can follow the chosen reason. Typing on a phone mid-job
 * is not something to ask for, hence the choices.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import RadioRow from './ui/RadioRow';
import TextField from './ui/TextField';

/** Mirrors DeclineJobDto's @Length(1, 200) — see backend/src/jobs/dto. */
export const DECLINE_REASON_MAX = 200;

const QUICK_REASONS = [
  'Already booked at that time',
  'Too far from my service area',
  'Job needs skills I do not offer',
  'Budget is too low for this work',
];

/** The longest note that still leaves the whole reason within the limit. */
export function noteLimitFor(choice: string | null): number {
  return DECLINE_REASON_MAX - (choice ? choice.length + 2 : 0);
}

/** The reason sent to the API: the chosen reason, then the trimmed note if there is one. */
export function declineReason(choice: string, note: string): string {
  const extra = note.trim();
  return extra ? `${choice}. ${extra}` : choice;
}

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
  const { styles, Colors, appearance } = useThemedStyles(createThemedStyles);
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Reopening the dialog for a different booking must not inherit the last
  // one's reason or note.
  useEffect(() => {
    if (visible) {
      setChoice(null);
      setNote('');
    }
  }, [visible]);

  const pick = (reason: string) => {
    setChoice(reason);
    // Keep the note inside the room the newly chosen reason leaves.
    setNote((current) => current.slice(0, noteLimitFor(reason)));
  };

  const canSubmit = choice !== null && !submitting;
  const limit = noteLimitFor(choice);

  const confirm = () => {
    if (choice !== null) onConfirm(declineReason(choice, note));
  };

  return (
    <SheetFrame visible={visible} onClose={onCancel} contentStyle={styles.sheet} cardProps={{ testID: 'decline-dialog' }}>
      <Text style={styles.title} accessibilityRole="header">Decline Booking</Text>
      <Text style={styles.message}>
        {jobTitle
          ? `Tell the client why you can't take "${jobTitle}". `
          : "Tell the client why you can't take this job. "}
        This cancels the booking and refunds any held payment unless an open complaint requires admin review.
      </Text>

      <View style={styles.choices}>
        {QUICK_REASONS.map((reason) => (
          <RadioRow
            key={reason}
            label={reason}
            selected={choice === reason}
            onSelect={() => pick(reason)}
            disabled={submitting}
          />
        ))}
      </View>

      <TextField
        label="Add a note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="Anything the client should know"
        helper={`${note.length}/${limit}`}
        multiline
        maxLength={limit}
        editable={!submitting}
        keyboardAppearance={appearance}
      />

      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}

      <Tap
        style={[styles.declineBtn, choice === null && styles.declineBtnIdle, submitting && styles.dimmed]}
        onPress={confirm}
        disabled={!canSubmit}
        scale
        hitSlop={{ top: 1, bottom: 1 }}
        accessibilityRole="button"
        accessibilityLabel="Decline booking"
      >
        {submitting ? (
          <ActivityIndicator color={Colors.onPrimary} />
        ) : (
          <Text style={[styles.declineText, choice === null && styles.declineTextIdle]}>Decline booking</Text>
        )}
      </Tap>
      <Tap
        style={styles.keepBtn}
        onPress={onCancel}
        disabled={submitting}
        hitSlop={{ top: 7, bottom: 7, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Keep booking"
      >
        <Text style={styles.keepText}>Keep booking</Text>
      </Tap>
    </SheetFrame>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    sheet: { paddingHorizontal: 20, gap: 12 },
    title: { color: C.ink900, fontSize: 20, fontWeight: '700', lineHeight: 26, fontFamily: 'Inter' },
    message: { color: C.ink500, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },

    choices: { gap: 8 },
    error: { color: Colors.dangerText, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },

    declineBtn: {
      height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.dangerSolid,
    },
    // Until a reason is chosen: grey fill with dark text, like the other disabled forms.
    declineBtnIdle: { backgroundColor: C.ink100 },
    declineText: { color: Colors.onPrimary, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    declineTextIdle: { color: C.ink700 },
    dimmed: { opacity: 0.6 },

    keepBtn: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8 },
    keepText: { color: Colors.link, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
