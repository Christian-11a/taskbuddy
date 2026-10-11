/**
 * SPWalletScreen.tsx
 *
 * Figma "Wallet · provider" (79:2794): the title on the canvas, a navy balance
 * card with one Withdraw action, two tiles (On hold, Earned so far), a payouts
 * notice while Stripe payouts are not set up, and the payout history grouped by day.
 *
 * Withdraw files a request against `POST /wallet/withdrawals` that an admin
 * settles by hand; there is still no automated payout rail, which is why the
 * modal's copy promises a review rather than a transfer.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import Banner from '../../../src/components/ui/Banner';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import SectionHeader from '../../../src/components/ui/SectionHeader';
import StaleHint from '../../../src/components/ui/StaleHint';
import { ArrowDownLeft, Building2, Shield, Wallet, WalletCards, type LucideIcon } from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, type WalletTransaction } from '../../../src/lib/api';
import { peso, plural, shortDate } from '../../../src/lib/format';
import { groupWalletByDay } from '../../../src/lib/walletHistory';
import WithdrawModal from '../../../src/components/WithdrawModal';
import { showToast } from '../../../src/components/Toast';
import { SPScreen } from '../../../src/types/navigation';

interface SPWalletScreenProps {
  onNavigate: (screen: SPScreen, jobId?: string) => void;
}

export default function SPWalletScreen({ onNavigate }: SPWalletScreenProps) {
  const { Colors, styles } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { providerProfile } = useAuth();
  const { data, loading, error, reload, savedOnly, stale, refreshing } = useAsyncData(
    () => api.wallet(),
    [],
    'sp-wallet',
    { persist: true },
  );
  // The balance on screen is the saved copy and no fetch has confirmed it: Withdraw waits.
  const awaitingFreshBalance = !!data && savedOnly;
  // A failed refresh with a saved balance keeps the payouts on screen, so only a wallet with no data is a failure.
  const walletFailed = !!error && !data;
  // Whether card payments can reach the provider's bank yet. Only a status that has loaded and says
  // payouts are off shows the notice: while it loads, or if it fails, nothing shows, and the wallet
  // does not wait for it.
  const { data: payouts } = useAsyncData(() => api.connectStatus(), []);
  const payoutsOff = payouts !== null && !payouts.payouts_enabled;
  const transactions = data?.transactions ?? [];
  const jobsDone = providerProfile?.cached_completed_jobs ?? 0;

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  // Set before the first await, so a second tap in the same frame cannot send a second cancel.
  const cancelInFlight = useRef(false);

  const pendingWithdrawals = transactions.filter(
    (t) => t.kind === 'withdrawal' && t.status === 'pending',
  );
  const canWithdraw = (data?.available ?? 0) > 0;
  // Keyed on whether funds are available, so the button and its label are recreated when that
  // changes: Android keeps the old fill and label colour when the same view re-renders (see
  // FilterPill). Until the balance loads the label is white on the translucent button; after
  // that it is primary on white.
  const withdrawDrawn = canWithdraw ? 'on' : 'off';
  const groups = groupWalletByDay(transactions, new Date());

  const cancelWithdrawal = async (id: string) => {
    if (cancelInFlight.current) {
      showToast("We're already cancelling this withdrawal. Please wait.", 'info');
      return;
    }
    cancelInFlight.current = true;
    setCancelling(id);
    try {
      await api.cancelWithdrawal(id);
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not cancel the withdrawal.', 'error');
    } finally {
      cancelInFlight.current = false;
      setCancelling(null);
    }
  };

  /** One payout row: a tonal icon, the title, its status and any reference lines, and the signed amount. */
  const renderTransaction = (txn: WalletTransaction) => {
    const incoming = txn.direction === 'credit';
    const Icon: LucideIcon = incoming ? ArrowDownLeft : Building2;
    const statusLabel =
      txn.kind === 'connect_transfer'
        ? CONNECT_TRANSFER_STATUS[txn.status]
        : txn.status.charAt(0).toUpperCase() + txn.status.slice(1);
    const amountText = `${txn.status === 'failed' ? '' : incoming ? '+' : '-'}${peso(txn.amount)}`;
    return (
      <View
        key={txn.id}
        style={styles.txnRow}
        accessible
        accessibilityLabel={`${txn.title}. ${statusLabel}. ${amountText}`}
      >
        <View style={[styles.txnIcon, incoming ? styles.txnIconIn : styles.txnIconOut]}>
          <Icon size={18} color={incoming ? Colors.successText : Colors.link} strokeWidth={2.2} />
        </View>
        <View style={styles.txnCopy}>
          <Text style={styles.txnTitle} numberOfLines={2}>{txn.title}</Text>
          <Text style={styles.txnDetail} numberOfLines={1}>{statusLabel}</Text>
          <Text style={styles.txnRef} numberOfLines={1}>Transaction: {txn.id}</Text>
          {!!txn.stripe_transfer_id && <Text style={styles.txnRef} numberOfLines={1}>Stripe transfer: {txn.stripe_transfer_id}</Text>}
          {!!txn.review_note && <Text style={styles.txnRef} numberOfLines={2}>
            {txn.status === 'completed' ? 'Settlement reference' : 'Review note'}: {txn.review_note}
          </Text>}
        </View>
        <Text style={[styles.txnAmount, incoming ? styles.txnAmountIn : styles.txnAmountOut]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {amountText}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Text style={styles.headerTitle} accessibilityRole="header">Wallet</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <StaleHint
          stale={stale}
          refreshing={refreshing}
          error={error}
          onRetry={reload}
          updatingLabel="Updating balance…"
        />

        {/* Balance: the navy card, with the one Withdraw action. */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Available to withdraw</Text>
          <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {data ? peso(data.available) : '—'}
          </Text>
          {!!data && data.pending_withdrawals > 0 && (
            <Text style={styles.balanceSub}>
              {`${peso(data.pending_withdrawals)} awaiting withdrawal · ${peso(data.balance)} total`}
            </Text>
          )}
          <Tap
            key={`withdraw-${withdrawDrawn}`}
            style={[styles.withdrawButton, (!canWithdraw || awaitingFreshBalance) && styles.withdrawButtonDisabled]}
            // Kept tappable when empty so the tap explains itself. Off while the balance is the saved copy.
            disabled={awaitingFreshBalance}
            onPress={() => {
              if (awaitingFreshBalance) return;
              if (!data) {
                showToast('Could not load your wallet. Please try again.', 'error');
                return;
              }
              if (canWithdraw) setShowWithdraw(true);
              else showToast('You have no funds available to withdraw.');
            }}
            scale
            accessibilityRole="button"
            accessibilityLabel="Withdraw"
          >
            <Text key={`withdraw-label-${withdrawDrawn}`} style={[styles.withdrawText, (!canWithdraw || awaitingFreshBalance) && styles.withdrawTextDisabled]} numberOfLines={1}>Withdraw</Text>
          </Tap>
        </View>

        {pendingWithdrawals.length > 0 && (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingHeader}>Withdrawal Requests</Text>
            {pendingWithdrawals.map((w) => (
              <View key={w.id} style={styles.pendingRow}>
                <View style={styles.pendingInfo}>
                  <Text style={styles.pendingAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{peso(w.amount)}</Text>
                  <Text style={styles.pendingDate}>
                    Requested {shortDate(w.created_at)} · Pending
                  </Text>
                </View>
                <Tap
                  onPress={() => cancelWithdrawal(w.id)}
                  hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Cancel withdrawal of ${peso(w.amount)}`}
                  accessibilityState={{ busy: cancelling === w.id }}
                >
                  <Text style={styles.pendingCancel}>
                    {cancelling === w.id ? 'Cancelling…' : 'Cancel'}
                  </Text>
                </Tap>
              </View>
            ))}
          </View>
        )}

        {/* On hold: money held in escrow for this provider's jobs. Earned so far: the total credited so far. */}
        <View style={styles.tiles}>
          <WalletTile
            icon={Shield}
            label="On hold"
            amount={data ? peso(data.in_escrow) : '—'}
            note="Released after the 3-day warranty"
          />
          <WalletTile
            icon={Wallet}
            label="Earned so far"
            amount={data ? peso(data.total_credited) : '—'}
            note={`${plural(jobsDone, 'job')} done`}
          />
        </View>

        {payoutsOff && (
          <Banner
            tone="info"
            message="Card payments need Payouts set up."
            actionLabel="Set up"
            onAction={() => onNavigate('Payouts')}
          />
        )}

        <View style={styles.history}>
          <SectionHeader title="Payouts" />
          {loading && <ContentSkeleton variant="list" />}
          {!!error && !loading && !data && (
            <LoadErrorCard title="Couldn't load your wallet" message={error} onRetry={reload} />
          )}
          {!loading && !walletFailed && transactions.length === 0 && (
            <EmptyCard>
              <EmptyRow
                icon={WalletCards}
                title="No transactions yet"
                body="Your payouts and job earnings will appear here."
              />
            </EmptyCard>
          )}

          {groups.map((group) => (
            <View key={group.key} style={styles.group}>
              <Text style={styles.dayLabel} accessibilityRole="header">{group.label}</Text>
              <View style={styles.rows}>
                {group.transactions.map((txn) => renderTransaction(txn))}
              </View>
            </View>
          ))}
        </View>
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

/** One of the two tiles under the balance: a tonal icon, a label, the amount, and a note. */
function WalletTile({ icon: Icon, label, amount, note }: {
  icon: LucideIcon; label: string; amount: string; note: string;
}) {
  const { Colors, styles } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}. ${amount}. ${note}`}>
      <View style={styles.tileIcon}>
        <Icon size={17} color={Colors.link} strokeWidth={2.2} />
      </View>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{amount}</Text>
      <Text style={styles.tileNote}>{note}</Text>
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

    // Balance card: navy, white text, one white Withdraw pill.
    balanceCard: { backgroundColor: Colors.hero, borderRadius: 20, padding: 18 },
    balanceLabel: { color: Colors.onHeroMuted, fontSize: 14, fontWeight: '400', fontFamily: 'Inter', lineHeight: 18 },
    balanceAmount: {
      color: Colors.onPrimary, fontSize: 34, fontWeight: '800', fontFamily: 'Inter', lineHeight: 40, marginTop: 4,
    },
    balanceSub: { color: Colors.onHeroMuted, fontSize: 13, fontFamily: 'Inter', lineHeight: 18, marginTop: 8 },
    withdrawButton: {
      marginTop: 16, minHeight: 48, borderRadius: 999, paddingHorizontal: 16,
      alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.onPrimary,
    },
    // Nothing to withdraw: a translucent outline pill with light text, so it reads as unavailable.
    withdrawButtonDisabled: { backgroundColor: Colors.heroCard, borderWidth: 1, borderColor: Colors.heroCardBorder },
    withdrawText: { color: Colors.primary, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', lineHeight: 20 },
    withdrawTextDisabled: { color: Colors.onPrimary },

    // Withdrawal requests still waiting for an admin (cancellable).
    pendingCard: {
      backgroundColor: V6Colors.warningSurface, borderWidth: 1, borderColor: V6Colors.warningBorder,
      borderRadius: 15, padding: 14,
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

    // On hold and Earned so far: two equal tiles.
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

    // Payouts: the section header, then day groups of rows.
    history: { gap: 12 },
    group: { gap: 8 },
    dayLabel: {
      color: C.ink500, fontSize: 12, fontWeight: '700', fontFamily: 'Inter', letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    rows: { gap: 8 },

    txnRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16,
      backgroundColor: C.surface, elevation: 2,
    },
    txnIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    txnIconIn: { backgroundColor: C.successSurface },
    txnIconOut: { backgroundColor: Colors.primaryTonal },
    txnCopy: { flex: 1, minWidth: 0, gap: 2 },
    txnTitle: { color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },
    txnDetail: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18 },
    txnRef: { color: C.ink500, fontSize: 12, fontFamily: 'Inter', lineHeight: 16 },
    txnAmount: { flexShrink: 0, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    txnAmountIn: { color: Colors.successText },
    txnAmountOut: { color: C.ink900 },
  });
  return { Colors, V6Colors, C, styles };
}
