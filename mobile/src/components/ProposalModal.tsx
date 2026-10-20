import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import TextField from './ui/TextField';
import { cleanText, validateText } from '../lib/textRules';
import { peso } from '../lib/format';
import { feeRows, type JobFee } from '../lib/feeBreakdown';

/** Matches ApplyDto.cover_message's MaxLength on the backend. */
export const PROPOSAL_MAX_LENGTH = 300;
/**
 * The shortest message that can be sent. An approved UX gate: the backend
 * still accepts an empty message, but the app no longer sends one.
 */
export const PROPOSAL_MIN_LENGTH = 20;

/** Said wherever a proposal is blocked for want of a payout account. */
export const PAYOUT_NOTE = 'Link a GCash, Maya or bank account to send proposals';

const TIPS = ['When you can come', 'How you will handle the listed tasks', "Similar jobs you've done"];

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
  /** The job price, the fee's base. */
  jobBudget?: number | string | null;
  /** The platform fee on the job; the breakdown is hidden when it is missing. */
  fee?: JobFee | null;
  busy?: boolean;
  error?: string | null;
  /** The server refused with `payout_account_required`: show the note and a way to link an account instead of the error. */
  payoutRequired?: boolean;
  onLinkPayout?: () => void;
  /** The server refused with `certificate_required` (the error holds its message): show it and a way to upload the certificate. */
  certificateRequired?: boolean;
  onUploadCertificate?: () => void;
  onSubmit: (message: string, quoteAmount: number) => void;
  onCancel: () => void;
}

/**
 * "Submit Proposal" used to send a bare application the moment it was
 * tapped. The client picks between proposals, so this gives the provider a
 * chance to say why them — shown to the client on the Proposals screen.
 */
export default function ProposalModal({
  visible, jobTitle, jobBudget, fee, busy = false, error, payoutRequired = false, onLinkPayout,
  certificateRequired = false, onUploadCertificate, onSubmit, onCancel,
}: ProposalModalProps) {
  const { C, styles, V6Colors, Colors, appearance } = useThemedStyles(createThemedStyles);
  const [message, setMessage] = useState('');
  const [quoteMode, setQuoteMode] = useState<'accept' | 'different'>('accept');
  const [quoteInput, setQuoteInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const messageRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setMessage('');
      setQuoteMode(Number(jobBudget) > 0 ? 'accept' : 'different');
      setQuoteInput('');
      setSubmitted(false);
    }
  }, [visible, jobBudget]);

  const quoteAmount = quoteMode === 'accept' ? Number(jobBudget) : Number(quoteInput);
  const quoteValid = quoteMode === 'accept'
    ? Number.isFinite(quoteAmount) && quoteAmount >= 50 && quoteAmount <= 100000
    : /^\d+(?:\.\d{1,2})?$/.test(quoteInput.trim()) && quoteAmount >= 50 && quoteAmount <= 100000;

  const trySend = () => {
    if (!canSendProposal(message)) {
      setSubmitted(true);
      messageRef.current?.focus();
      return;
    }
    if (!quoteValid) { setSubmitted(true); return; }
    onSubmit(cleanText(message), quoteAmount);
  };

  const breakdown = quoteMode === 'accept' ? feeRows(jobBudget, fee) : null;
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

      <View style={styles.quoteChoices}>
        {Number(jobBudget) > 0 && (
          <Tap style={[styles.quoteChoice, quoteMode === 'accept' && styles.quoteChoiceSelected]} onPress={() => setQuoteMode('accept')} accessibilityRole="button" accessibilityLabel={`Accept posted budget ${peso(jobBudget)}`}>
            <Text style={styles.feeValue}>Accept posted budget · {peso(jobBudget)}</Text>
          </Tap>
        )}
        <Tap style={[styles.quoteChoice, quoteMode === 'different' && styles.quoteChoiceSelected]} onPress={() => setQuoteMode('different')} accessibilityRole="button" accessibilityLabel="Quote a different total">
          <Text style={styles.feeValue}>Quote a different total</Text>
        </Tap>
      </View>

      {quoteMode === 'different' && (
        <TextField
          label="Your total quote (₱)"
          value={quoteInput}
          onChangeText={setQuoteInput}
          keyboardType="decimal-pad"
          placeholder="Enter one total amount"
          error={submitted && !quoteValid ? 'Enter ₱50 to ₱100,000.' : undefined}
          submitted={submitted}
          testID="proposal-quote"
        />
      )}

      {!!breakdown && (
        <View style={styles.fee} accessible accessibilityLabel={breakdown.summary} testID="proposal-fee">
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Job price</Text>
            <Text style={styles.feeValue}>{breakdown.price}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>{breakdown.feeLabel}</Text>
            <Text style={styles.feeValue}>{breakdown.fee}</Text>
          </View>
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>You receive</Text>
            <Text style={styles.feeTotal}>{breakdown.receives}</Text>
          </View>
          <Text style={styles.feeNote}>{`You receive ${breakdown.receives} when the client confirms the job is done`}</Text>
        </View>
      )}
      {quoteMode === 'different' && quoteValid && (
        <Text style={styles.notice}>Your proposed total is {peso(quoteAmount)}. The platform fee will be deducted from this amount.</Text>
      )}

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
        submitted={submitted}
        ref={messageRef}
        multiline
        maxLength={PROPOSAL_MAX_LENGTH}
        editable={!busy}
        keyboardAppearance={appearance}
        testID="proposal-message"
      />

      <Text style={styles.notice}>The client compares proposals and hires one provider. You'll be notified.</Text>

      {payoutRequired ? (
        <>
          <Text style={styles.error} accessibilityRole="alert" testID="proposal-payout-note">{PAYOUT_NOTE}</Text>
          {!!onLinkPayout && (
            <Tap
              style={styles.sendBtn}
              onPress={onLinkPayout}
              scale
              accessibilityRole="button"
              accessibilityLabel="Link payout account"
              testID="proposal-link-payout"
            >
              <Text style={styles.sendText}>Link payout account</Text>
            </Tap>
          )}
        </>
      ) : !!error && <Text style={styles.error} accessibilityRole="alert" testID="proposal-error">{error}</Text>}

      {certificateRequired && !payoutRequired && !!onUploadCertificate && (
        <Tap
          style={styles.sendBtn}
          onPress={onUploadCertificate}
          scale
          accessibilityRole="button"
          accessibilityLabel="Upload certificate"
          testID="proposal-upload-certificate"
        >
          <Text style={styles.sendText}>Upload certificate</Text>
        </Tap>
      )}

      {!payoutRequired && !certificateRequired && (
        <Tap
          style={[styles.sendBtn, busy && styles.dimmed]}
          onPress={trySend}
          disabled={busy}
          scale
          hitSlop={{ top: 1, bottom: 1 }}
          accessibilityRole="button"
          accessibilityLabel="Send proposal"
          testID="proposal-send"
        >
          {busy ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <Text style={styles.sendText}>Send proposal</Text>
          )}
        </Tap>
      )}
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
    quoteChoices: { gap: 8 },
    quoteChoice: { borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12 },
    quoteChoiceSelected: { borderColor: Colors.primary, backgroundColor: C.wellBg },

    fee: { backgroundColor: C.wellBg, borderRadius: 14, padding: 14, gap: 8 },
    feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    feeLabel: { flexShrink: 1, color: C.ink700, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    feeValue: { color: C.ink900, fontSize: 14, lineHeight: 20, fontWeight: '600', fontFamily: 'Inter' },
    feeTotal: { color: C.ink900, fontSize: 15, lineHeight: 20, fontWeight: '700', fontFamily: 'Inter' },

    feeNote: { color: C.ink500, fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter' },

    tips: { backgroundColor: C.wellBg, borderRadius: 14, padding: 14, gap: 8 },
    tipsTitle: { color: C.ink900, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tipText: { flex: 1, color: C.ink700, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },

    notice: { color: C.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    error: { color: V6Colors.dangerText, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },

    sendBtn: {
      height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary,
    },
    sendText: { color: Colors.onPrimary, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    dimmed: { opacity: 0.6 },

    cancelBtn: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8 },
    cancelText: { color: Colors.link, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
