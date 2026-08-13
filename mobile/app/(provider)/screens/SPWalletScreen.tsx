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
 * wallet, which keeps 3 actions per an explicit product decision. There's no
 * real withdraw/payout-method backend flow yet, so Withdraw is a visual
 * placeholder for now, same as the non-functional Transfer/Statement
 * buttons this screen already had.
 */

import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Banknote, Building2, Sparkles, WalletCards } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { peso, shortDate } from '../../../src/lib/format';

export default function SPWalletScreen() {
  const { providerProfile } = useAuth();
  const { data, loading, error } = useAsyncData(() => api.wallet(), [], 'sp-wallet');
  const transactions = data?.transactions ?? [];
  const jobsDone = providerProfile?.cached_completed_jobs ?? 0;

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Wallet</Text>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {/* wallet-hero: linear-gradient(145deg,#111827,#0c4a6e) */}
        <LinearGradient
          colors={['#111827', '#0c4a6e']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.heroCard}
        >
          <Text style={styles.balanceLabel}>Available to withdraw</Text>
          <Text style={styles.balanceAmount}>{data ? peso(data.balance) : '—'}</Text>
          <TouchableOpacity style={styles.withdrawBtn} activeOpacity={0.85}>
            <Banknote size={18} color={C.white} />
            <Text style={styles.withdrawBtnText}>Withdraw</Text>
          </TouchableOpacity>
        </LinearGradient>

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

        <View style={styles.trustNote}>
          <WalletCards size={18} color={C.cyan800} />
          <Text style={styles.trustNoteText}>
            Withdrawals happen here in Wallet. To add or remove payout accounts, use Profile → Payout Methods.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Payout History</Text>
        {loading && <ActivityIndicator style={{ marginTop: 10 }} color={C.cyan700} />}
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
              const statusLabel = txn.status.charAt(0).toUpperCase() + txn.status.slice(1);
              return (
                <View key={txn.id} style={[styles.txnRow, i < transactions.length - 1 && styles.txnRowBorder]}>
                  <View style={styles.txnIcon}><Icon size={19} color={C.cyan700} /></View>
                  <View style={styles.txnInfo}>
                    <Text style={styles.txnTitle} numberOfLines={1}>{txn.title}</Text>
                    <Text style={styles.txnDate}>{shortDate(txn.created_at)} · {statusLabel}</Text>
                  </View>
                  <Text style={[styles.txnAmount, txn.direction === 'credit' ? styles.txnCredit : styles.txnDebit]}>
                    {txn.direction === 'debit' ? '-' : '+'}{peso(txn.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  headerTitle: { color: C.ink900, fontSize: 21.5, fontWeight: '800', fontFamily: 'Inter', letterSpacing: -0.3 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

  heroCard: { borderRadius: 18, padding: 20, marginBottom: 16 },
  balanceLabel: { color: C.ink400, fontSize: 13, fontFamily: 'Inter', marginBottom: 4 },
  balanceAmount: { color: C.white, fontSize: 32.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 14 },
  withdrawBtn: {
    flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 8,
    backgroundColor: '#22c55e', borderRadius: V6Radii.btn, paddingHorizontal: 16, paddingVertical: 10,
  },
  withdrawBtnText: { color: C.white, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: V6Radii.card, padding: 14, alignItems: 'center', ...V6Shadows.sm,
  },
  statValue: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 2 },
  statLabel: { color: C.ink400, fontSize: 12, fontFamily: 'Inter' },

  trustNote: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#f5fbfc', borderWidth: 1, borderColor: '#d8f0f4',
    borderRadius: 13, padding: 12, marginBottom: 18,
  },
  trustNoteText: { flex: 1, color: C.cyan800, fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },

  sectionTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12 },
  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 20 },
  emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
  emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginTop: 10, marginBottom: 4 },
  emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', lineHeight: 17 },

  txnList: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  txnRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  txnRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f3f6' },
  txnIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#f7f9fb', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txnInfo: { flex: 1 },
  txnTitle: { color: C.ink900, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter', marginBottom: 2 },
  txnDate: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter' },
  txnAmount: { fontSize: 14.5, fontWeight: '800', fontFamily: 'Inter' },
  txnCredit: { color: '#16a34a' },
  txnDebit: { color: C.ink900 },
});
