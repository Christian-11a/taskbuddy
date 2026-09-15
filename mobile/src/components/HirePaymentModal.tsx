/**
 * HirePaymentModal.tsx
 *
 * How the homeowner pays for a hire (BACKEND_SCHEMA.md §29.4). Two ways, same
 * outcome — the job's budget held in escrow until they confirm the work:
 *
 *   Pay from wallet — held from the balance they already have. Instant.
 *   Pay by card     — the full budget on Stripe's hosted Checkout. The hire
 *                     is made by Stripe's webhook once the charge settles,
 *                     not by the app, so the screen behind this waits for the
 *                     application to turn `accepted`.
 *
 * Presentational: the caller owns the requests and passes their state in, so
 * the modal can stay open showing an error rather than disappearing on one.
 *
 * Card is offered only for budgets Stripe can charge (the same ₱20–₱100,000
 * bounds as a top-up). A job posted without a budget holds nothing, so it has
 * a single "Hire" button.
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CreditCard, Wallet } from 'lucide-react-native';
import { V6Colors, V6Radii } from '../constants/theme';
import { MAX_CARD_PHP, MIN_TOPUP_PHP } from '../lib/api';
import { peso } from '../lib/format';

const C = V6Colors;

interface HirePaymentModalProps {
  visible: boolean;
  providerName: string;
  /** The job's budget; null for a job posted before pricing existed. */
  budget: number | null;
  /** The wallet's `available` balance, or null while it loads. */
  available: number | null;
  /** Which option is in flight, if any. */
  busy: 'wallet' | 'card' | null;
  /** A line under the options: an error, or where a card payment stands. */
  message: { text: string; tone: 'error' | 'info' } | null;
  onPayWallet: () => void;
  onPayCard: () => void;
  onAddMoney: () => void;
  onClose: () => void;
}

export default function HirePaymentModal({
  visible,
  providerName,
  budget,
  available,
  busy,
  message,
  onPayWallet,
  onPayCard,
  onAddMoney,
  onClose,
}: HirePaymentModalProps) {
  const hasBudget = budget != null && budget > 0;
  const walletCovers = !hasBudget || (available != null && available >= budget);
  const cardAllowed = hasBudget && budget >= MIN_TOPUP_PHP && budget <= MAX_CARD_PHP;
  const locked = busy !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={locked ? undefined : onClose}>
      <Pressable style={styles.backdrop} onPress={locked ? undefined : onClose} accessible={false}>
        <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            Hire {providerName}
          </Text>
          <Text style={styles.body}>
            {hasBudget
              ? `${peso(budget)} is held in escrow and released to ${providerName} only when you confirm the job is done.`
              : `This job has no budget, so nothing is held — ${providerName} is hired straight away.`}
          </Text>

          <TouchableOpacity
            style={[styles.option, (!walletCovers || locked) && styles.optionDisabled]}
            onPress={onPayWallet}
            disabled={!walletCovers || locked}
            activeOpacity={0.85}
            testID="hire-pay-wallet"
          >
            <Wallet size={20} color={C.cyan700} />
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>{hasBudget ? 'Pay from wallet' : 'Hire'}</Text>
              {hasBudget && (
                <Text style={styles.optionMeta}>
                  {available == null
                    ? 'Checking your balance…'
                    : `${peso(available)} available`}
                </Text>
              )}
            </View>
            {busy === 'wallet' && <ActivityIndicator color={C.cyan700} />}
          </TouchableOpacity>

          {hasBudget && available != null && !walletCovers && (
            <TouchableOpacity onPress={onAddMoney} disabled={locked} activeOpacity={0.8} testID="hire-add-money">
              <Text style={styles.link}>Not enough in your wallet — add money →</Text>
            </TouchableOpacity>
          )}

          {hasBudget && (
            <TouchableOpacity
              style={[styles.option, (!cardAllowed || locked) && styles.optionDisabled]}
              onPress={onPayCard}
              disabled={!cardAllowed || locked}
              activeOpacity={0.85}
              testID="hire-pay-card"
            >
              <CreditCard size={20} color={C.cyan700} />
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>Pay by card</Text>
                <Text style={styles.optionMeta}>
                  {cardAllowed
                    ? `${peso(budget)} on Stripe's secure page`
                    : `Cards take ${peso(MIN_TOPUP_PHP)}–${peso(MAX_CARD_PHP)}`}
                </Text>
              </View>
              {busy === 'card' && <ActivityIndicator color={C.cyan700} />}
            </TouchableOpacity>
          )}

          {message && (
            <Text
              style={[styles.message, message.tone === 'error' ? styles.messageError : styles.messageInfo]}
              testID="hire-payment-message"
            >
              {message.text}
            </Text>
          )}

          <TouchableOpacity onPress={onClose} disabled={locked} activeOpacity={0.8} style={styles.cancel}>
            <Text style={[styles.cancelText, locked && styles.optionDisabled]}>Cancel</Text>
          </TouchableOpacity>
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
  card: { width: '100%', backgroundColor: C.white, borderRadius: V6Radii.card, padding: 22, gap: 10 },
  title: { color: C.ink900, fontSize: 21, fontWeight: '800', fontFamily: 'Inter' },
  body: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 19, marginBottom: 4 },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: C.fieldBorder,
    borderRadius: 14,
    padding: 14,
  },
  optionDisabled: { opacity: 0.5 },
  optionCopy: { flex: 1 },
  optionTitle: { color: C.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  optionMeta: { color: C.ink500, fontSize: 12.5, fontFamily: 'Inter', marginTop: 2 },

  link: { color: C.cyan700, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },
  message: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
  messageError: { color: C.red700 },
  messageInfo: { color: C.ink700 },

  cancel: { alignItems: 'center', paddingTop: 6 },
  cancelText: { color: C.ink500, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
});
