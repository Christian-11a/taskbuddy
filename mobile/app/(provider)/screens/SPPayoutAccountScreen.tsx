import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import TextField from '../../../src/components/ui/TextField';
import { api, type PayoutAccount, type PayoutMethod } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { peso, shortDate } from '../../../src/lib/format';
import { cleanText, textLength } from '../../../src/lib/textRules';

export const PAYOUT_METHODS: { key: PayoutMethod; label: string; numberLabel: string }[] = [
  { key: 'gcash', label: 'GCash', numberLabel: 'GCash mobile number' },
  { key: 'maya', label: 'Maya', numberLabel: 'Maya mobile number' },
  { key: 'bank', label: 'Bank', numberLabel: 'Account number' },
];

/** How a linked account reads: "GCash ••••4567", "BPI ••••0123". */
export function accountLabel(account: Pick<PayoutAccount, 'method' | 'bank_name' | 'account_last4'>): string {
  const name = account.method === 'bank' ? account.bank_name ?? 'Bank' : account.method === 'gcash' ? 'GCash' : 'Maya';
  return `${name} ••••${account.account_last4}`;
}

/** The first thing wrong with the form, or null. */
export function payoutProblem(input: { method: PayoutMethod; bankName: string; accountName: string; accountNumber: string }): string | null {
  if (input.method === 'bank' && textLength(input.bankName) < 2) return 'Enter the bank name, e.g. BPI.';
  if (textLength(input.accountName) < 2) return 'Enter the account holder name.';
  const digits = input.accountNumber.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 20) return 'Enter a number of 6 to 20 digits.';
  return null;
}

/**
 * Where a provider's payouts are sent: a GCash, Maya or bank account. This is
 * a prototype, so a payout is recorded as sent here and no money moves.
 */
export default function SPPayoutAccountScreen({ onBack }: { onBack: () => void }) {
  const { styles, Colors, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const account = useAsyncData(() => api.payoutAccount(), []);
  const history = useAsyncData(() => api.paymentHistory(), []);
  const [method, setMethod] = useState<PayoutMethod>('gcash');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!account.data) return;
    setMethod(account.data.method);
    setBankName(account.data.bank_name ?? '');
    setAccountName(account.data.account_name);
  }, [account.data]);

  const save = async () => {
    const problem = payoutProblem({ method, bankName, accountName, accountNumber });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.linkPayoutAccount({
        method,
        bank_name: method === 'bank' ? cleanText(bankName) : undefined,
        account_name: cleanText(accountName),
        account_number: accountNumber.replace(/\D/g, ''),
      });
      setAccountNumber('');
      setSaved(true);
      account.reload();
      history.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this account.');
    } finally {
      setBusy(false);
    }
  };

  const payouts = (history.data ?? []).filter((row) => row.direction === 'debit' && row.kind === 'withdrawal');
  const numberLabel = PAYOUT_METHODS.find((m) => m.key === method)!.numberLabel;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Payout account</Text>
      </View>
      <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          When a client releases a payment, it is sent to this account, less the platform fee. TaskBuddy does not keep
          a balance for you. Prototype: payouts are simulated and no real money moves.
        </Text>

        {account.loading && !account.data && <ContentSkeleton variant="list" />}
        {!!account.error && <LoadErrorCard title="Couldn't load your account" message={account.error} onRetry={account.reload} />}
        {account.data && (
          <View style={styles.card} testID="linked-account">
            <Text style={styles.cardLabel}>Payouts go to</Text>
            <Text style={styles.cardValue}>{accountLabel(account.data)}</Text>
            <Text style={styles.cardMeta}>{account.data.account_name}</Text>
          </View>
        )}
        {account.data === null && !account.loading && (
          <Text style={styles.warning} testID="no-account">
            No account linked yet. Payouts wait until you add one.
          </Text>
        )}

        <Text style={styles.label}>{account.data ? 'Change account' : 'Link an account'}</Text>
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
                onPress={() => setMethod(item.key)}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
              </Tap>
            );
          })}
        </View>
        {method === 'bank' && (
          <TextField label="Bank name" value={bankName} onChangeText={setBankName} maxLength={80} editable={!busy} keyboardAppearance={appearance} />
        )}
        <TextField label="Account holder name" value={accountName} onChangeText={setAccountName} maxLength={120} editable={!busy} keyboardAppearance={appearance} />
        <TextField
          label={numberLabel}
          value={accountNumber}
          onChangeText={(text) => setAccountNumber(text.replace(/\D/g, ''))}
          keyboardType="number-pad"
          maxLength={20}
          editable={!busy}
          keyboardAppearance={appearance}
        />
        {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}
        {saved && <Text accessibilityLiveRegion="polite" style={styles.savedText}>Account saved.</Text>}

        <Text style={[styles.label, styles.listTitle]} accessibilityRole="header">Payouts sent</Text>
        {history.data && payouts.length === 0 && <Text style={styles.intro}>No payouts yet.</Text>}
        {payouts.map((row) => (
          <View key={row.id} style={styles.payout}>
            <View style={styles.payoutText}>
              <Text style={styles.cardValue}>{peso(row.amount)}</Text>
              <Text style={styles.cardMeta}>
                {[row.withdrawal_destination, shortDate(row.created_at), row.review_note].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </View>
        ))}
      </KeyboardAwareScrollView>

      <BottomActionBar
        primaryLabel={busy ? 'Saving…' : 'Save account'}
        onPrimary={() => void save()}
        busy={busy}
        primaryDisabled={busy}
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
    errorText: { color: Colors.dangerText, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    savedText: { color: Colors.primary, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
