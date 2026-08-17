/**
 * HOWalletScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-payments screen — flat
 * white topbar, a small rounded gradient balance card (not a full-bleed dark
 * hero), an escrow card, a trust-note banner, and a transaction list.
 *
 * Deviation from the mockup, per explicit product decision: the mockup only
 * shows "+ Deposit Money" for homeowners. This screen keeps all three
 * existing actions — Add Money, Withdraw, Transfer — restyled onto the new
 * balance card instead of the old dark hero.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  CircleDollarSign,
  Gift,
  Package,
  Shield,
  WalletCards,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, MIN_TOPUP_PHP } from '../../../src/lib/api';
import { peso, shortDate } from '../../../src/lib/format';
import ScreenSkeleton from '../../../src/components/ScreenSkeleton';

/**
 * How long to wait for the top-up to appear after Stripe says it succeeded.
 *
 * The wallet is credited by a webhook to the backend, not by the browser
 * coming back, so at the moment the sheet closes the balance is usually — but
 * not always — already updated. Polling covers the gap.
 */
const CONFIRM_POLL_ATTEMPTS = 8;
const CONFIRM_POLL_INTERVAL_MS = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function HOWalletScreen() {
  const [activeTab, setActiveTab] = useState<'all' | 'credit' | 'debit'>('all');
  const { data, loading, error, reload } = useAsyncData(() => api.wallet(), [], 'ho-wallet');

  // Add Money: hiring holds the job budget in escrow, so a client needs a
  // funded wallet before they can accept an application.
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [amount, setAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const parsedAmount = Number(amount.replace(/,/g, ''));
  const isValidAmount =
    Number.isFinite(parsedAmount) && parsedAmount >= MIN_TOPUP_PHP;

  const closeAddMoney = () => {
    setShowAddMoney(false);
    setAmount('');
    setAddError(null);
  };

  /**
   * Re-reads the wallet until the new balance shows up.
   *
   * Returns true once it moves. A false here is a slow webhook, not a lost
   * payment — Stripe retries for days and the ledger row keys off the
   * PaymentIntent, so the money lands whether or not this poll sees it.
   */
  const awaitCredit = async (balanceBefore: number): Promise<boolean> => {
    for (let attempt = 0; attempt < CONFIRM_POLL_ATTEMPTS; attempt++) {
      await wait(CONFIRM_POLL_INTERVAL_MS);
      try {
        const wallet = await api.wallet();
        if (wallet.balance > balanceBefore) return true;
      } catch {
        // A failed poll is not a failed payment; keep trying.
      }
    }
    return false;
  };

  /**
   * Funds the wallet through Stripe's hosted Checkout page.
   *
   * Opened in a browser rather than a native payment sheet because the app
   * runs in Expo Go. `openAuthSessionAsync` closes the browser when the
   * backend's /payments/return bounces to our deep link — Stripe only accepts
   * http(s) redirect targets, so that hop happens server-side.
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

      const result = await WebBrowser.openAuthSessionAsync(
        session.url,
        appRedirect,
      );

      if (result.type !== 'success') {
        // Dismissing the browser is not proof the payment failed — the user
        // may have paid and swiped away — so reload rather than assert either.
        reload();
        setAdding(false);
        return;
      }

      const status = new URLSearchParams(
        result.url.split('?')[1] ?? '',
      ).get('topup');

      if (status !== 'success') {
        setAddError('Payment was cancelled.');
        setAdding(false);
        return;
      }

      setConfirming(true);
      const credited = await awaitCredit(balanceBefore);
      setConfirming(false);

      if (!credited) {
        setAddError(
          'Payment received. Your balance will update shortly — pull to refresh.',
        );
      } else {
        closeAddMoney();
      }
      reload();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add money.');
    } finally {
      setAdding(false);
      setConfirming(false);
    }
  };

  const transactions = data?.transactions ?? [];
  const filtered =
    activeTab === 'all'
      ? transactions
      : transactions.filter((t) => t.direction === activeTab);
  const vouchers = transactions.filter((t) => t.kind === 'recovery_credit');

  if (loading) return <ScreenSkeleton variant="dashboard" />;

  const content = (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a dark hero) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet</Text>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance card — mockup's linear-gradient(165deg, cyan600, cyan700) */}
        <LinearGradient
          colors={[C.cyan600, C.cyan700]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.balanceCard}
        >
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>
            {data ? peso(data.balance) : '—'}
          </Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.quickActionBtn}
              onPress={() => setShowAddMoney(true)}
              activeOpacity={0.8}
            >
              <ArrowUpRight size={22} color={C.white} />
              <Text style={styles.quickActionText}>Add Money</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.quickActionBtn} activeOpacity={0.8}>
              <ArrowDownLeft size={22} color={C.white} />
              <Text style={styles.quickActionText}>Withdraw</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.quickActionBtn} activeOpacity={0.8}>
              <ArrowRightLeft size={22} color={C.white} />
              <Text style={styles.quickActionText}>Transfer</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Escrow card */}
        <View style={styles.escrowCard}>
          <View style={styles.escrowTopRow}>
            <View style={styles.escrowCopy}>
              <Text style={styles.escrowLabel}>IN ESCROW</Text>
              <Text style={styles.escrowAmount}>{data ? peso(data.pending) : '—'}</Text>
              <Text style={styles.escrowNote}>Funds held securely until you approve completed work.</Text>
            </View>
            <Shield size={24} color={C.cyan700} />
          </View>
        </View>

        {/* Spent / Added summary */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#f59e0b' }]}>{peso(data?.total_debited ?? 0)}</Text>
            <Text style={styles.statLabel}>Spent</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#22c55e' }]}>{peso(data?.total_credited ?? 0)}</Text>
            <Text style={styles.statLabel}>Added</Text>
          </View>
        </View>

        {/* Recovery Vouchers — trust credits an admin issues after resolving a
            dispute in the client's favour. Always shown, even empty, so it's
            already there the moment the first one is issued. */}
        <View style={styles.voucherCard}>
          <View style={styles.voucherHeader}>
            <Gift size={17} color="#9333ea" />
            <Text style={styles.voucherHeaderText}>Recovery Vouchers</Text>
          </View>
          {vouchers.length === 0 ? (
            <Text style={styles.voucherEmptyText}>
              Trust credits from resolved disputes will appear here.
            </Text>
          ) : (
            <View style={styles.voucherList}>
              {vouchers.map((v) => (
                <View key={v.id} style={styles.voucherRow}>
                  <View style={styles.voucherInfo}>
                    <Text style={styles.voucherTitle} numberOfLines={1}>{v.title}</Text>
                    <Text style={styles.voucherDate}>{shortDate(v.created_at)}</Text>
                  </View>
                  <Text style={styles.voucherAmount}>+{peso(v.amount)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Trust note */}
        <View style={styles.trustNote}>
          <WalletCards size={18} color={C.cyan800} />
          <Text style={styles.trustNoteText}>
            Funds are held in escrow when you hire a provider, and released to
            them once you mark the job complete.
          </Text>
        </View>

        {/* Filter tabs */}
        <View style={styles.tabRow}>
          {(['all', 'credit', 'debit'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, activeTab === t && styles.tabActive]}
              onPress={() => setActiveTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                {t === 'all' ? 'All' : t === 'credit' ? 'Added' : 'Spent'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Transaction History</Text>

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
              txn.status.charAt(0).toUpperCase() + txn.status.slice(1);
            return (
              <View key={txn.id} style={[styles.txnRow, i < filtered.length - 1 && styles.txnRowBorder]}>
                <View style={styles.txnIcon}>
                  <Icon size={19} color={C.cyan700} />
                </View>
                <View style={styles.txnInfo}>
                  <Text style={styles.txnTitle} numberOfLines={1}>{txn.title}</Text>
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
        <View style={{ height: 20 }} />
      </ScrollView>

      <Modal
        visible={showAddMoney}
        transparent
        animationType="fade"
        onRequestClose={closeAddMoney}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Money</Text>
            <Text style={styles.modalBody}>
              You'll be taken to Stripe to pay by card. Funds are held in escrow
              when you hire a provider, and released to them when you mark the
              job complete.
            </Text>

            <View style={styles.amountRow}>
              <Text style={styles.amountCurrency}>₱</Text>
              <TextInput
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

            <Text style={styles.modalHint}>Minimum ₱{MIN_TOPUP_PHP}</Text>

            {confirming && (
              <Text style={styles.modalHint}>Confirming your payment…</Text>
            )}

            {addError && <Text style={styles.modalError}>{addError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={closeAddMoney}
                disabled={adding}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
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
                  <ActivityIndicator color={C.white} />
                ) : (
                  <Text style={styles.modalConfirmText}>Continue to Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  return content;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#edf1f4',
  },
  headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

  balanceCard: {
    borderRadius: 18, padding: 20, marginBottom: 14,
  },
  balanceLabel: { color: C.cyan100, fontSize: 13, fontFamily: 'Inter', marginBottom: 4 },
  balanceAmount: { color: C.white, fontSize: 32.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 16 },
  quickActions: { flexDirection: 'row', alignItems: 'center' },
  quickActionBtn: { flex: 1, alignItems: 'center', gap: 4 },
  quickActionText: { color: 'rgba(255,255,255,0.85)', fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter' },
  actionDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.2)' },

  escrowCard: {
    backgroundColor: '#f5fbfc', borderWidth: 1, borderColor: '#d5eef3',
    borderRadius: 15, padding: 14, marginBottom: 14,
  },
  escrowTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  escrowCopy: { flex: 1, marginRight: 12 },
  escrowLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: '800', color: C.cyan700 },
  escrowAmount: { fontSize: 24, fontWeight: '800', color: C.ink900, marginVertical: 3, fontFamily: 'Inter' },
  escrowNote: { fontSize: 12, color: C.ink500, lineHeight: 16, fontFamily: 'Inter' },

  statsRow: {
    flexDirection: 'row', backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 16, padding: 14, marginBottom: 14,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: C.line },
  statValue: { fontSize: 18.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 2 },
  statLabel: { color: C.ink400, fontSize: 13, fontFamily: 'Inter' },

  voucherCard: {
    backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#e9d5ff',
    borderRadius: 15, padding: 14, marginBottom: 14,
  },
  voucherHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  voucherHeaderText: { color: '#7e22ce', fontSize: 13.5, fontWeight: '800', fontFamily: 'Inter' },
  voucherEmptyText: { color: '#a855f7', fontSize: 12.5, fontFamily: 'Inter', lineHeight: 17 },
  voucherList: { gap: 8 },
  voucherRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voucherInfo: { flex: 1, marginRight: 10 },
  voucherTitle: { color: C.ink900, fontSize: 13.5, fontWeight: '600', fontFamily: 'Inter' },
  voucherDate: { color: C.ink400, fontSize: 11.5, fontFamily: 'Inter', marginTop: 1 },
  voucherAmount: { color: '#9333ea', fontSize: 14, fontWeight: '800', fontFamily: 'Inter' },

  trustNote: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#f5fbfc', borderWidth: 1, borderColor: '#d8f0f4',
    borderRadius: 13, padding: 12, marginBottom: 18,
  },
  trustNoteText: { flex: 1, color: C.cyan800, fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },

  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  tab: {
    paddingHorizontal: 18, paddingVertical: 7, borderRadius: 999,
    backgroundColor: C.ink50,
  },
  tabActive: { backgroundColor: C.ink900 },
  tabText: { color: C.ink500, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
  tabTextActive: { color: C.white },

  sectionTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12 },
  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
  emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
  emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

  txnList: {
    backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden',
  },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  txnRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f3f6' },
  txnIcon: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: '#f7f9fb', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  txnInfo: { flex: 1 },
  txnTitle: { color: C.ink900, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter', marginBottom: 2 },
  txnDate: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter' },
  txnAmount: { fontSize: 14.5, fontWeight: '800', fontFamily: 'Inter' },
  txnCredit: { color: '#16a34a' },
  txnDebit: { color: C.ink900 },

  // Add Money modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  modalCard: { width: '100%', backgroundColor: C.white, borderRadius: V6Radii.card, padding: 22 },
  modalTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter' },
  modalBody: { color: C.ink500, fontSize: 15.5, fontFamily: 'Inter', lineHeight: 19, marginTop: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 6 },
  amountCurrency: { color: C.ink900, fontSize: 34, fontWeight: '800', fontFamily: 'Inter', marginRight: 4 },
  amountInput: { fontSize: 48.5, fontWeight: '800', fontFamily: 'Inter', color: C.ink900, minWidth: 120, textAlign: 'center' },
  modalError: { color: '#ef4444', fontSize: 15.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 4 },
  modalHint: { color: C.ink400, fontSize: 14.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: V6Radii.btn, paddingVertical: 13 },
  modalBtnDisabled: { opacity: 0.5 },
  modalCancel: { backgroundColor: C.ink50 },
  modalCancelText: { color: C.ink500, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  modalConfirm: { backgroundColor: C.cyan700 },
  modalConfirmText: { color: C.white, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
});
