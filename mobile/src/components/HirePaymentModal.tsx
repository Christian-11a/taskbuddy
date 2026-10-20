/**
 * HirePaymentModal.tsx
 *
 * How the homeowner pays for a hire (BACKEND_SCHEMA.md §29.4): the job's price,
 * paid online and held in escrow until the client confirms the job is done.
 * There is no wallet (migration 0056). The client pays on a hosted checkout —
 * Xendit test mode, with GCash, Maya, card or online banking — and the hire
 * is made by the payment webhook, not by the app, so the screen behind this
 * waits for the application to turn `accepted`.
 *
 * Two pages in one sheet. Page 1 is the choice: picking a payment option only
 * selects it, and Continue moves on. Page 2 is the one last check: what is paid,
 * from where, and what is left, with "Confirm and hire" as the only thing that
 * pays. Nothing is charged by choosing or by opening page 2.
 *
 * A card payment the server has not confirmed yet is a wait, not a choice: the
 * sheet explains it and offers one status check. No pay option is shown during
 * the wait; they come back only after the person starts over on purpose.
 *
 * Presentational: the caller owns the requests and passes their state in, so
 * the modal can stay open showing an error rather than disappearing on one.
 *
 * Online payment is offered for prices from ₱50 to ₱100,000. A job posted
 * without a budget holds nothing, so it skips the choice: "Hire" goes to the
 * confirm page, and confirming hires straight away.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import PaymentOption from './ui/PaymentOption';
import Banner from './ui/Banner';
import ConfirmationModal from './ConfirmationModal';
import { CreditCard, ShieldCheck } from 'lucide-react-native';
import { MAX_CARD_PHP, MIN_TOPUP_PHP } from '../lib/api';
import { peso } from '../lib/format';
import type { JobFee } from '../lib/feeBreakdown';

interface HirePaymentModalProps {
  visible: boolean;
  providerName: string;
  /** The job's title, shown in the summary and as "Held for". */
  jobTitle: string | null;
  /** The selected proposal's total quote; null for a legacy no-price job. */
  budget: number | null;
  postedBudget?: number | null;
  fee?: JobFee | null;
  /** True while the job is still being read: nothing can be paid yet. */
  loading?: boolean;
  /**
   * True when the job or wallet could not be read, so the budget is unknown. The
   * sheet then offers no hire at all: no options, no escrow or no-budget copy,
   * and Continue stays disabled. Only the error message and Cancel remain.
   */
  loadFailed?: boolean;
  /** Which action is in flight, if any: a payment, or a status check during a wait. */
  busy: 'wallet' | 'card' | 'check' | null;
  /** A line under the options: an error, or where a card payment stands. */
  message: { text: string; tone: 'error' | 'info' } | null;
  /**
   * Set while a card payment for this proposal waits for the server. The sheet
   * then shows the wait instead of the pay options: one status check, and a
   * deliberate way to start over, which asks first.
   */
  awaiting?: { onCheckPayment: () => void; onStartNewPayment: () => void } | null;
  /** Hires a job that has no budget, which holds nothing. */
  onPayWallet: () => void;
  /** Opens the online checkout for the job's price. */
  onPayCard: () => void;
  onClose: () => void;
}

type Page = 'choose' | 'confirm';
type Choice = 'wallet' | 'card';

const REFUND_NOTE = 'If the job is cancelled, the money comes back as the cancellation rules say.';

export default function HirePaymentModal({
  visible,
  providerName,
  jobTitle,
  budget,
  postedBudget = null,
  fee = null,
  loading = false,
  loadFailed = false,
  busy,
  message,
  awaiting = null,
  onPayWallet,
  onPayCard,
  onClose,
}: HirePaymentModalProps) {
  const { C, styles, V6Colors, Colors } = useThemedStyles(createThemedStyles);
  const [page, setPage] = useState<Page>('choose');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [startOverOpen, setStartOverOpen] = useState(false);

  // Every opening starts on the choice with nothing selected. Layout effect, so
  // the previous visit's confirm page is never painted for a frame.
  useLayoutEffect(() => {
    if (visible) {
      setPage('choose');
      setChoice(null);
    }
  }, [visible]);

  const hasBudget = budget != null && budget > 0;
  const cardAllowed = hasBudget && budget >= MIN_TOPUP_PHP && budget <= MAX_CARD_PHP;
  const locked = busy !== null;

  // With no budget the only way to hire is the wallet path, which holds nothing.
  const payingByCard = hasBudget && choice === 'card';
  const usable = !loading && !loadFailed && (!hasBudget || (choice === 'card' && cardAllowed));
  // A failed load can't be a hire: the label says Continue, not a no-budget "Hire".
  const primaryLabel = hasBudget || loadFailed ? 'Continue' : `Hire ${providerName}`;

  const escrowLine = hasBudget
    ? `${peso(budget)} is held in escrow and released to ${providerName} as soon as you confirm the job is done.`
    : `This job has no budget, so nothing is held — ${providerName} is hired straight away.`;

  const cardMeta = cardAllowed
    ? `${peso(budget)} on Xendit's secure page (test mode)`
    : budget != null && budget < MIN_TOPUP_PHP
      ? `Online payments need at least ${peso(MIN_TOPUP_PHP)}`
      : `Online payments can't take more than ${peso(MAX_CARD_PHP)}`;

  const messageView = message && (
    <Text
      style={[styles.message, message.tone === 'error' ? styles.messageError : styles.messageInfo]}
      testID="hire-payment-message"
    >
      {message.text}
    </Text>
  );

  const summary = !loadFailed && (!!jobTitle || hasBudget) && (
    <View style={styles.summary}>
      {!!jobTitle && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Job</Text>
          <Text style={styles.summaryValue} numberOfLines={2}>{jobTitle}</Text>
        </View>
      )}
      {hasBudget && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>You pay</Text>
          <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityLabel={`Amount ${peso(budget)}`}>{peso(budget)}</Text>
        </View>
      )}
      {hasBudget && postedBudget != null && postedBudget !== budget && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Posted budget</Text>
          <Text style={styles.summaryValue}>{peso(postedBudget)}</Text>
        </View>
      )}
      {hasBudget && fee && (
        <>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Platform fee</Text>
            <Text style={styles.summaryValue}>{peso(fee.amount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Provider receives</Text>
            <Text style={styles.summaryValue}>{peso(fee.provider_receives)}</Text>
          </View>
        </>
      )}
    </View>
  );

  const choosePage = (
    <>
      <Text style={styles.title} accessibilityRole="header">
        Hire {providerName}
      </Text>

      {summary}

      {!loadFailed && (
        <View style={styles.noteRow}>
          <ShieldCheck size={16} color={V6Colors.link} />
          <Text style={styles.noteText}>{escrowLine}</Text>
        </View>
      )}

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={V6Colors.link} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      )}

      {hasBudget && !loading && !loadFailed && (
        <>
          <Text style={styles.sectionLabel}>Pay with</Text>
          <PaymentOption
            title="GCash, Maya, card or bank"
            meta={cardMeta}
            icon={CreditCard}
            selected={choice === 'card'}
            disabled={!cardAllowed || locked}
            onSelect={() => setChoice('card')}
          />
        </>
      )}

      {messageView}

      <Tap
        style={[styles.primary, (!usable || locked) && styles.disabled]}
        onPress={() => {
          if (usable) setPage('confirm');
        }}
        disabled={!usable || locked}
        scale
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        accessibilityState={{ disabled: !usable || locked }}
      >
        <Text style={styles.primaryText}>{primaryLabel}</Text>
      </Tap>

      <Tap
        onPress={onClose}
        disabled={locked}
        activeOpacity={0.8}
        style={styles.cancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
        accessibilityState={{ disabled: locked }}
      >
        <Text style={[styles.cancelText, locked && styles.disabled]}>Cancel</Text>
      </Tap>
    </>
  );

  const confirmLabel = hasBudget ? `Hire and pay ${peso(budget)}` : 'Confirm and hire';

  const confirmPage = (
    <>
      <Text style={styles.eyebrow}>{hasBudget ? "You're paying" : "You're hiring"}</Text>
      {hasBudget ? (
        <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityLabel={`Amount ${peso(budget)}`}>{peso(budget)}</Text>
      ) : (
        <Text style={styles.hireName} numberOfLines={2}>{providerName}</Text>
      )}
      <Text style={styles.body}>
        {hasBudget ? `to hire ${providerName}` : "Nothing is held — they're hired straight away."}
      </Text>

      <View style={styles.summary}>
        {hasBudget && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>From</Text>
            <Text style={styles.summaryValue}>GCash, Maya, card or bank</Text>
          </View>
        )}
        {!!jobTitle && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{hasBudget ? 'Held for' : 'Job'}</Text>
            <Text style={styles.summaryValue} numberOfLines={2}>{jobTitle}</Text>
          </View>
        )}
        {hasBudget && fee && (
          <>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Platform fee</Text>
              <Text style={styles.summaryValue}>{peso(fee.amount)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Provider receives</Text>
              <Text style={styles.summaryValue}>{peso(fee.provider_receives)}</Text>
            </View>
          </>
        )}
      </View>

      {hasBudget && (
        <View style={styles.noteRow}>
          <ShieldCheck size={16} color={V6Colors.link} />
          <Text style={styles.noteText}>{REFUND_NOTE}</Text>
        </View>
      )}

      {messageView}

      <Tap
        style={[styles.primary, locked && styles.disabled]}
        onPress={() => (payingByCard ? onPayCard() : onPayWallet())}
        disabled={locked}
        scale
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        accessibilityState={{ disabled: locked }}
      >
        {busy !== null ? (
          <ActivityIndicator color={Colors.onPrimary} />
        ) : (
          <Text style={styles.primaryText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{confirmLabel}</Text>
        )}
      </Tap>

      <Tap
        onPress={() => setPage('choose')}
        disabled={locked}
        activeOpacity={0.8}
        style={styles.cancel}
        accessibilityRole="button"
        accessibilityLabel="Back"
        accessibilityState={{ disabled: locked }}
      >
        <Text style={[styles.backText, locked && styles.disabled]}>Back</Text>
      </Tap>
    </>
  );

  // The card payment is with the server. No pay option is offered; the one way
  // back is "Start a new payment", which asks first.
  const waitingPage = (
    <>
      <Text style={styles.title} accessibilityRole="header">
        Hire {providerName}
      </Text>

      <Banner tone="warning" message="We're still confirming your payment. If you already paid, please don't pay again." />

      {summary}

      {messageView}

      <Tap
        style={[styles.primary, locked && styles.disabled]}
        onPress={() => awaiting?.onCheckPayment()}
        disabled={locked}
        scale
        accessibilityRole="button"
        accessibilityLabel="Check payment status"
        accessibilityState={{ disabled: locked }}
      >
        {busy === 'check' ? (
          <ActivityIndicator color={Colors.onPrimary} />
        ) : (
          <Text style={styles.primaryText}>Check payment status</Text>
        )}
      </Tap>

      <Tap
        onPress={() => setStartOverOpen(true)}
        disabled={locked}
        activeOpacity={0.8}
        style={styles.startOver}
        accessibilityRole="button"
        accessibilityLabel="Start a new payment"
        accessibilityState={{ disabled: locked }}
      >
        <Text style={[styles.startOverText, locked && styles.disabled]}>Start a new payment</Text>
      </Tap>

      <Tap
        onPress={onClose}
        disabled={locked}
        activeOpacity={0.8}
        style={styles.cancel}
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityState={{ disabled: locked }}
      >
        <Text style={[styles.cancelText, locked && styles.disabled]}>Close</Text>
      </Tap>

      <ConfirmationModal
        visible={startOverOpen}
        title="Start a new payment?"
        message="Only do this if you did not complete the payment. If you already paid, wait a moment and check the status instead."
        confirmLabel="Yes, start over"
        cancelLabel="Keep waiting"
        onConfirm={() => {
          setStartOverOpen(false);
          // The pay options come back on a clean choice, with nothing selected.
          setPage('choose');
          setChoice(null);
          awaiting?.onStartNewPayment();
        }}
        onCancel={() => setStartOverOpen(false)}
      />
    </>
  );

  return (
    <SheetFrame visible={visible} onClose={locked ? undefined : onClose} contentStyle={styles.card}>
      {awaiting ? waitingPage : page === 'choose' ? choosePage : confirmPage}
    </SheetFrame>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    card: { paddingHorizontal: 22, gap: 12 },
    title: { color: C.ink900, fontSize: 20, fontWeight: '800', fontFamily: 'Inter', marginTop: 4 },
    eyebrow: { color: C.ink500, fontSize: 13, fontWeight: '600', fontFamily: 'Inter', textAlign: 'center', marginTop: 4 },
    amount: { color: C.ink900, fontSize: 32, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.6, textAlign: 'center' },
    hireName: { color: C.ink900, fontSize: 22, fontWeight: '800', fontFamily: 'Inter', textAlign: 'center' },
    body: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 19, textAlign: 'center' },

    summary: { backgroundColor: V6Colors.wellBg, borderRadius: 14, padding: 14, gap: 10 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    summaryLabel: { color: C.ink500, fontSize: 13, fontFamily: 'Inter' },
    summaryValue: { flexShrink: 1, color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', textAlign: 'right' },

    noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    noteText: { flex: 1, color: C.ink700, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    sectionLabel: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginTop: 2 },
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
    loadingText: { color: C.ink500, fontSize: 14, fontFamily: 'Inter' },

    addMoney: {
      minHeight: 44, borderRadius: 14, backgroundColor: Colors.primaryTonal,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
    },
    addMoneyText: { color: Colors.primaryDeep, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },

    primary: {
      minHeight: 48, borderRadius: 16, backgroundColor: Colors.primary,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 4,
    },
    primaryText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', textAlign: 'center' },

    message: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    messageError: { color: V6Colors.dangerText },
    messageInfo: { color: C.ink700 },

    cancel: { alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 14 },
    cancelText: { color: C.ink700, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    backText: { color: Colors.link, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
    startOver: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 14 },
    startOverText: { color: Colors.link, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', textAlign: 'center' },
    disabled: { opacity: 0.5 },
  });
  return { Colors, V6Colors, C, styles };
}
