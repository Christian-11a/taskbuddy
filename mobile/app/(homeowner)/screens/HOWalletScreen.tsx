/**
 * HOWalletScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-payments screen — flat
 * white topbar, a small rounded gradient balance card (not a full-bleed dark
 * hero), an escrow card, and a transaction list.
 *
 * Trimmed after QA (Sep 2026) because it was too crowded: the balance card
 * has Add Money and Withdraw only (Transfer was never implemented), and the
 * spent/added stats, trust-note banner and duplicate "Request" link are gone.
 * Withdrawals and recovery vouchers only appear once there are some.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import SheetFrame from '../../../src/components/ui/SheetFrame';
import {
  ArrowUpRight,
  Plus,
  CircleDollarSign,
  Gift,
  Package,
  Shield,
  WalletCards,
} from 'lucide-react-native';
import * as AuthSession from 'expo-auth-session';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, MIN_TOPUP_PHP } from '../../../src/lib/api';
import { openRedirectSession } from '../../../src/lib/appRedirectSession';
import { peso, shortDate } from '../../../src/lib/format';
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

export default function HOWalletScreen() {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [activeTab, setActiveTab] = useState<'all' | 'credit' | 'debit'>('all');
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
  const filtered =
    activeTab === 'all'
      ? transactions
      : transactions.filter((t) => t.direction === activeTab);
  const vouchers = transactions.filter((t) => t.kind === 'recovery_credit');
  const withdrawals = withdrawalData ?? [];

  if (loading) return <ScreenSkeleton variant="dashboard" />;

  const content = (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a dark hero) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle}>Wallet</Text>
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
        {/* Balance card — mockup's linear-gradient(165deg, cyan600, cyan700) */}
        <View style={[styles.balanceCard, { backgroundColor: C.hero }]}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>
            {data ? peso(data.balance) : '—'}
          </Text>
          <View style={styles.quickActions}>
            <Tap
              style={[styles.quickActionBtn, styles.quickActionPrimary]}
              onPress={() => setShowAddMoney(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              scale
            >
              <Plus size={18} color="#0369a1" strokeWidth={2.5} />
              <Text style={[styles.quickActionText, styles.quickActionTextPrimary]}>Add Money</Text>
            </Tap>
            <Tap
              style={styles.quickActionBtn}
              onPress={openWithdraw}
              activeOpacity={0.8}
              accessibilityRole="button"
              rippleColor={C.rippleOnHero}
            >
              <ArrowUpRight size={18} color={C.onPrimary} strokeWidth={2.5} />
              <Text style={styles.quickActionText}>Withdraw</Text>
            </Tap>
          </View>
          {data && availableToWithdraw !== data.balance && (
            <Text style={styles.balanceSub}>{peso(availableToWithdraw)} available to withdraw</Text>
          )}
        </View>

        {/* Escrow card */}
        <View style={styles.escrowCard}>
          <View style={styles.escrowTopRow}>
            <View style={styles.escrowCopy}>
              <Text style={styles.escrowLabel}>IN ESCROW</Text>
              <Text style={styles.escrowAmount}>{data ? peso(data.in_escrow) : '—'}</Text>
              <Text style={styles.escrowNote}>Funds stay held through the three-day completion warranty and any open complaint.</Text>
            </View>
            <Shield size={24} color={V6Colors.link} />
          </View>
        </View>

        {withdrawals.length > 0 && (
          <View style={styles.withdrawalCard}>
            <Text style={styles.withdrawalLabel}>RECENT WITHDRAWALS</Text>
            <View style={styles.withdrawalList}>
              {withdrawals.slice(0, 3).map((withdrawal) => (
                <View key={withdrawal.id} style={styles.withdrawalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.withdrawalTitle}>{withdrawal.title}</Text>
                    <Text style={styles.withdrawalMeta}>
                      {shortDate(withdrawal.created_at)} · {withdrawal.status}
                    </Text>
                    {!!withdrawal.review_note && (
                      <Text style={styles.withdrawalMeta}>{withdrawal.review_note}</Text>
                    )}
                  </View>
                  <View style={styles.withdrawalAction}>
                    <Text style={styles.withdrawalValue}>{peso(withdrawal.amount)}</Text>
                    {withdrawal.status === 'pending' && (
                      <Tap onPress={() => void cancelWithdrawal(withdrawal.id)} activeOpacity={0.8}>
                        <Text style={styles.withdrawalCancel}>Cancel</Text>
                      </Tap>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Recovery Vouchers — trust credits an admin issues after resolving a
            dispute in the client's favour. Only shown once there is one. */}
        {vouchers.length > 0 && (
          <View style={styles.voucherCard}>
            <View style={styles.voucherHeader}>
              <Gift size={17} color={V6Colors.purpleText} />
              <Text style={styles.voucherHeaderText}>Recovery Vouchers</Text>
            </View>
            <View style={styles.voucherList}>
              {vouchers.map((v) => (
                <View key={v.id} style={styles.voucherRow}>
                  <View style={styles.voucherInfo}>
                    <Text style={styles.voucherTitle} numberOfLines={2}>{v.title}</Text>
                    <Text style={styles.voucherDate}>{shortDate(v.created_at)}</Text>
                  </View>
                  <Text style={styles.voucherAmount}>+{peso(v.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Transaction History</Text>
        {/* Filter tabs */}
        <View style={styles.tabRow}>
          {(['all', 'credit', 'debit'] as const).map((t) => (
            <Tap
              key={t}
              style={[styles.tab, activeTab === t && styles.tabActive]}
              onPress={() => setActiveTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                {t === 'all' ? 'All' : t === 'credit' ? 'Added' : 'Spent'}
              </Text>
            </Tap>
          ))}
        </View>

        {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}
        {!loading && !error && filtered.length === 0 && (
          <View style={styles.emptyState}>
            <WalletCards size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyText}>Your payments and wallet activity will appear here.</Text>
          </View>
        )}

        {filtered.length > 0 && (
        <View style={styles.txnList}>
          {filtered.map((txn, i) => {
            const Icon = txn.direction === 'credit' ? CircleDollarSign : Package;
            const statusLabel =
              txn.kind === 'escrow_hold' ? 'Escrow funded' : `Payment ${txn.status}`;
            return (
              <View key={txn.id} style={[styles.txnRow, i < filtered.length - 1 && styles.txnRowBorder]}>
                <View style={styles.txnIcon}>
                  <Icon size={19} color={V6Colors.link} />
                </View>
                <View style={styles.txnInfo}>
                  <Text style={styles.txnTitle} numberOfLines={2}>{txn.title}</Text>
                  <Text style={styles.txnDate}>{shortDate(txn.created_at)} · {statusLabel}</Text>
                </View>
                <Text style={[
                  styles.txnAmount,
                  txn.direction === 'credit' ? styles.txnCredit : styles.txnDebit,
                ]}>
                  {txn.direction === 'debit' ? '-' : '+'}{peso(txn.amount)}
                </Text>
              </View>
            );
          })}
        </View>
        )}
        {/* Room for the floating "Post a job" button above the nav bar. */}
        <View style={{ height: 96 }} />
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

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: V6Colors.line,
    },
    headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    balanceCard: {
      borderRadius: 18, padding: 20, marginBottom: 14,
    },
    balanceLabel: { color: C.onHeroMuted, fontSize: 14, fontFamily: 'Inter', marginBottom: 4 },
    balanceAmount: { color: C.onPrimary, fontSize: 32.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 16 },
    balanceSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter', marginTop: 12, textAlign: 'center' },
    quickActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    quickActionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      minHeight: 46, borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
    },
    quickActionPrimary: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
    quickActionText: { color: C.onPrimary, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    quickActionTextPrimary: { color: '#0369a1' },

    escrowCard: {
      backgroundColor: V6Colors.infoSurface, borderWidth: 1, borderColor: V6Colors.infoSurface,
      borderRadius: 15, padding: 14, marginBottom: 14,
    },
    escrowTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    escrowCopy: { flex: 1, marginRight: 12 },
    escrowLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '800', color: V6Colors.link },
    escrowAmount: { fontSize: 24, fontWeight: '800', color: C.ink900, marginVertical: 3, fontFamily: 'Inter' },
    escrowNote: { fontSize: 12, color: C.ink500, lineHeight: 16, fontFamily: 'Inter' },

    withdrawalCard: {
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: 15, padding: 14, marginBottom: 14,
    },
    withdrawalLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '800', color: V6Colors.link, fontFamily: 'Inter' },
    withdrawalList: { marginTop: 12, borderTopWidth: 1, borderTopColor: C.line },
    withdrawalRow: { flexDirection: 'row', gap: 10, paddingTop: 10, marginTop: 2 },
    withdrawalTitle: { color: C.ink900, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
    withdrawalMeta: { color: C.ink400, fontSize: 11.5, fontFamily: 'Inter', marginTop: 2 },
    withdrawalAction: { alignItems: 'flex-end' },
    withdrawalValue: { color: C.ink900, fontSize: 13.5, fontWeight: '800', fontFamily: 'Inter' },
    withdrawalCancel: { color: V6Colors.dangerText, fontSize: 12, fontWeight: '700', fontFamily: 'Inter', marginTop: 4 },

    voucherCard: {
      backgroundColor: V6Colors.purpleSurface, borderWidth: 1, borderColor: V6Colors.purpleBorder,
      borderRadius: 15, padding: 14, marginBottom: 14,
    },
    voucherHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
    voucherHeaderText: { color: V6Colors.purpleText, fontSize: 13.5, fontWeight: '800', fontFamily: 'Inter' },
    voucherList: { gap: 8 },
    voucherRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    voucherInfo: { flex: 1, marginRight: 10 },
    voucherTitle: { color: C.ink900, fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter' },
    voucherDate: { color: C.ink400, fontSize: 11.5, fontFamily: 'Inter', marginTop: 1 },
    voucherAmount: { color: V6Colors.purpleText, fontSize: 14, fontWeight: '800', fontFamily: 'Inter' },

    tabRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
    tab: {
      paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999,
      backgroundColor: C.ink50,
    },
    tabActive: { backgroundColor: V6Colors.hero },
    tabText: { color: C.ink500, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
    tabTextActive: { color: C.onPrimary },

    sectionTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12 },
    stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 20 },
    emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
    emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
    emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

    txnList: {
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden',
    },
    txnRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    txnRowBorder: { borderBottomWidth: 1, borderBottomColor: V6Colors.wellBg },
    txnIcon: {
      width: 34, height: 34, borderRadius: 12,
      backgroundColor: V6Colors.canvas, alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    txnInfo: { flex: 1 },
    txnTitle: { color: C.ink900, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter', marginBottom: 2 },
    txnDate: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter' },
    txnAmount: { fontSize: 14.5, fontWeight: '800', fontFamily: 'Inter' },
    txnCredit: { color: V6Colors.successText },
    txnDebit: { color: C.ink900 },

    // Add Money modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
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
    quickAmountTextActive: { color: theme.appearance === 'dark' ? '#e0f2fe' : '#0c4a6e' },
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
