/**
 * HOWalletScreen.tsx
 *
 * Figma Source: "HO - Payment Transactions" (id: 46:958)
 *
 * Design:
 * - Teal hero with wallet balance prominently displayed
 * - Add Money / Send Money quick action buttons
 * - Transaction history list
 * - Voucher section
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
  ArrowLeft,
  ArrowUpRight,
  ArrowRightLeft,
  CircleDollarSign,
  Package,
  WalletCards,
} from 'lucide-react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';
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

interface HOWalletScreenProps {
  onBack?: () => void;
}

export default function HOWalletScreen({ onBack }: HOWalletScreenProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'credit' | 'debit'>('all');
  const { data, loading, error, reload } = useAsyncData(() => api.wallet(), []);

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

  if (loading) return <ScreenSkeleton variant="dashboard" />;

  const content = (
    <View style={styles.screen}>
      {/* Hero Header */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          {onBack && (
            <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
              <ArrowLeft size={20} color={Colors.white} />
            </TouchableOpacity>
          )}
          <Text style={styles.heroTitle}>Wallet</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Balance card */}
        <View style={styles.balanceCard}>
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
              <ArrowUpRight size={22} color={Colors.white} />
              <Text style={styles.quickActionText}>Add Money</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.quickActionBtn} activeOpacity={0.8}>
              <ArrowDownLeft size={22} color={Colors.white} />
              <Text style={styles.quickActionText}>Withdraw</Text>
            </TouchableOpacity>
            <View style={styles.actionDivider} />
            <TouchableOpacity style={styles.quickActionBtn} activeOpacity={0.8}>
              <ArrowRightLeft size={22} color={Colors.white} />
              <Text style={styles.quickActionText}>Transfer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: 'Spent', value: peso(data?.total_debited ?? 0), color: '#F59E0B' },
            { label: 'Added', value: peso(data?.total_credited ?? 0), color: '#22C55E' },
            { label: 'Pending', value: peso(data?.pending ?? 0), color: '#94A3B8' },
          ].map((s) => (
            <View key={s.label} style={styles.statItem}>
              <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Transaction list */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
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
            <WalletCards size={40} color={Colors.brandTeal} />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.stateText}>Your payments and wallet activity will appear here.</Text>
          </View>
        )}

        {filtered.map((txn) => {
          const Icon = txn.direction === 'credit' ? CircleDollarSign : Package;
          const statusLabel =
            txn.status.charAt(0).toUpperCase() + txn.status.slice(1);
          return (
            <View key={txn.id} style={styles.txnCard}>
              <View style={styles.txnIcon}>
                <Icon size={22} color={Colors.brandDark} />
              </View>
              <View style={styles.txnInfo}>
                <Text style={styles.txnTitle}>{txn.title}</Text>
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
                placeholderTextColor={Colors.muted}
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
                  <ActivityIndicator color={Colors.white} />
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
  screen: { flex: 1, backgroundColor: Colors.background },

  hero: {
    backgroundColor: Colors.brandDark,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, marginBottom: 20,
  },
  heroTitle: { color: Colors.white, fontSize: 20, fontWeight: '700', fontFamily: 'Inter' },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: Colors.white, fontSize: 20, fontWeight: '600' },

  balanceCard: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20,
    padding: 20, marginBottom: 16,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter', marginBottom: 4 },
  balanceAmount: { color: Colors.white, fontSize: 36, fontWeight: '800', fontFamily: 'Inter', marginBottom: 16 },
  quickActions: { flexDirection: 'row', alignItems: 'center' },
  quickActionBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  quickActionIcon: { fontSize: 22, marginBottom: 4 },
  quickActionText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', fontFamily: 'Inter' },
  actionDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)' },

  statsRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16, padding: 14,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 2 },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },

  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  tab: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999,
    backgroundColor: 'rgba(144,153,184,0.15)',
  },
  tabActive: { backgroundColor: Colors.brandDark },
  tabText: { color: Colors.muted, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  tabTextActive: { color: Colors.white },

  sectionTitle: { color: Colors.brandDark, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 14 },
  stateText: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', marginTop: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
  emptyTitle: { color: Colors.brandDark, fontSize: 17, fontWeight: '800', fontFamily: 'Inter', marginTop: 12 },

  txnCard: {
    backgroundColor: Colors.white, borderRadius: Radii.card,
    padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center',
    ...Shadows.card,
  },
  txnIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: Colors.backgroundAlt, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  txnIconText: { fontSize: 22 },
  txnInfo: { flex: 1 },
  txnTitle: { color: Colors.brandDark, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
  txnDate: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  txnAmount: { fontSize: 15, fontWeight: '800', fontFamily: 'Inter' },
  txnCredit: { color: '#22C55E' },
  txnDebit: { color: Colors.brandDark },

  // Add Money modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  modalCard: { width: '100%', backgroundColor: Colors.white, borderRadius: Radii.card, padding: 22 },
  modalTitle: { color: Colors.brandDark, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  modalBody: { color: Colors.slate, fontSize: 13, fontFamily: 'Inter', lineHeight: 19, marginTop: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 6 },
  amountCurrency: { color: Colors.brandDark, fontSize: 28, fontWeight: '800', fontFamily: 'Inter', marginRight: 4 },
  amountInput: { fontSize: 40, fontWeight: '800', fontFamily: 'Inter', color: Colors.brandDark, minWidth: 120, textAlign: 'center' },
  modalError: { color: Colors.error, fontSize: 13, fontFamily: 'Inter', textAlign: 'center', marginTop: 4 },
  modalHint: { color: Colors.muted, fontSize: 12, fontFamily: 'Inter', textAlign: 'center', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 20, paddingVertical: 13 },
  modalBtnDisabled: { opacity: 0.5 },
  modalCancel: { backgroundColor: Colors.backgroundAlt },
  modalCancelText: { color: Colors.slate, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
  modalConfirm: { backgroundColor: Colors.brandTeal },
  modalConfirmText: { color: Colors.white, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
});
