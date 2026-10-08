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
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { Spacing, V6Radii } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, MIN_TOPUP_PHP, type WalletTransaction } from '../../../src/lib/api';
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

export default function HOWalletScreen() {
  const { C, Colors, styles, appearance } = useThemedStyles(createThemedStyles);
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

  const parsedAmount = Number(amount.replace(/,/g, ''));
  const isValidAmount =
    Number.isFinite(parsedAmount) && parsedAmount >= MIN_TOPUP_PHP;

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

  const parsedWithdrawalAmount = Number(withdrawAmount.replace(/,/g, ''));
  const availableToWithdraw = data?.available ?? 0;
  const isValidWithdrawal =
    Number.isFinite(parsedWithdrawalAmount) &&
    parsedWithdrawalAmount > 0 &&
    parsedWithdrawalAmount <= availableToWithdraw &&
    withdrawDestination.trim().length > 0;

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
        amount: parsedWithdrawalAmount,
        destination: withdrawDestination.trim(),
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
        contentStyle={styles.modalCard}
        cardProps={{ testID: 'add-money-dialog' }}
      >
            <Text style={styles.modalTitle}>Add Money</Text>
            <Text style={styles.modalBody}>
              You'll be taken to Stripe to pay by card. Funds are held in escrow
              when you hire a provider, then released after the three-day warranty
              ends unless a complaint is open.
            </Text>

            <View style={styles.amountRow}>
              <Text style={styles.amountCurrency}>₱</Text>
              <TextInput keyboardAppearance={appearance}
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={C.ink400}
                editable={!adding}
                autoFocus
              />
            </View>

            <View style={styles.quickAmounts}>
              {QUICK_TOPUP_AMOUNTS.map((preset) => {
                const selected = parsedAmount === preset;
                return (
                  <Tap
                    key={preset}
                    testID={`wallet-quick-${preset}`}
                    style={[styles.quickAmount, selected && styles.quickAmountActive]}
                    onPress={() => {
                      setAmount(String(preset));
                      setAddError(null);
                    }}
                    disabled={adding}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.quickAmountText,
                        selected && styles.quickAmountTextActive,
                      ]}
                    >
                      ₱{preset.toLocaleString()}
                    </Text>
                  </Tap>
                );
              })}
            </View>

            <Text style={styles.modalHint}>Minimum ₱{MIN_TOPUP_PHP}</Text>

            {addError && <Text style={styles.modalError}>{addError}</Text>}

            <View style={styles.modalActions}>
              <Tap
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={closeAddMoney}
                disabled={adding}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Tap>
              <Tap
                testID="wallet-add-money-continue"
                style={[
                  styles.modalBtn,
                  styles.modalConfirm,
                  (!isValidAmount || adding) && styles.modalBtnDisabled,
                ]}
                onPress={addMoney}
                disabled={!isValidAmount || adding}
                activeOpacity={0.85}
              >
                {adding ? (
                  <ActivityIndicator color={C.onPrimary} />
                ) : (
                  <Text style={[styles.modalConfirmText, !isValidAmount && styles.modalConfirmTextDisabled]}>Continue</Text>
                )}
              </Tap>
            </View>
      </SheetFrame>

      <SheetFrame
        visible={showWithdraw}
        onClose={closeWithdraw}
        dismissible={false}
        contentStyle={styles.modalCard}
        cardProps={{ testID: 'withdraw-hw-dialog' }}
      >
            <Text style={styles.modalTitle}>Withdraw</Text>
            <Text style={styles.modalBody}>
              Send a request to withdraw your available wallet balance. Our team will process it manually.
            </Text>
            <Text style={styles.withdrawAvailable}>Available: {peso(availableToWithdraw)}</Text>

            <View style={styles.amountRow}>
              <Text style={styles.amountCurrency}>₱</Text>
              <TextInput keyboardAppearance={appearance}
                style={styles.amountInput}
                value={withdrawAmount}
                onChangeText={setWithdrawAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={C.ink400}
                editable={!withdrawing && canWithdrawBalance(availableToWithdraw)}
              />
            </View>
            {!canWithdrawBalance(availableToWithdraw) && (
              <Text style={styles.modalHint}>{getWithdrawalHint(availableToWithdraw)}</Text>
            )}
            <TextInput keyboardAppearance={appearance}
              style={styles.destinationInput}
              value={withdrawDestination}
              onChangeText={setWithdrawDestination}
              placeholder="GCash number or bank account details"
              placeholderTextColor={C.ink400}
              editable={!withdrawing && canWithdrawBalance(availableToWithdraw)}
            />

            {!!withdrawError && <Text style={styles.modalError}>{withdrawError}</Text>}

            <View style={styles.modalActions}>
              <Tap
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={closeWithdraw}
                disabled={withdrawing}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Tap>
              <Tap
                style={[
                  styles.modalBtn,
                  styles.modalConfirm,
                  (!isValidWithdrawal || withdrawing || !canWithdrawBalance(availableToWithdraw)) && styles.modalBtnDisabled,
                ]}
                onPress={() => void submitWithdrawal()}
                disabled={!isValidWithdrawal || withdrawing || !canWithdrawBalance(availableToWithdraw)}
                activeOpacity={0.85}
              >
                {withdrawing ? (
                  <ActivityIndicator color={C.onPrimary} />
                ) : (
                  <Text style={[styles.modalConfirmText, (!isValidWithdrawal || !canWithdrawBalance(availableToWithdraw)) && styles.modalConfirmTextDisabled]}>Withdraw</Text>
                )}
              </Tap>
            </View>
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

    // Add Money / Withdraw sheets (unchanged).
    modalCard: { width: '100%', backgroundColor: C.surface, borderRadius: V6Radii.card, padding: 22 },
    modalTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
    modalBody: { color: C.ink500, fontSize: 15.5, fontFamily: 'Inter', lineHeight: 19, marginTop: 6 },
    amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 6 },
    amountCurrency: { color: C.ink900, fontSize: 34, fontWeight: '800', fontFamily: 'Inter', marginRight: 4 },
    amountInput: { fontSize: 48.5, fontWeight: '800', fontFamily: 'Inter', color: C.ink900, minWidth: 120, textAlign: 'center' },
    modalError: { color: V6Colors.dangerText, fontSize: 15.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 4 },
    modalHint: { color: C.ink400, fontSize: 14.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 6 },
    quickAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
    quickAmount: {
      flexBasis: '48%', flexGrow: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.surface,
    },
    quickAmountActive: { borderColor: C.primaryTonalStrong, backgroundColor: C.primaryTonalStrong },
    quickAmountText: { color: C.ink800, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    quickAmountTextActive: { color: Colors.primaryDeep },
    withdrawAvailable: { color: V6Colors.link, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginTop: 12 },
    destinationInput: {
      backgroundColor: V6Colors.wellBg, borderRadius: 12, paddingHorizontal: 14, minHeight: 48,
      borderWidth: 1, borderColor: V6Colors.fieldBorder, fontFamily: 'Inter', fontSize: 15, color: C.ink900,
      marginTop: 12,
    },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    modalBtn: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingHorizontal: 16 },
    // Readable disabled state: grey fill with dark text instead of a faded button.
    modalBtnDisabled: { backgroundColor: C.ink100 },
    modalConfirmTextDisabled: { color: C.ink700 },
    modalCancel: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.fieldBorder },
    modalCancelText: { color: C.ink800, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
    modalConfirm: { backgroundColor: C.primary },
    modalConfirmText: { color: C.onPrimary, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
