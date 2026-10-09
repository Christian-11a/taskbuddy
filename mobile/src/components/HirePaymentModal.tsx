/**
 * HirePaymentModal.tsx
 *
 * How the homeowner pays for a hire (BACKEND_SCHEMA.md §29.4). Two ways, same
 * outcome — the job's budget held in escrow through the three-day completion warranty:
 *
 *   Pay from wallet — held from the balance they already have. Instant.
 *   Pay by card     — the full budget on Stripe's hosted Checkout. The hire
 *                     is made by Stripe's webhook once the charge settles,
 *                     not by the app, so the screen behind this waits for the
 *                     application to turn `accepted`.
 *
 * Two pages in one sheet. Page 1 is the choice: picking a payment option only
 * selects it, and Continue moves on. Page 2 is the one last check: what is paid,
 * from where, and what is left, with "Confirm and hire" as the only thing that
 * pays. Nothing is charged by choosing or by opening page 2.
 *
 * Presentational: the caller owns the requests and passes their state in, so
 * the modal can stay open showing an error rather than disappearing on one.
 *
 * Card is offered only for budgets Stripe can charge (the same ₱50–₱100,000
 * bounds as a top-up). A job posted without a budget holds nothing, so it skips
 * the choice: "Hire" goes to the confirm page, and confirming pays from the wallet
 * path (the hire itself holds nothing).
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
import { CreditCard, ShieldCheck, Wallet } from 'lucide-react-native';
import { MAX_CARD_PHP, MIN_TOPUP_PHP } from '../lib/api';
import { peso } from '../lib/format';

interface HirePaymentModalProps {
  visible: boolean;
  providerName: string;
  /** The job's title, shown in the summary and as "Held for". */
  jobTitle: string | null;
  /** The job's budget; null for a job posted before pricing existed. */
  budget: number | null;
  /** The wallet's `available` balance, or null while it loads. */
  available: number | null;
  /** True while the job and wallet are still being read: nothing can be paid yet. */
  loading?: boolean;
  /**
   * True when the job or wallet could not be read, so the budget is unknown. The
   * sheet then offers no hire at all: no options, no escrow or no-budget copy,
   * and Continue stays disabled. Only the error message and Cancel remain.
   */
  loadFailed?: boolean;
  /** Which option is in flight, if any. */
  busy: 'wallet' | 'card' | null;
  /** A line under the options: an error, or where a card payment stands. */
  message: { text: string; tone: 'error' | 'info' } | null;
  onPayWallet: () => void;
  onPayCard: () => void;
  onAddMoney: () => void;
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
  available,
  loading = false,
  loadFailed = false,
  busy,
  message,
  onPayWallet,
  onPayCard,
  onAddMoney,
  onClose,
}: HirePaymentModalProps) {
  const { C, styles, V6Colors, Colors } = useThemedStyles(createThemedStyles);
  const [page, setPage] = useState<Page>('choose');
  const [choice, setChoice] = useState<Choice | null>(null);

  // Every opening starts on the choice with nothing selected. Layout effect, so
  // the previous visit's confirm page is never painted for a frame.
  useLayoutEffect(() => {
    if (visible) {
      setPage('choose');
      setChoice(null);
    }
  }, [visible]);

  const hasBudget = budget != null && budget > 0;
  const walletCovers = hasBudget && available != null && available >= budget;
  const cardAllowed = hasBudget && budget >= MIN_TOPUP_PHP && budget <= MAX_CARD_PHP;
  const locked = busy !== null;

  // With no budget the only way to hire is the wallet path, which holds nothing.
  const payingByCard = hasBudget && choice === 'card';
  const usable = !loading && !loadFailed && (!hasBudget || (choice === 'wallet' ? walletCovers : choice === 'card' ? cardAllowed : false));
  // A failed load can't be a hire: the label says Continue, not a no-budget "Hire".
  const primaryLabel = hasBudget || loadFailed ? 'Continue' : `Hire ${providerName}`;

  const escrowLine = hasBudget
    ? `${peso(budget)} is held in escrow and released to ${providerName} after the three-day warranty ends, unless a complaint is open.`
    : `This job has no budget, so nothing is held — ${providerName} is hired straight away.`;

  const walletMeta = available == null
    ? 'Checking your balance…'
    : walletCovers
      ? `${peso(available)} available`
      : `You have ${peso(available)}, need ${peso(budget)}`;

  const cardMeta = cardAllowed
    ? `${peso(budget)} on Stripe's secure page`
    : budget != null && budget < MIN_TOPUP_PHP
      ? `Cards need at least ${peso(MIN_TOPUP_PHP)}`
      : `Cards can't take more than ${peso(MAX_CARD_PHP)}`;

  const messageView = message && (
    <Text
      style={[styles.message, message.tone === 'error' ? styles.messageError : styles.messageInfo]}
      testID="hire-payment-message"
    >
      {message.text}
    </Text>
  );

  const choosePage = (
    <>
      <Text style={styles.title} accessibilityRole="header">
        Hire {providerName}
      </Text>

      {!loadFailed && (!!jobTitle || hasBudget) && (
        <View style={styles.summary}>
          {!!jobTitle && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Job</Text>
              <Text style={styles.summaryValue} numberOfLines={2}>{jobTitle}</Text>
            </View>
          )}
          {hasBudget && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount</Text>
              <Text style={styles.summaryValue} accessibilityLabel={`Amount ${peso(budget)}`}>{peso(budget)}</Text>
            </View>
          )}
        </View>
      )}

      {!loadFailed && (
        <View style={styles.noteRow}>
          <ShieldCheck size={16} color={V6Colors.link} />
          <Text style={styles.noteText}>{escrowLine}</Text>
        </View>
      )}

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={V6Colors.link} />
          <Text style={styles.loadingText}>Checking your balance…</Text>
        </View>
      )}

      {hasBudget && !loading && !loadFailed && (
        <>
          <Text style={styles.sectionLabel}>Pay with</Text>
          <PaymentOption
            title="Wallet"
            meta={walletMeta}
            icon={Wallet}
            selected={choice === 'wallet'}
            disabled={!walletCovers || locked}
            onSelect={() => setChoice('wallet')}
          />
          {available != null && !walletCovers && (
            <Tap
              style={[styles.addMoney, locked && styles.disabled]}
              onPress={onAddMoney}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel="Add money to wallet"
              accessibilityState={{ disabled: locked }}
            >
              <Text style={styles.addMoneyText}>Add money to wallet</Text>
            </Tap>
          )}
          <PaymentOption
            title="Card"
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

  const confirmLabel = hasBudget ? `Confirm and hire · ${peso(budget)}` : 'Confirm and hire';

  const confirmPage = (
    <>
      <Text style={styles.eyebrow}>{hasBudget ? "You're paying" : "You're hiring"}</Text>
      {hasBudget ? (
        <Text style={styles.amount} accessibilityLabel={`Amount ${peso(budget)}`}>{peso(budget)}</Text>
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
            <Text style={styles.summaryValue}>{payingByCard ? 'Card' : 'Wallet'}</Text>
          </View>
        )}
        {hasBudget && !payingByCard && available != null && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Wallet after</Text>
            <Text style={styles.summaryValue}>{peso(available - budget)}</Text>
          </View>
        )}
        {!!jobTitle && (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{hasBudget ? 'Held for' : 'Job'}</Text>
            <Text style={styles.summaryValue} numberOfLines={2}>{jobTitle}</Text>
          </View>
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
          <Text style={styles.primaryText}>{confirmLabel}</Text>
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

  return (
    <SheetFrame visible={visible} onClose={locked ? undefined : onClose} contentStyle={styles.card}>
      {page === 'choose' ? choosePage : confirmPage}
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
    disabled: { opacity: 0.5 },
  });
  return { Colors, V6Colors, C, styles };
}
