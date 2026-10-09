/**
 * HOWalletScreen.tsx
 *
 * Figma "Wallet · new" (74:1393): the title on the canvas, a balance card with
 * Add money and Withdraw, two tiles (Held safely, Rewards), and the history with
 * filter pills and day headings. Every transaction is a row with a signed amount.
 *
 * Trimmed after QA (Sep 2026): the balance card has Add money and Withdraw only
 * (Transfer was never implemented). Withdrawals show once there are some.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import SheetFrame from '../../../src/components/ui/SheetFrame';
import FilterPill from '../../../src/components/ui/FilterPill';
import SectionHeader from '../../../src/components/ui/SectionHeader';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import Banner from '../../../src/components/ui/Banner';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  Shield,
  WalletCards,
  type LucideIcon,
} from 'lucide-react-native';
import * as AuthSession from 'expo-auth-session';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, MAX_CARD_PHP, MIN_TOPUP_PHP, type WalletTransaction } from '../../../src/lib/api';
import { openRedirectSession } from '../../../src/lib/appRedirectSession';
import { peso, plural, shortDate } from '../../../src/lib/format';
import {
  WALLET_FILTERS,
  countWalletByFilter,
  filterWalletTransactions,
  groupWalletByDay,
  type WalletFilter,
} from '../../../src/lib/walletHistory';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';
import { canWithdrawBalance, getWithdrawalHint } from '../../../src/lib/walletRules';
import { showToast } from '../../../src/components/Toast';
import {
  MoneyAmountField,
  MoneyInfoBox,
  MoneySheetButton,
  MoneySheetError,
  MoneySheetLink,
  WithdrawSheetBody,
  readWithdrawal,
  type WithdrawStep,
} from '../../../src/components/WithdrawModal';

/**
 * How long to wait for the top-up to appear after Stripe says it succeeded.
 *
 * The wallet is credited by a webhook to the backend, not by the browser
 * coming back, so at the moment the sheet closes the balance is usually — but
 * not always — already updated. Polling covers the gap.
 */
/**
 * One tap instead of typing, covering what a homeowner actually tops up: a
 * single small job, a typical one, and a couple of jobs' worth. Typing still
 * works for anything else — these only fill the field.
 */
const QUICK_TOPUP_AMOUNTS = [500, 1000, 2500, 5000];

const CONFIRM_POLL_ATTEMPTS = 12;
const CONFIRM_POLL_INTERVAL_MS = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What an empty filter says. The whole history being empty gets the first line. */
const EMPTY_COPY: Record<WalletFilter, { title: string; body?: string }> = {
  all: { title: 'No transactions yet', body: 'Your payments and wallet activity will appear here.' },
  in: { title: 'No money in yet' },
  out: { title: 'No money out yet' },
  held: { title: 'Nothing held right now' },
};

/** Minus sign (U+2212), as in the Figma amounts. */
const MINUS = '−';

/** Whole pesos for the quick amounts and the button (₱1,000). Centavos stay when there are some. */
function wholePeso(amount: number): string {
  return Number.isInteger(amount) ? `₱${amount.toLocaleString('en-PH')}` : peso(amount);
}

/** Why an amount can't be added, or undefined while the field is empty or the amount is valid. */
function topUpError(text: string, amount: number): string | undefined {
  if (text.trim() === '') return undefined;
  if (!Number.isFinite(amount)) return 'Enter a valid amount.';
  if (amount < MIN_TOPUP_PHP) return `The minimum is ₱${MIN_TOPUP_PHP}`;
  if (amount > MAX_CARD_PHP) return `The most you can add is ₱${MAX_CARD_PHP.toLocaleString('en-PH')}`;
  return undefined;
}

export default function HOWalletScreen() {
  const { C, Colors, styles } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [filter, setFilter] = useState<WalletFilter>('all');
  const { data, loading, error, reload } = useAsyncData(() => api.wallet(), [], 'ho-wallet');
  const {
    data: withdrawalData,
    reload: reloadWithdrawals,
  } = useAsyncData(() => api.withdrawals(), [], 'ho-withdrawals');

  // Add Money: hiring holds the job budget in escrow, so a client needs a
  // funded wallet before they can accept an application.
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [amount, setAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawDestination, setWithdrawDestination] = useState('');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawStep, setWithdrawStep] = useState<WithdrawStep>('form');

  const parsedAmount = Number(amount.replace(/,/g, ''));
  const isValidAmount =
    Number.isFinite(parsedAmount) && parsedAmount >= MIN_TOPUP_PHP && parsedAmount <= MAX_CARD_PHP;

  const closeAddMoney = () => {
    setShowAddMoney(false);
    setAmount('');
    setAddError(null);
  };

  const onRefresh = () => {
    setRefreshing(true);
    reload();
    reloadWithdrawals();
  };

  // useAsyncData's reload() is fire-and-forget; a new `data` (or `error`)
  // object means that fetch settled, so the spinner can stop.
  useEffect(() => {
    setRefreshing(false);
  }, [data, error]);

  const availableToWithdraw = data?.available ?? 0;
  const withdrawal = readWithdrawal(withdrawAmount, withdrawDestination, availableToWithdraw);
  const isValidWithdrawal =
    withdrawal.amountValid && withdrawal.destinationValid && canWithdrawBalance(availableToWithdraw);

  // No point opening a form that can't be submitted: say why instead.
  const openWithdraw = () => {
    // A never-loaded wallet reads as a 0 balance — don't tell the user they
    // have no funds when the truth is the app couldn't check (#19). This
    // checks `data` alone, not `error`: useAsyncData keeps the last-good
    // `data` from cache even when a later background revalidation fails, and
    // the balance card above already trusts that stale-but-valid data (it
    // renders unconditionally on `data`'s presence) — so a lone `error` here
    // would wrongly block withdrawal while a correct balance sits on screen.
    if (!data) {
      showToast("Couldn't load your wallet. Pull to refresh and try again.");
      return;
    }
    if (!canWithdrawBalance(availableToWithdraw)) {
      showToast(availableToWithdraw > 0 ? getWithdrawalHint(availableToWithdraw) : 'You have no funds available to withdraw.');
      return;
    }
    setShowWithdraw(true);
  };

  const closeWithdraw = () => {
    setShowWithdraw(false);
    setWithdrawStep('form');
    setWithdrawAmount('');
    setWithdrawDestination('');
    setWithdrawError(null);
  };

  const submitWithdrawal = async () => {
    if (!isValidWithdrawal) return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      await api.requestWithdrawal({
        amount: withdrawal.amount,
        destination: withdrawal.destination,
      });
      closeWithdraw();
      reload();
      reloadWithdrawals();
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : 'Could not request a withdrawal.');
    } finally {
      setWithdrawing(false);
    }
  };

  const cancelWithdrawal = async (id: string) => {
    try {
      await api.cancelWithdrawal(id);
      reload();
      reloadWithdrawals();
    } catch (e) {
      setWithdrawError(e instanceof Error ? e.message : 'Could not cancel the withdrawal.');
      setShowWithdraw(true);
    }
  };

  /**
   * Re-reads the wallet until the new balance shows up.
   *
   * A slow webhook is not a lost payment — Stripe retries for days and the
   * ledger row keys off the PaymentIntent.
   */
  const awaitCredit = async (balanceBefore: number): Promise<void> => {
    for (let attempt = 0; attempt < CONFIRM_POLL_ATTEMPTS; attempt++) {
      await wait(CONFIRM_POLL_INTERVAL_MS);
      try {
        const wallet = await api.wallet();
        if (wallet.balance > balanceBefore) return;
      } catch {
        // A failed poll is not a failed payment; keep trying.
      }
    }
  };

  /**
   * Funds the wallet through Stripe's hosted Checkout page.
   *
   * Opened in a browser rather than a native payment sheet: Stripe only
   * accepts http(s) redirect targets, so the hop back to our deep link happens
   * on the backend's /payments/return. `openRedirectSession` is what closes
   * the browser on the way back — see its comment for why a plain
   * `openAuthSessionAsync` hangs on Android.
   */
  const addMoney = async () => {
    if (!isValidAmount) return;
    setAdding(true);
    setAddError(null);

    const balanceBefore = data?.balance ?? 0;

    try {
      // exp://[ip]:8081 in Expo Go, taskbuddy:// in a build — the backend
      // allowlists both.
      const appRedirect = AuthSession.makeRedirectUri({ scheme: 'taskbuddy' });
      const session = await api.createCheckoutSession({
        amount: parsedAmount,
        app_redirect: appRedirect,
      });

      const result = await openRedirectSession(session.url, appRedirect);

      if (result.type !== 'success') {
        // The browser flow has ended, including when Android reports a
        // dismiss after a completed Checkout. The webhook still credits the
        // wallet; leaving the form open invites a second charge.
        closeAddMoney();
        reload();
        void awaitCredit(balanceBefore).then(() => reload());
        return;
      }

      const status = new URLSearchParams(
        result.url.split('?')[1] ?? '',
      ).get('topup');

      if (status !== 'success') {
        closeAddMoney();
        showToast('Payment was cancelled.');
        return;
      }

      // Checkout is complete. The webhook may still be crediting the wallet,
      // so close the form now and keep refreshing the balance in the background.
      closeAddMoney();
      showToast('Payment received. Your wallet is updating.');
      reload();
      void awaitCredit(balanceBefore).then(() => reload());
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add money.');
    } finally {
      setAdding(false);
    }
  };

  const transactions = data?.transactions ?? [];
  const filtered = filterWalletTransactions(transactions, filter);
  const counts = countWalletByFilter(transactions);
  const groups = groupWalletByDay(filtered, new Date());
  const vouchers = transactions.filter((t) => t.kind === 'recovery_credit');
  const rewardsTotal = vouchers.reduce((total, voucher) => total + Number(voucher.amount), 0);
  const withdrawals = withdrawalData ?? [];

  if (loading) return <ScreenSkeleton variant="dashboard" />;

  /** One history row: a tonal icon, the title and its status, and the signed amount. */
  const renderTransaction = (txn: WalletTransaction) => {
    const incoming = txn.direction === 'credit';
    const Icon: LucideIcon =
      txn.kind === 'escrow_hold' ? Shield
        : txn.kind === 'recovery_credit' ? Gift
          : incoming ? ArrowDownLeft
            : ArrowUpRight;
    const detail = txn.kind === 'escrow_hold' ? 'Escrow funded' : `Payment ${txn.status}`;
    const amountText = `${incoming ? '+' : MINUS}${peso(txn.amount)}`;
    return (
      <View
        key={txn.id}
        testID={`wallet-txn-${txn.id}`}
        style={styles.txnRow}
        accessible
        accessibilityLabel={`${txn.title}. ${detail}. ${amountText}`}
      >
        <View style={styles.txnIcon}>
          <Icon size={18} color={Colors.link} strokeWidth={2.2} />
        </View>
        <View style={styles.txnCopy}>
          <Text style={styles.txnTitle} numberOfLines={2}>{txn.title}</Text>
          <Text style={styles.txnDetail} numberOfLines={1}>{detail}</Text>
        </View>
        <Text
          style={[styles.txnAmount, incoming ? styles.txnAmountIn : styles.txnAmountOut]}
          numberOfLines={1}
        >
          {amountText}
        </Text>
      </View>
    );
  };

  const content = (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle} accessibilityRole="header">Wallet</Text>
      </View>

      <ScrollView
        testID="wallet-scroll"
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.cyan700}
            colors={[C.cyan700]}
          />
        }
      >
        {/* Balance card: the hero blue, with Add money (white) and Withdraw (translucent). */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available balance</Text>
          <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {data ? peso(data.balance) : '—'}
          </Text>
          <View style={styles.balanceActions}>
            <Tap
              style={[styles.balanceButton, styles.balanceButtonPrimary]}
              onPress={() => setShowAddMoney(true)}
              scale
              accessibilityRole="button"
              accessibilityLabel="Add money"
            >
              <Text style={[styles.balanceButtonText, styles.balanceButtonTextPrimary]} numberOfLines={1}>
                Add money
              </Text>
            </Tap>
            <Tap
              style={styles.balanceButton}
              onPress={openWithdraw}
              scale
              rippleColor={Colors.rippleOnHero}
              accessibilityRole="button"
              accessibilityLabel="Withdraw"
            >
              <Text style={styles.balanceButtonText} numberOfLines={1}>Withdraw</Text>
            </Tap>
          </View>
          {data && availableToWithdraw !== data.balance && (
            <Text style={styles.balanceSub}>{peso(availableToWithdraw)} available to withdraw</Text>
          )}
        </View>

        {/* Held safely: money in escrow. Rewards: the recovery vouchers the wallet holds. */}
        <View style={styles.tiles}>
          <WalletTile
            icon={Shield}
            label="Held safely"
            amount={data ? peso(data.in_escrow) : '—'}
            note="Released when each job is done"
          />
          <WalletTile
            icon={Gift}
            label="Rewards"
            amount={data ? peso(rewardsTotal) : '—'}
            note={data ? plural(vouchers.length, 'voucher') : undefined}
          />
        </View>

        {withdrawals.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel} accessibilityRole="header">Recent withdrawals</Text>
            {withdrawals.slice(0, 3).map((withdrawal) => (
              <View key={withdrawal.id} style={styles.withdrawalRow}>
                <View style={styles.withdrawalCopy}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{withdrawal.title}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {shortDate(withdrawal.created_at)} · {withdrawal.status}
                  </Text>
                  {!!withdrawal.review_note && (
                    <Text style={styles.rowMeta}>{withdrawal.review_note}</Text>
                  )}
                </View>
                <View style={styles.withdrawalAmountCol}>
                  <Text style={styles.rowAmount}>{peso(withdrawal.amount)}</Text>
                  {withdrawal.status === 'pending' && (
                    <Tap
                      onPress={() => void cancelWithdrawal(withdrawal.id)}
                      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel withdrawal, ${withdrawal.title}`}
                    >
                      <Text style={styles.cancelText}>Cancel</Text>
                    </Tap>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.history}>
          <SectionHeader title="History" />
          <ScrollView
            horizontal
            testID="wallet-filters"
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
            contentContainerStyle={styles.filterRow}
          >
            {WALLET_FILTERS.map(({ key, label }) => (
              <FilterPill
                key={key}
                label={label}
                count={data ? counts[key] : undefined}
                selected={filter === key}
                onPress={() => setFilter(key)}
              />
            ))}
          </ScrollView>

          {!!error && <Banner tone="error" message={error} />}

          {!error && filtered.length === 0 && (
            <EmptyRow
              icon={WalletCards}
              title={EMPTY_COPY[filter].title}
              body={EMPTY_COPY[filter].body}
            />
          )}

          {groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.sectionLabel} accessibilityRole="header">{group.label}</Text>
              <View style={styles.rows}>
                {group.transactions.map((txn) => renderTransaction(txn))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <SheetFrame
        visible={showAddMoney}
        onClose={closeAddMoney}
        dismissible={false}
        cardProps={{ testID: 'add-money-dialog' }}
      >
        <View style={styles.sheetBody}>
          <Text style={styles.sheetTitle} accessibilityRole="header">Add money</Text>

          <MoneyAmountField
            accessibilityLabel="Amount to add"
            value={amount}
            onChangeText={setAmount}
            error={topUpError(amount, parsedAmount)}
            helper={`Minimum ₱${MIN_TOPUP_PHP}. It goes to your TaskBuddy wallet and is used when you hire.`}
            editable={!adding}
            autoFocus
          />

          {/* Locked while Checkout is opening, so a tap cannot change the amount mid-request. */}
          <View style={styles.quickAmounts} pointerEvents={adding ? 'none' : 'auto'}>
            {QUICK_TOPUP_AMOUNTS.map((preset) => (
              <FilterPill
                key={preset}
                label={wholePeso(preset)}
                selected={parsedAmount === preset}
                onPress={() => {
                  setAmount(String(preset));
                  setAddError(null);
                }}
              />
            ))}
          </View>

          <MoneyInfoBox
            rows={[{ icon: Shield, text: "You'll pay on Stripe's secure page, then come right back here." }]}
          />

          {addError ? <MoneySheetError message={addError} /> : null}

          <MoneySheetButton
            testID="wallet-add-money-continue"
            label={isValidAmount ? `Continue to payment · ${wholePeso(parsedAmount)}` : 'Continue to payment'}
            onPress={addMoney}
            disabled={!isValidAmount || adding}
            busy={adding}
          />
          <MoneySheetLink label="Cancel" onPress={closeAddMoney} disabled={adding} />
        </View>
      </SheetFrame>

      <SheetFrame
        visible={showWithdraw}
        onClose={closeWithdraw}
        dismissible={false}
        cardProps={{ testID: 'withdraw-hw-dialog' }}
      >
        <WithdrawSheetBody
          step={withdrawStep}
          available={availableToWithdraw}
          amount={withdrawAmount}
          onAmountChange={setWithdrawAmount}
          destination={withdrawDestination}
          onDestinationChange={setWithdrawDestination}
          blockedHint={canWithdrawBalance(availableToWithdraw) ? undefined : getWithdrawalHint(availableToWithdraw)}
          busy={withdrawing}
          error={withdrawError}
          onContinue={() => setWithdrawStep('confirm')}
          onRequest={() => void submitWithdrawal()}
          onBack={() => setWithdrawStep('form')}
          onCancel={closeWithdraw}
        />
      </SheetFrame>
    </View>
  );

  return content;
}

/** One of the two tiles under the balance: a tonal icon, a label, the amount, and an optional note. */
function WalletTile({ icon: Icon, label, amount, note }: {
  icon: LucideIcon; label: string; amount: string; note?: string;
}) {
  const { Colors, styles } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.tile} accessible accessibilityLabel={[label, amount, note].filter(Boolean).join('. ')}>
      <View style={styles.tileIcon}>
        <Icon size={17} color={Colors.link} strokeWidth={2.2} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {amount}
      </Text>
      {!!note && <Text style={styles.tileNote}>{note}</Text>}
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: { paddingHorizontal: Spacing.screenH, paddingBottom: 12 },
    headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 4, paddingBottom: 20, gap: 18 },

    // Balance card: hero blue, white text, two pill buttons.
    balanceCard: { backgroundColor: Colors.hero, borderRadius: 20, padding: 18 },
    balanceLabel: { color: Colors.onHeroMuted, fontSize: 14, fontWeight: '400', fontFamily: 'Inter', lineHeight: 18 },
    balanceAmount: {
      color: Colors.onPrimary, fontSize: 34, fontWeight: '800', fontFamily: 'Inter', lineHeight: 40, marginTop: 4,
    },
    balanceActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    balanceButton: {
      flex: 1, minWidth: 0, minHeight: 48, borderRadius: 999, paddingHorizontal: 12,
      alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.heroCard,
    },
    balanceButtonPrimary: { backgroundColor: Colors.onPrimary },
    balanceButtonText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },
    balanceButtonTextPrimary: { color: Colors.primary },
    balanceSub: { color: Colors.onHeroMuted, fontSize: 13, fontFamily: 'Inter', lineHeight: 18, marginTop: 12 },

    // Held safely and Rewards: two equal tiles.
    tiles: { flexDirection: 'row', gap: 10 },
    tile: {
      flex: 1, minWidth: 0, gap: 4, padding: 14, borderRadius: 16,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
    },
    tileIcon: {
      width: 34, height: 34, borderRadius: 11, marginBottom: 6,
      backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center',
    },
    tileLabel: { color: C.ink700, fontSize: 13, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },
    tileAmount: { color: C.ink900, fontSize: 18, fontWeight: '700', fontFamily: 'Inter', lineHeight: 24 },
    tileNote: { color: C.ink500, fontSize: 12, fontFamily: 'Inter', lineHeight: 16 },

    // Recent withdrawals (only once there are some).
    card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 14 },
    sectionLabel: {
      color: C.ink500, fontSize: 12, fontWeight: '700', fontFamily: 'Inter', letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 8,
    },
    withdrawalRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line,
    },
    withdrawalCopy: { flex: 1, minWidth: 0, gap: 2 },
    withdrawalAmountCol: { alignItems: 'flex-end', flexShrink: 0, gap: 4 },
    rowTitle: { color: C.ink900, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', lineHeight: 19 },
    rowMeta: { color: C.ink500, fontSize: 12, fontFamily: 'Inter', lineHeight: 16 },
    rowAmount: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
    cancelText: { color: Colors.dangerText, fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },

    // History: the section header, the pills (scroll past the edge), then day groups.
    history: { gap: 12 },
    filterScroll: { flexGrow: 0, marginHorizontal: -Spacing.screenH },
    filterRow: { gap: 8, paddingHorizontal: Spacing.screenH },
    group: { gap: 8 },
    rows: { gap: 8 },

    txnRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16,
      backgroundColor: C.surface, elevation: 2,
    },
    txnIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center',
    },
    txnCopy: { flex: 1, minWidth: 0, gap: 3 },
    txnTitle: { color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },
    txnDetail: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18 },
    txnAmount: { flexShrink: 0, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    txnAmountIn: { color: Colors.successText },
    txnAmountOut: { color: C.ink900 },

    // Add money sheet (the withdraw sheet draws its own styles in WithdrawModal).
    sheetBody: { gap: 12 },
    sheetTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
    // Four quick amounts in one row; they wrap onto two rows when the text is large.
    quickAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
