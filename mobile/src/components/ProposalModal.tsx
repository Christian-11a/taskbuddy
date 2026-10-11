import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import TextField from './ui/TextField';
import { cleanText, validateText } from '../lib/textRules';

/** Matches ApplyDto.cover_message's MaxLength on the backend. */
export const PROPOSAL_MAX_LENGTH = 300;
/**
 * The shortest message that can be sent. An approved UX gate: the backend
 * still accepts an empty message, but the app no longer sends one.
 */
export const PROPOSAL_MIN_LENGTH = 20;

const TIPS = ['When you can come', "What's included (tools, parts)", "Similar jobs you've done"];

/** Why the message can't be sent yet, or null. Spaces at either end do not count. */
export function proposalError(message: string): string | null {
  return validateText(message, {
    min: PROPOSAL_MIN_LENGTH,
    max: PROPOSAL_MAX_LENGTH,
    label: 'your message',
    required: true,
  });
}

/** True once the message is long enough, not counting spaces at either end. */
export function canSendProposal(message: string): boolean {
  return proposalError(message) === null;
}

interface ProposalModalProps {
  visible: boolean;
  jobTitle?: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: (message: string) => void;
  onCancel: () => void;
}

/**
 * "Submit Proposal" used to send a bare application the moment it was
 * tapped. The client picks between proposals, so this gives the provider a
 * chance to say why them — shown to the client on the Proposals screen.
 */
export default function ProposalModal({
  visible, jobTitle, busy = false, error, onSubmit, onCancel,
}: ProposalModalProps) {
  const { C, styles, V6Colors, Colors, appearance } = useThemedStyles(createThemedStyles);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (visible) setMessage('');
  }, [visible]);

  const ready = canSendProposal(message);
  // Shown once the field is left or Send is tapped, never while the first words are being typed.
  const messageError = proposalError(message) ?? undefined;
  const counter = ready
    ? `${message.length} / ${PROPOSAL_MAX_LENGTH}`
    : `${message.length} / ${PROPOSAL_MAX_LENGTH} · at least ${PROPOSAL_MIN_LENGTH} characters`;

  return (
    <SheetFrame visible={visible} onClose={busy ? undefined : onCancel} contentStyle={styles.sheet}>
      <Text style={styles.title} accessibilityRole="header">Send a proposal</Text>
      {!!jobTitle && <Text style={styles.forJob} numberOfLines={2}>{`For "${jobTitle}"`}</Text>}

      <View style={styles.tips}>
        <Text style={styles.tipsTitle}>Good proposals mention:</Text>
        {TIPS.map((tip) => (
          <View key={tip} style={styles.tipRow}>
            <Check size={14} color={C.ink700} strokeWidth={2.6} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>

      <TextField
        label="Your message"
        value={message}
        onChangeText={setMessage}
        placeholder="Hi! I can come on Oct 14 at 2 PM…"
        helper={counter}
        error={messageError}
        multiline
        maxLength={PROPOSAL_MAX_LENGTH}
        editable={!busy}
        keyboardAppearance={appearance}
        testID="proposal-message"
      />

      <Text style={styles.notice}>The client compares offers and hires one provider. You'll be notified.</Text>

      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}

      <Tap
        style={[styles.sendBtn, !ready && !busy && styles.sendBtnOff, busy && styles.dimmed]}
        onPress={() => onSubmit(cleanText(message))}
        disabled={busy || !ready}
        scale
        hitSlop={{ top: 1, bottom: 1 }}
        accessibilityRole="button"
        accessibilityLabel="Send proposal"
        testID="proposal-send"
      >
        {busy ? (
          <ActivityIndicator color={Colors.onPrimary} />
        ) : (
          <Text style={[styles.sendText, !ready && styles.sendTextOff]}>Send proposal</Text>
        )}
      </Tap>
      <Tap
        style={styles.cancelBtn}
        onPress={onCancel}
        disabled={busy}
        hitSlop={{ top: 7, bottom: 7, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Tap>
    </SheetFrame>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    sheet: { paddingHorizontal: 20, gap: 14 },
    title: { color: C.ink900, fontSize: 20, fontWeight: '700', lineHeight: 26, fontFamily: 'Inter' },
    forJob: { color: C.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter', marginTop: -6 },

    tips: { backgroundColor: C.wellBg, borderRadius: 14, padding: 14, gap: 8 },
    tipsTitle: { color: C.ink900, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tipText: { flex: 1, color: C.ink700, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },

    notice: { color: C.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    error: { color: V6Colors.dangerText, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },

    sendBtn: {
      height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary,
    },
    // Readable disabled state: grey fill with dark text, like the other forms.
    sendBtnOff: { backgroundColor: C.ink100 },
    sendText: { color: Colors.onPrimary, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    sendTextOff: { color: C.ink700 },
    dimmed: { opacity: 0.6 },

    cancelBtn: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8 },
    cancelText: { color: Colors.link, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
