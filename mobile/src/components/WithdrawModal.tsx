/**
 * WithdrawModal.tsx
 *
 * Files a withdrawal request against `POST /wallet/withdrawals`. Shared by the
 * homeowner and provider wallets, which ask for the same two things.
 *
 * Two things this deliberately does not pretend:
 *
 * - **The money does not move here.** The request lands `pending` and stays
 *   there until an admin settles it from the console: wallet balances are paid
 *   out by a human sending money and recording the reference. (Card-paid jobs
 *   reach a provider with Stripe payouts set up automatically, without ever
 *   becoming a request — BACKEND_SCHEMA.md §29.5.) The copy says so rather
 *   than showing a success state that implies a transfer.
 * - **`destination` is free text.** A person reads it to make the payment, so
 *   there is nothing to validate it against beyond "not empty". Placeholder
 *   text carries the expectation instead.
 *
 * The cap is the wallet's `available` (balance minus already-pending
 * withdrawals), never `balance` — the backend checks the same figure, and
 * checking the looser one here would just move the rejection to the server.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { V6Colors, V6Radii } from '../constants/theme';
import { api } from '../lib/api';
import { peso } from '../lib/format';

const C = V6Colors;

/** Mirrors the backend DTO's `@Length(1, 200)` on `destination`. */
const DESTINATION_MAX = 200;

interface WithdrawModalProps {
  visible: boolean;
  /** Wallet's `available` — balance minus anything already promised. */
  available: number;
  onClose: () => void;
  /** Called after a request is filed, so the caller can reload the wallet. */
  onFiled: () => void;
}

export default function WithdrawModal({
  visible,
  available,
  onClose,
  onFiled,
}: WithdrawModalProps) {
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount.replace(/,/g, ''));
  const amountValid = Number.isFinite(parsed) && parsed > 0 && parsed <= available;
  const canSubmit = amountValid && destination.trim().length > 0 && !submitting;

  const close = () => {
    setAmount('');
    setDestination('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.requestWithdrawal({
        amount: parsed,
        destination: destination.trim(),
      });
      onFiled();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not file the request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessible={false}>
        <Pressable
          style={styles.card}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
        >
          <Text style={styles.title} accessibilityRole="header">Withdraw Funds</Text>
          <Text style={styles.body}>
            We'll review this and send the money by hand, so it isn't instant.
            You'll see it here as Pending until it's settled.
          </Text>

          <View style={styles.amountRow}>
            <Text style={styles.currency}>₱</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={C.ink400}
              editable={!submitting}
              accessibilityLabel="Amount to withdraw"
              autoFocus
            />
          </View>
          <Text style={styles.hint}>{peso(available)} available</Text>

          <Text style={styles.label}>Where should we send it?</Text>
          <TextInput
            style={styles.destInput}
            value={destination}
            onChangeText={setDestination}
            placeholder="GCash 09XX XXX XXXX, or bank name + account number"
            placeholderTextColor={C.ink400}
            editable={!submitting}
            maxLength={DESTINATION_MAX}
            multiline
            accessibilityLabel="Payout destination"
          />

          {amount.length > 0 && !amountValid && (
            <Text style={styles.error}>
              {parsed > available
                ? `That's more than your ${peso(available)} available.`
                : 'Enter an amount greater than zero.'}
            </Text>
          )}
          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.cancel]}
              onPress={close}
              disabled={submitting}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.confirm, !canSubmit && styles.btnDisabled]}
              onPress={submit}
              disabled={!canSubmit}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.confirmText}>Request Withdrawal</Text>
              )}
            </Pressable>
          </View>
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
  title: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
  body: { color: C.ink500, fontSize: 15, fontFamily: 'Inter', lineHeight: 19, marginTop: 6 },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  currency: { color: C.ink900, fontSize: 30, fontWeight: '800', fontFamily: 'Inter', marginRight: 4 },
  amountInput: {
    fontSize: 44,
    fontWeight: '800',
    fontFamily: 'Inter',
    color: C.ink900,
    minWidth: 120,
    textAlign: 'center',
  },
  hint: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center' },

  label: {
    color: C.ink800,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Inter',
    marginTop: 18,
    marginBottom: 6,
  },
  destInput: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: V6Radii.btn,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: 'Inter',
    color: C.ink900,
    minHeight: 62,
    textAlignVertical: 'top',
  },

  error: { color: '#ef4444', fontSize: 14, fontFamily: 'Inter', marginTop: 8 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: V6Radii.btn,
    paddingVertical: 13,
  },
  btnDisabled: { opacity: 0.5 },
  cancel: { backgroundColor: C.ink50 },
  cancelText: { color: C.ink500, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
  confirm: { backgroundColor: C.cyan700 },
  confirmText: { color: C.white, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
});
