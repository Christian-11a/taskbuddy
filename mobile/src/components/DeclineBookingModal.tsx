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
 * the Decline button stays disabled until a reason is chosen or written. A
 * chosen reason can take a short note after it, and a note alone can be the
 * whole reason. Typing on a phone mid-job is not something to ask for, hence
 * the choices.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import RadioRow from './ui/RadioRow';
import TextField from './ui/TextField';
import { plural } from '../lib/format';
import { cleanText } from '../lib/textRules';

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
  const extra = cleanText(note);
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

  // Picking a reason only sets it: a typed note is never cut to make room for it.
  const pick = (option: string) => setChoice(option);

  // The reason as the API receives it: the chosen reason with the trimmed note after it, or the note alone.
  const trimmedNote = cleanText(note);
  const reasonToSend = choice !== null ? declineReason(choice, note) : trimmedNote;
  const over = Math.max(0, reasonToSend.length - DECLINE_REASON_MAX);
  const ready = (choice !== null || trimmedNote.length > 0) && over === 0;
  // Spaces alone are not a reason: when no reason is picked, the note has to say one.
  const noteError = choice === null && note.length > 0 && trimmedNote.length === 0
    ? 'Pick a reason above, or write one here.'
    : undefined;
  const canSubmit = ready && !submitting;
  // Room left for the note once the chosen reason and its separator are counted.
  const limit = noteLimitFor(choice);

  const confirm = () => {
    if (canSubmit) onConfirm(reasonToSend);
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
        error={noteError}
        multiline
        // The API's limit, not the room left: a limit that shrinks when a reason is picked could cut the note.
        maxLength={DECLINE_REASON_MAX}
        editable={!submitting}
        keyboardAppearance={appearance}
      />

      {over > 0 && (
        <Text style={styles.error} accessibilityRole="alert">
          {`Shorten your reason by ${plural(over, 'character')}.`}
        </Text>
      )}
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}

      <Tap
        style={[styles.declineBtn, !ready && styles.declineBtnIdle, submitting && styles.dimmed]}
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
          <Text style={[styles.declineText, !ready && styles.declineTextIdle]}>Decline booking</Text>
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
