import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ChevronRight, CreditCard, Landmark, Smartphone, Trash2 } from 'lucide-react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import TextField from '../../../src/components/ui/TextField';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { api, type PayoutAccount, type PayoutMethod } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useScrollToFirstError } from '../../../src/hooks/useScrollToFirstError';
import {
  digitsOnly, formatPayoutNumber, maskedNumber, payoutErrors, payoutNumberHelper, payoutNumberLabel,
  payoutStatus, payoutTitle, type PayoutFormErrors,
} from '../../../src/lib/payoutLabels';
import { cleanText } from '../../../src/lib/textRules';

export { payoutStatus, payoutTitle };

export const PAYOUT_METHODS: { key: PayoutMethod; label: string }[] = [
  { key: 'gcash', label: 'GCash' },
  { key: 'maya', label: 'Maya' },
  { key: 'bank', label: 'Bank' },
];

const FIELD_ORDER = ['bank', 'name', 'number'] as const;

function methodName(account: Pick<PayoutAccount, 'method' | 'bank_name'>): string {
  return account.method === 'bank' ? account.bank_name ?? 'Bank' : account.method === 'gcash' ? 'GCash' : 'Maya';
}

/** How a linked account reads: "GCash ••••4567", "BPI ••••0123". */
export function accountLabel(account: Pick<PayoutAccount, 'method' | 'bank_name' | 'account_last4'>): string {
  return `${methodName(account)} ••••${account.account_last4}`;
}

/**
 * Where a provider's payouts are sent: one GCash, Maya or bank account. Payouts
 * go out through Xendit's sandbox, so no real money moves.
 */
export default function SPPayoutAccountScreen({ onBack, onOpenEarnings }: { onBack: () => void; onOpenEarnings?: () => void }) {
  const { styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const account = useAsyncData(() => api.payoutAccount(), []);
  const banks = useAsyncData(() => api.payoutBanks(), []);
  const { scrollRef, fieldLayout, inputRef, scrollToFirstError } = useScrollToFirstError(FIELD_ORDER);
  const [method, setMethod] = useState<PayoutMethod>('gcash');
  const [bankCode, setBankCode] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<PayoutFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [changing, setChanging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const linked = account.data ?? null;
  const showForm = linked ? changing : account.data === null && !account.loading;

  const touch = () => {
    setSaved(false);
    setSubmitError(null);
  };
  const clearError = (key: keyof PayoutFormErrors) => setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));

  const startChange = () => {
    if (!linked) return;
    setMethod(linked.method);
    setAccountName(linked.account_name);
    setAccountNumber('');
    const wanted = (linked.bank_name ?? '').trim().toLowerCase();
    const match = linked.method === 'bank' && wanted ? (banks.data ?? []).find((b) => b.name.trim().toLowerCase() === wanted) : undefined;
    setBankCode(match?.code ?? '');
    setErrors({});
    touch();
    setChanging(true);
  };

  const chooseMethod = (next: PayoutMethod) => {
    touch();
    setMethod(next);
    setAccountNumber('');
    setErrors({});
  };

  const save = async () => {
    const found = payoutErrors({ method, bankCode, accountName, accountNumber });
    setErrors(found);
    if (scrollToFirstError(found)) return;
    setBusy(true);
    setSubmitError(null);
    setSaved(false);
    try {
      await api.linkPayoutAccount({
        method,
        bank_code: method === 'bank' ? bankCode : undefined,
        account_name: cleanText(accountName),
        account_number: digitsOnly(accountNumber),
      });
      setAccountNumber('');
      setChanging(false);
      setSaved(true);
      account.reload();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not save this account.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setSubmitError(null);
    try {
      await api.unlinkPayoutAccount();
      setConfirmRemove(false);
      setChanging(false);
      setSaved(false);
      account.reload();
    } catch (e) {
      setConfirmRemove(false);
      setSubmitError(e instanceof Error ? e.message : 'Could not remove this account.');
    } finally {
      setBusy(false);
    }
  };

  const MethodIcon = linked?.method === 'bank' ? Landmark : linked?.method === 'maya' ? CreditCard : Smartphone;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Payout account</Text>
      </View>
      <KeyboardAwareScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          When a client releases a payment, it is sent to this account, less the platform fee. TaskBuddy does not keep
          a balance for you. Prototype: payouts go through Xendit's test mode and no real money moves.
        </Text>

        {account.loading && !account.data && <ContentSkeleton variant="list" />}
        {!!account.error && <LoadErrorCard title="Couldn't load your account" message={account.error} onRetry={account.reload} />}

        {linked && (
          <View style={styles.card} testID="linked-account">
            <View style={styles.cardTop}>
              <View style={styles.methodIcon}><MethodIcon size={22} color={V6Colors.ink700} /></View>
              <View style={styles.cardText}>
                <Text style={styles.cardValue}>{methodName(linked)}</Text>
                <Text style={styles.cardMeta}>{linked.account_name}</Text>
                <Text style={styles.cardNumber} testID="masked-number">{maskedNumber(linked.account_last4)}</Text>
              </View>
            </View>
            <Text style={styles.goesHere}>Payouts go here</Text>
            {!changing && (
              <View style={styles.cardActions}>
                <Tap onPress={startChange} disabled={busy} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel="Change account">
                  <Text style={styles.actionText}>Change account</Text>
                </Tap>
                <Tap onPress={() => setConfirmRemove(true)} disabled={busy} style={[styles.actionBtn, styles.actionDanger]} accessibilityRole="button" accessibilityLabel="Remove">
                  <Trash2 size={16} color={V6Colors.dangerText} />
                  <Text style={[styles.actionText, styles.actionTextDanger]}>Remove</Text>
                </Tap>
              </View>
            )}
          </View>
        )}
        {saved && <Text accessibilityLiveRegion="polite" style={styles.savedText}>Account saved.</Text>}
        {!showForm && !!submitError && <Text accessibilityRole="alert" style={styles.errorText}>{submitError}</Text>}

        {account.data === null && !account.loading && (
          <View style={styles.card} testID="no-account">
            <Text style={styles.cardValue}>No payout account yet</Text>
            <Text style={styles.cardMeta}>
              Payouts go to your GCash, Maya or a bank account when the client confirms the job is done. Add one below.
            </Text>
          </View>
        )}

        {showForm && (
          <>
            <Text style={styles.label}>{linked ? 'Change account' : 'Link an account'}</Text>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {PAYOUT_METHODS.map((item) => {
                const selected = method === item.key;
                return (
                  <Tap
                    key={item.key}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected }}
                    onPress={() => chooseMethod(item.key)}
                    style={[styles.chip, selected && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
                  </Tap>
                );
              })}
            </View>
            {method === 'bank' && (
              <View style={styles.field} onLayout={fieldLayout('bank')}>
                <Text style={styles.label}>Bank</Text>
                {!!banks.error && <LoadErrorCard title="Couldn't load the bank list" message={banks.error} onRetry={banks.reload} />}
                <View style={styles.chips} accessibilityRole="radiogroup">
                  {(banks.data ?? []).map((bank) => {
                    const selected = bankCode === bank.code;
                    return (
                      <Tap
                        key={bank.code}
                        disabled={busy}
                        accessibilityRole="radio"
                        accessibilityLabel={bank.name}
                        accessibilityState={{ selected }}
                        onPress={() => { touch(); clearError('bank'); setBankCode(bank.code); }}
                        style={[styles.chip, selected && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextOn]}>{bank.name}</Text>
                      </Tap>
                    );
                  })}
                </View>
                {!!errors.bank && <Text accessibilityRole="alert" style={styles.errorText}>{errors.bank}</Text>}
              </View>
            )}
            <View onLayout={fieldLayout('name')}>
              <TextField
                ref={inputRef('name')}
                label="Account holder name"
                value={accountName}
                onChangeText={(text) => { touch(); clearError('name'); setAccountName(text); }}
                error={errors.name}
                submitted
                maxLength={120}
                editable={!busy}
                keyboardAppearance={appearance}
              />
            </View>
            <View onLayout={fieldLayout('number')}>
              <TextField
                ref={inputRef('number')}
                label={payoutNumberLabel(method)}
                value={accountNumber}
                onChangeText={(text) => { touch(); clearError('number'); setAccountNumber(formatPayoutNumber(method, text)); }}
                helper={payoutNumberHelper(method)}
                error={errors.number}
                submitted
                keyboardType="number-pad"
                maxLength={method === 'bank' ? 16 : 13}
                editable={!busy}
                keyboardAppearance={appearance}
              />
            </View>
            {!!submitError && <Text accessibilityRole="alert" style={styles.errorText}>{submitError}</Text>}
            {changing && (
              <Tap onPress={() => { setChanging(false); setErrors({}); setSubmitError(null); }} disabled={busy} style={styles.actionBtn} accessibilityRole="button" accessibilityLabel="Cancel">
                <Text style={styles.actionText}>Cancel</Text>
              </Tap>
            )}
          </>
        )}

        <Tap
          onPress={() => onOpenEarnings?.()}
          style={styles.linkRow}
          accessibilityRole="button"
          accessibilityLabel="See your earnings and payouts"
        >
          <Text style={styles.linkText}>See your earnings and payouts</Text>
          <ChevronRight size={18} color={V6Colors.ink500} />
        </Tap>
      </KeyboardAwareScrollView>

      {showForm && (
        <BottomActionBar
          primaryLabel={busy ? 'Saving…' : 'Save account'}
          onPrimary={() => void save()}
          busy={busy}
          primaryDisabled={busy}
        />
      )}

      <ConfirmationModal
        visible={confirmRemove}
        title="Remove payout account?"
        message="Payouts will wait until you add a new account."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: V6Colors.surface, paddingHorizontal: 20, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, color: V6Colors.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 24, gap: 14 },
    intro: { color: V6Colors.ink500, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    warning: { color: Colors.dangerText, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    label: { color: V6Colors.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    listTitle: { marginTop: 8, fontSize: 15, color: V6Colors.ink900 },
    field: { gap: 8 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardText: { flex: 1, gap: 2 },
    methodIcon: {
      width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
      backgroundColor: V6Colors.canvas, borderWidth: 1, borderColor: V6Colors.line,
    },
    cardNumber: { color: V6Colors.ink900, fontSize: 15, fontWeight: '600', letterSpacing: 1, fontFamily: 'Inter' },
    goesHere: { color: Colors.primary, fontSize: 13, fontWeight: '700', fontFamily: 'Inter', marginTop: 4 },
    cardActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    actionBtn: {
      minHeight: 44, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', gap: 6,
      alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: V6Colors.line,
    },
    actionDanger: { borderColor: V6Colors.dangerText },
    actionText: { color: V6Colors.ink700, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    actionTextDanger: { color: V6Colors.dangerText },
    linkRow: {
      minHeight: 52, paddingHorizontal: 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    linkText: { color: V6Colors.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
    card: {
      padding: 16, borderRadius: 16, gap: 2,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    cardLabel: { color: V6Colors.ink500, fontSize: 13, fontFamily: 'Inter' },
    cardValue: { color: V6Colors.ink900, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
    cardMeta: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center',
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: V6Colors.ink700, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    chipTextOn: { color: Colors.onPrimary, fontWeight: '700' },
    payout: {
      flexDirection: 'row', padding: 14, borderRadius: 14,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    payoutText: { flex: 1, gap: 2 },
    payoutHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    statusText: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },
    errorText: { color: Colors.dangerText, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    savedText: { color: Colors.primary, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
