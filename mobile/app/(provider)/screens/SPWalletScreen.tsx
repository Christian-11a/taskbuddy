/**
 * SPWalletScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-wallet screen — a flat
 * white .topbar, a small dark gradient "wallet-hero" balance card (not a
 * full-bleed header) with a single Withdraw action, a 2-stat row (Pending,
 * Jobs Done), a trust-note pointing to Profile for payout methods, and a
 * "Payout History" list.
 *
 * The mockup only shows one action (Withdraw) here — unlike the homeowner
 * wallet, which keeps 3 actions per an explicit product decision.
 *
 * Withdraw files a request against `POST /wallet/withdrawals` that an admin
 * settles by hand; there is still no automated payout rail, which is why the
 * modal's copy promises a review rather than a transfer.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import { Banknote, Building2, Sparkles, WalletCards } from 'lucide-react-native';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { peso, shortDate } from '../../../src/lib/format';
import WithdrawModal from '../../../src/components/WithdrawModal';
import { showToast } from '../../../src/components/Toast';

export default function SPWalletScreen() {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { providerProfile } = useAuth();
  const { data, loading, error, reload } = useAsyncData(() => api.wallet(), [], 'sp-wallet');
  const transactions = data?.transactions ?? [];
  const jobsDone = providerProfile?.cached_completed_jobs ?? 0;

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const pendingWithdrawals = transactions.filter(
    (t) => t.kind === 'withdrawal' && t.status === 'pending',
  );
  const canWithdraw = (data?.available ?? 0) > 0;

  const cancelWithdrawal = async (id: string) => {
    setCancelling(id);
    try {
      await api.cancelWithdrawal(id);
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not cancel the withdrawal.', 'error');
    } finally {
      setCancelling(null);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle}>Wallet</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {/* wallet-hero: linear-gradient(145deg,#111827,#0c4a6e) */}
        <View style={[styles.heroCard, { backgroundColor: C.providerHero }]}>
          <Text style={styles.balanceLabel}>Available to withdraw</Text>
          <Text style={styles.balanceAmount}>{data ? peso(data.available) : '—'}</Text>
          {!!data && data.pending_withdrawals > 0 && (
            <Text style={styles.balanceSubnote}>
              {peso(data.pending_withdrawals)} awaiting withdrawal · {peso(data.balance)} total
            </Text>
          )}
          <Tap
            style={[styles.withdrawBtn, !canWithdraw && styles.withdrawBtnDisabled]}
            // Kept tappable when empty so the tap explains itself.
            onPress={() => {
              if (!data) {
                showToast('Could not load your wallet. Please try again.', 'error');
                return;
              }
              if (canWithdraw) setShowWithdraw(true);
              else showToast('You have no funds available to withdraw.');
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Banknote size={18} color={canWithdraw ? '#13283c' : C.onPrimary} />
            <Text style={[styles.withdrawBtnText, !canWithdraw && styles.withdrawBtnTextDisabled]}>Withdraw</Text>
          </Tap>
        </View>

        {pendingWithdrawals.length > 0 && (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingHeader}>Withdrawal Requests</Text>
            {pendingWithdrawals.map((w) => (
              <View key={w.id} style={styles.pendingRow}>
                <View style={styles.pendingInfo}>
                  <Text style={styles.pendingAmount}>{peso(w.amount)}</Text>
                  <Text style={styles.pendingDate}>
                    Requested {shortDate(w.created_at)} · Pending
                  </Text>
                </View>
                <Tap
                  onPress={() => cancelWithdrawal(w.id)}
                  disabled={cancelling === w.id}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel withdrawal of ${peso(w.amount)}`}
                >
                  <Text style={styles.pendingCancel}>
                    {cancelling === w.id ? 'Cancelling…' : 'Cancel'}
                  </Text>
                </Tap>
              </View>
            ))}
          </View>
        )}

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{data ? peso(data.pending) : '—'}</Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{jobsDone}</Text>
            <Text style={styles.statLabel}>Jobs Done</Text>
          </View>
        </View>

        {/* Total earned / withdrawn — same total_credited/total_debited stats
            the homeowner wallet shows, relabelled for a provider's ledger. */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: V6Colors.successText }]}>{peso(data?.total_credited ?? 0)}</Text>
            <Text style={styles.statLabel}>Total Earned</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{peso(data?.total_debited ?? 0)}</Text>
            <Text style={styles.statLabel}>Total Withdrawn</Text>
          </View>
        </View>

        <View style={styles.trustNote}>
          <WalletCards size={18} color={V6Colors.link} />
          <Text style={styles.trustNoteText}>
            Card-paid earnings become eligible for Stripe transfer after the three-day warranty ends without an open complaint, once payouts are set up (Profile → Payouts). Everything else lands here — withdraw it with the button above.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Payout History</Text>
        {loading && <ContentSkeleton variant="list" />}
        {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}
        {!loading && !error && transactions.length === 0 && (
          <View style={styles.emptyState}>
            <WalletCards size={30} color={C.ink300} />
            <Text style={styles.emptyTitle}>No transactions yet</Text>
            <Text style={styles.emptyText}>Your payouts and job earnings will appear here.</Text>
          </View>
        )}

        {transactions.length > 0 && (
          <View style={styles.txnList}>
            {transactions.map((txn, i) => {
              const Icon = txn.direction === 'credit' ? Sparkles : Building2;
              const statusLabel =
                txn.kind === 'connect_transfer'
                  ? CONNECT_TRANSFER_STATUS[txn.status]
                  : txn.status.charAt(0).toUpperCase() + txn.status.slice(1);
              return (
                <View key={txn.id} style={[styles.txnRow, i < transactions.length - 1 && styles.txnRowBorder]}>
                  <View style={styles.txnIcon}><Icon size={19} color={V6Colors.link} /></View>
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnTitle} numberOfLines={2}>{txn.title}</Text>
                    <Text style={styles.txnDate}>{shortDate(txn.created_at)} · {statusLabel}</Text>
                    <Text style={styles.txnDate}>Transaction: {txn.id}</Text>
                    {!!txn.stripe_transfer_id && <Text style={styles.txnDate}>Stripe transfer: {txn.stripe_transfer_id}</Text>}
                    {!!txn.review_note && <Text style={styles.txnDate}>
                      {txn.status === 'completed' ? 'Settlement reference' : 'Review note'}: {txn.review_note}
                    </Text>}
                  </View>
                  <Text style={[styles.txnAmount, txn.direction === 'credit' ? styles.txnCredit : styles.txnDebit]}>
                    {txn.status === 'failed' ? '' : txn.direction === 'debit' ? '-' : '+'}{peso(txn.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>

      <WithdrawModal
        visible={showWithdraw}
        available={data?.available ?? 0}
        onClose={() => setShowWithdraw(false)}
        onFiled={reload}
      />
    </View>
  );
}

/**
 * A card-funded payout sent on to the provider's Stripe account (§29.5).
 * Failed means Stripe refused it and the money stayed in this wallet — the
 * row's minus sign no longer applies, and the label says so.
 */
const CONNECT_TRANSFER_STATUS: Record<'pending' | 'completed' | 'failed', string> = {
  pending: 'Sending to Stripe…',
  completed: 'Sent to Stripe',
  failed: 'Not sent — kept in wallet',
};

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    heroCard: { borderRadius: 18, padding: 20, marginBottom: 16 },
    balanceLabel: { color: C.onHeroMuted, fontSize: 14, fontFamily: 'Inter', marginBottom: 4 },
    balanceAmount: { color: C.onPrimary, fontSize: 32.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 14 },
    withdrawBtn: {
      flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 8,
      // White pill on the navy card, same as the homeowner wallet action.
      backgroundColor: '#ffffff', borderRadius: 999, paddingHorizontal: 18, minHeight: 44,
    },
    // Nothing to withdraw: a translucent outline pill with light text, so it
    // reads as unavailable without turning into low-contrast grey.
    withdrawBtnDisabled: {
      backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)',
    },
    withdrawBtnText: { color: '#13283c', fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    withdrawBtnTextDisabled: { color: C.onPrimary },
    balanceSubnote: {
      color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontFamily: 'Inter',
      marginTop: -10, marginBottom: 12,
    },

    pendingCard: {
      backgroundColor: V6Colors.warningSurface, borderWidth: 1, borderColor: V6Colors.warningBorder,
      borderRadius: 15, padding: 14, marginBottom: 16,
    },
    pendingHeader: {
      color: V6Colors.warningText, fontSize: 13.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 8,
    },
    pendingRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 4,
    },
    pendingInfo: { flex: 1, marginRight: 10 },
    pendingAmount: { color: C.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    pendingDate: { color: V6Colors.warningText, fontSize: 11.5, fontFamily: 'Inter', marginTop: 1 },
    pendingCancel: { color: V6Colors.warningText, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },

    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    statCard: {
      flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      borderRadius: V6Radii.card, padding: 14, alignItems: 'center', ...V6Shadows.sm,
    },
    statValue: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 2 },
    statLabel: { color: C.ink400, fontSize: 12, fontFamily: 'Inter' },

    trustNote: {
      flexDirection: 'row', gap: 9, alignItems: 'flex-start',
      backgroundColor: V6Colors.infoSurface, borderWidth: 1, borderColor: V6Colors.infoSurface,
      borderRadius: 13, padding: 12, marginBottom: 18,
    },
    trustNoteText: { flex: 1, color: V6Colors.link, fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },

    sectionTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12 },
    stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 20 },
    emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
    emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
    emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

    txnList: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
    txnRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    txnRowBorder: { borderBottomWidth: 1, borderBottomColor: V6Colors.wellBg },
    txnIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: V6Colors.canvas, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    txnInfo: { flex: 1, marginRight: 12 },
    txnTitle: { color: C.ink900, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter', marginBottom: 2 },
    txnDate: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter' },
    txnAmount: { flexShrink: 0, fontSize: 14.5, fontWeight: '800', fontFamily: 'Inter' },
    txnCredit: { color: V6Colors.successText },
    txnDebit: { color: C.ink900 },
  });
  return { Colors, V6Colors, C, styles };
}
