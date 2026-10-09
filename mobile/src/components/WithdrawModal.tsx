/**
 * WithdrawModal.tsx
 *
 * The withdraw sheet, shared by the homeowner and provider wallets (Figma
 * "Withdraw" 133:5912, "Confirm withdrawal" 133:5979). It opens on a form page
 * and asks for one last confirmation before anything is filed.
 *
 * Files a withdrawal request against `POST /wallet/withdrawals`. Two things
 * this deliberately does not pretend:
 *
 * - **The money does not move here.** The request lands `pending` and stays
 *   there until an admin settles it from the console: wallet balances are paid
 *   out by a human sending money and recording the reference. (Card-paid jobs
 *   reach a provider with Stripe payouts set up automatically, without ever
 *   becoming a request — BACKEND_SCHEMA.md §29.5.) The copy says so rather
 *   than showing a success state that implies a transfer.
 * - **`destination` is free text.** A person reads it to make the payment, so
 *   there is nothing to validate it against beyond "not empty" and the 200
 *   character limit. Placeholder text carries the expectation instead.
 *
 * The cap is the wallet's `available` (balance minus already-pending
 * withdrawals), never `balance` — the backend checks the same figure, and
 * checking the looser one here would just move the rejection to the server.
 *
 * Both wallets draw the same sheet (`WithdrawSheetBody`). Each wallet keeps its
 * own request handling, because the two are not the same flow yet.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { CircleAlert, Clock, type LucideIcon } from 'lucide-react-native';
import SheetFrame from './ui/SheetFrame';
import Tap from './ui/Tap';
import TextField from './ui/TextField';
import { api } from '../lib/api';
import { peso } from '../lib/format';

/** Mirrors the backend DTO's `@Length(1, 200)` on `destination`. */
export const WITHDRAW_DESTINATION_MAX = 200;

/**
 * Reads the two fields the way the request sends them, and says what is wrong
 * with them. `amount` and `destination` are the exact values `requestWithdrawal`
 * receives.
 */
export function readWithdrawal(amountText: string, destinationText: string, available: number) {
  const amount = Number(amountText.replace(/,/g, ''));
  const destination = destinationText.trim();
  const amountValid = Number.isFinite(amount) && amount > 0 && amount <= available;
  const amountError = amountText.trim() !== '' && !amountValid
    ? Number.isFinite(amount) && amount > available
      ? `That's more than your ${peso(available)} available.`
      : 'Enter an amount greater than zero.'
    : undefined;
  const destinationError = destination.length === 0
    ? 'Add where to send it.'
    : destination.length > WITHDRAW_DESTINATION_MAX
      ? `Keep it to ${WITHDRAW_DESTINATION_MAX} characters.`
      : undefined;
  return {
    amount,
    destination,
    amountValid,
    destinationValid: destinationError === undefined,
    amountError,
    destinationError,
  };
}

export type WithdrawStep = 'form' | 'confirm';

export interface WithdrawSheetBodyProps {
  step: WithdrawStep;
  /** The wallet's available balance: the most that can be asked for, and what "Wallet after" leaves. */
  available: number;
  amount: string;
  onAmountChange: (text: string) => void;
  destination: string;
  onDestinationChange: (text: string) => void;
  /** Set when the wallet cannot withdraw yet: the fields lock and this line says why. */
  blockedHint?: string;
  /** A request is in flight: the fields lock and the Request button shows a spinner. */
  busy: boolean;
  /** The last failed request. Shown on whichever page is open. */
  error?: string | null;
  onContinue: () => void;
  onRequest: () => void;
  onBack: () => void;
  onCancel: () => void;
}

/**
 * Both pages of the withdraw sheet. The caller owns the state and the request;
 * this only draws the pages and reports taps.
 */
export function WithdrawSheetBody({
  step,
  available,
  amount,
  onAmountChange,
  destination,
  onDestinationChange,
  blockedHint,
  busy,
  error,
  onContinue,
  onRequest,
  onBack,
  onCancel,
}: WithdrawSheetBodyProps) {
  const { styles } = useThemedStyles(createThemedStyles);
  const reading = readWithdrawal(amount, destination, available);
  const locked = busy || !!blockedHint;
  const canContinue = reading.amountValid && reading.destinationValid && !locked;

  if (step === 'confirm') {
    const pageError = error ?? (reading.amountValid ? undefined : reading.amountError);
    return (
      <View style={styles.body}>
        <Text style={styles.overline}>You're withdrawing</Text>
        <Text style={styles.bigAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {peso(reading.amount)}
        </Text>
        <View style={styles.details}>
          <DetailRow label="To" value={reading.destination} />
          <DetailRow label="Wallet after" value={peso(available - reading.amount)} />
          <DetailRow label="Status" value="Pending until sent" />
        </View>
        <Text style={styles.note}>You can cancel it while it's Pending.</Text>
        {pageError ? <MoneySheetError message={pageError} /> : null}
        <MoneySheetButton
          label={`Request ${peso(reading.amount)}`}
          onPress={onRequest}
          disabled={!canContinue}
          busy={busy}
        />
        <MoneySheetLink label="Back" onPress={onBack} disabled={busy} />
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <Text style={styles.title} accessibilityRole="header">Withdraw</Text>
      <View style={styles.availableRow}>
        <Text style={styles.availableLabel}>Available</Text>
        <Text style={styles.availableValue}>{peso(available)}</Text>
      </View>
      <MoneyAmountField
        accessibilityLabel="Amount to withdraw"
        value={amount}
        onChangeText={onAmountChange}
        error={reading.amountError}
        helper={blockedHint}
        editable={!locked}
        autoFocus
      />
      <TextField
        label="Send to"
        value={destination}
        onChangeText={onDestinationChange}
        placeholder="GCash 09XX XXX XXXX, or bank name + account number"
        helper="Account name must match your profile"
        error={reading.destinationError}
        multiline
        maxLength={WITHDRAW_DESTINATION_MAX}
        editable={!locked}
      />
      <MoneyInfoBox
        rows={[
          { icon: Clock, text: 'The TaskBuddy team sends it by hand' },
          { icon: Clock, text: "Shows as Pending in your wallet until it's sent" },
        ]}
      />
      {error ? <MoneySheetError message={error} /> : null}
      <MoneySheetButton label="Continue" onPress={onContinue} disabled={!canContinue} />
      <MoneySheetLink label="Cancel" onPress={onCancel} disabled={busy} />
    </View>
  );
}

/** A big amount field with the peso sign, for the Add money and Withdraw sheets. Errors show after it is left or submitted. */
export function MoneyAmountField({
  accessibilityLabel,
  value,
  onChangeText,
  error,
  helper,
  editable,
  autoFocus = false,
}: {
  accessibilityLabel: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  helper?: string;
  editable: boolean;
  autoFocus?: boolean;
}) {
  const { styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const shownError = error && (touched || submitted) ? error : undefined;

  return (
    <View style={styles.amountWrap}>
      <View style={[styles.amountBox, focused && styles.boxFocused, !!shownError && styles.boxError]}>
        <Text style={styles.currency}>₱</Text>
        <TextInput
          keyboardAppearance={appearance}
          style={styles.amountInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={V6Colors.ink500}
          editable={editable}
          autoFocus={autoFocus}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={shownError}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setTouched(true);
          }}
          onSubmitEditing={() => setSubmitted(true)}
          returnKeyType="done"
        />
      </View>
      {shownError ? (
        <MoneySheetError message={shownError} />
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

/** The primary action of a money sheet: full width, a spinner while busy, and a clearly inactive grey when disabled. */
export function MoneySheetButton({
  label,
  onPress,
  disabled = false,
  busy = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}) {
  const { styles, Colors } = useThemedStyles(createThemedStyles);
  const inactive = disabled && !busy;
  return (
    <Tap
      testID={testID}
      style={[styles.primary, inactive ? styles.primaryOff : styles.primaryOn]}
      onPress={onPress}
      disabled={disabled || busy}
      scale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy }}
    >
      {busy ? (
        <ActivityIndicator color={Colors.onPrimary} />
      ) : (
        <Text style={[styles.primaryLabel, inactive ? styles.primaryLabelOff : styles.primaryLabelOn]}>{label}</Text>
      )}
    </Tap>
  );
}

/** The text action under a money sheet's primary button, sized to a 48 dp target. */
export function MoneySheetLink({
  label,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { styles } = useThemedStyles(createThemedStyles);
  return (
    <Tap
      testID={testID}
      style={[styles.link, disabled && styles.linkOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Text style={styles.linkText}>{label}</Text>
    </Tap>
  );
}

/** A red line with an icon, for a message that explains what to fix. */
export function MoneySheetError({ message }: { message: string }) {
  const { styles, Colors } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.errorRow}>
      <CircleAlert size={14} color={Colors.dangerText} strokeWidth={2.2} />
      <Text style={styles.errorText} accessibilityLiveRegion="polite">{message}</Text>
    </View>
  );
}

/** A tonal box of short facts, each with an icon. */
export function MoneyInfoBox({ rows }: { rows: { icon: LucideIcon; text: string }[] }) {
  const { styles, C } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.infoBox}>
      {rows.map(({ icon: Icon, text }) => (
        <View key={text} style={styles.infoRow}>
          <Icon size={16} color={C.ink700} strokeWidth={2.2} />
          <Text style={styles.infoText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const { styles } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

interface WithdrawModalProps {
  visible: boolean;
  /** Wallet's `available` — balance minus anything already promised. */
  available: number;
  onClose: () => void;
  /** Called after a request is filed, so the caller can reload the wallet. */
  onFiled: () => void;
}

/** The provider's withdraw sheet. The homeowner wallet draws the same sheet with its own request handling. */
export default function WithdrawModal({
  visible,
  available,
  onClose,
  onFiled,
}: WithdrawModalProps) {
  const [step, setStep] = useState<WithdrawStep>('form');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setStep('form');
    setAmount('');
    setDestination('');
    setError(null);
    onClose();
  };

  const submit = async () => {
    const reading = readWithdrawal(amount, destination, available);
    if (!reading.amountValid || !reading.destinationValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.requestWithdrawal({
        amount: reading.amount,
        destination: reading.destination,
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
    <SheetFrame visible={visible} onClose={close} cardProps={{ testID: 'withdraw-dialog' }}>
      <WithdrawSheetBody
        step={step}
        available={available}
        amount={amount}
        onAmountChange={setAmount}
        destination={destination}
        onDestinationChange={setDestination}
        busy={submitting}
        error={error}
        onContinue={() => setStep('confirm')}
        onRequest={() => void submit()}
        onBack={() => setStep('form')}
        onCancel={close}
      />
    </SheetFrame>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    body: { gap: 12 },

    title: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
    availableRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    availableLabel: { color: C.ink500, fontSize: 14, fontFamily: 'Inter' },
    availableValue: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },

    amountWrap: { gap: 6 },
    amountBox: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      minHeight: 64, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1,
      borderColor: C.line, backgroundColor: C.wellBg,
    },
    // Error comes after focus in the array, so it wins when both apply.
    boxFocused: { borderWidth: 1.5, borderColor: Colors.link },
    boxError: { borderWidth: 1.5, borderColor: Colors.dangerText },
    currency: { color: C.ink900, fontSize: 30, fontWeight: '800', fontFamily: 'Inter', marginRight: 4 },
    amountInput: {
      flexShrink: 1, minWidth: 96, paddingVertical: 0, fontSize: 40, fontWeight: '800',
      fontFamily: 'Inter', color: C.ink900, textAlign: 'center',
    },
    helper: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18 },

    infoBox: { borderRadius: 14, backgroundColor: Colors.skeleton, padding: 12, gap: 10 },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    infoText: { flex: 1, color: C.ink700, fontSize: 14, fontFamily: 'Inter', lineHeight: 19 },

    errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    errorText: { flex: 1, color: Colors.dangerText, fontSize: 13, fontFamily: 'Inter', lineHeight: 18 },

    primary: {
      minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 16, paddingVertical: 12,
    },
    primaryOn: { backgroundColor: Colors.primary },
    primaryOff: { backgroundColor: C.ink100 },
    primaryLabel: { fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' },
    primaryLabelOn: { color: Colors.onPrimary },
    primaryLabelOff: { color: C.ink700 },

    link: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    linkOff: { opacity: 0.5 },
    linkText: { color: Colors.link, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },

    overline: { color: C.ink500, fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter', textAlign: 'center' },
    bigAmount: { color: C.ink900, fontSize: 36, fontWeight: '800', fontFamily: 'Inter', textAlign: 'center' },
    details: { borderRadius: 16, backgroundColor: C.wellBg, paddingHorizontal: 14, paddingVertical: 4 },
    detailRow: {
      flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 10,
    },
    detailLabel: { color: C.ink500, fontSize: 14, fontFamily: 'Inter' },
    detailValue: {
      flexShrink: 1, color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', textAlign: 'right',
    },
    note: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18, textAlign: 'center' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
