/**
 * HOPaymentsScreen.tsx (HO - Payments)
 *
 * A client's payment history, read-only. One row per hired job: the job, the amount, the date and
 * where the money is, from the client's side: paid (-), on hold (-), refunded (+).
 * No payment method is shown because none is stored.
 *
 * Data limits: the jobs list carries no payment info, so each hired job from the last 90 days
 * (newest 30 at most) is read once for its escrow status, and a cancelled one is also checked for
 * its dispute resolution. The "Held on active jobs" total uses every job in the list.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Wallet } from 'lucide-react-native';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import FilterPill from '../../../src/components/ui/FilterPill';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import { api, type Dispute, type Job } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { peso, shortDate } from '../../../src/lib/format';
import {
  PAYMENT_FILTERS, filterRows, groupByMonth, heldOnActiveJobs, jobDate, paidThisMonth, paymentState,
  recentPaidJobs, refundedThisMonth, rowView,
  type PaymentFilter, type PaymentRow,
} from '../../../src/lib/paymentRows';

type EscrowInfo = { status?: string } | null | undefined;

async function loadPayments(now: Date): Promise<{ rows: PaymentRow[]; held: number }> {
  const jobs = await api.myJobs();
  const rows = await Promise.all(
    recentPaidJobs(jobs, now).map(async (job): Promise<PaymentRow> => {
      let escrow: EscrowInfo = null;
      try {
        escrow = ((await api.getJob(job.id)) as { escrow?: EscrowInfo }).escrow;
      } catch {
        escrow = null;
      }
      let resolution: Dispute['resolution'] | undefined;
      if (job.status === 'cancelled' && escrow?.status !== 'refunded') {
        try {
          resolution = (await api.jobDispute(job.id))?.resolution;
        } catch {
          resolution = undefined;
        }
      }
      return {
        jobId: job.id,
        title: job.title,
        amount: Number(job.budget),
        date: jobDate(job),
        state: paymentState(job, escrow, resolution),
        providerName: job.assigned_provider?.full_name ?? null,
      };
    }),
  );
  return { rows, held: heldOnActiveJobs(jobs, now) };
}

export default function HOPaymentsScreen({ onBack, onOpenJob }: { onBack: () => void; onOpenJob: (jobId: string) => void }) {
  const { styles, V6Colors, Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [refreshing, setRefreshing] = useState(false);
  // reload() is fire-and-forget, so the spinner is stopped when the fetch itself settles, on success or failure.
  const data = useAsyncData(() => loadPayments(new Date()).finally(() => setRefreshing(false)), []);
  const onRefresh = () => {
    setRefreshing(true);
    data.reload();
  };
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const now = new Date();
  const rows = data.data?.rows ?? [];
  const groups = groupByMonth(filterRows(rows, filter));
  const toneColor = { ink: V6Colors.ink900, green: Colors.successText, grey: V6Colors.ink500 };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Payments</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={V6Colors.link} colors={[V6Colors.link]} />
        }
      >
        {data.loading && !data.data && <ContentSkeleton variant="list" />}
        {!!data.error && !data.data && (
          <LoadErrorCard title="Couldn't load your payments" message={data.error} onRetry={data.reload} />
        )}
        {data.data && (
          <>
            <View style={styles.summary}>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Paid this month</Text>
                <Text style={styles.cardValue} testID="paid-this-month">{peso(paidThisMonth(rows, now))}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>On hold</Text>
                <Text style={styles.cardValue} testID="held-total">{peso(data.data.held)}</Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Refunded this month</Text>
                <Text style={[styles.cardValue, { color: Colors.successText }]} testID="refunded-this-month">
                  {peso(refundedThisMonth(rows, now))}
                </Text>
              </View>
            </View>
            <Text style={styles.cardMeta}>− money you paid · + money back to you</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="payment-filters"
              style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
              {PAYMENT_FILTERS.map(({ key, label }) => (
                <FilterPill key={key} label={label} selected={filter === key} onPress={() => setFilter(key)} />
              ))}
            </ScrollView>
            {rows.length === 0 && (
              <EmptyCard>
                <EmptyRow icon={Wallet} title="No payments yet" body="They show up here once you hire a provider." />
              </EmptyCard>
            )}
            {rows.length > 0 && groups.length === 0 && (
              <EmptyCard>
                <EmptyRow icon={Wallet} title="Nothing here yet" body="Try another filter to see more payments." />
              </EmptyCard>
            )}
            {groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <View>
                  <Text style={[styles.label, styles.listTitle]} accessibilityRole="header">{group.title}</Text>
                  <Text style={styles.cardMeta}>{group.summary}</Text>
                </View>
                {group.rows.map((row) => {
                  const view = rowView(row);
                  const color = toneColor[view.tone];
                  const Icon = view.icon === 'out' ? ArrowUpRight : view.icon === 'in' ? ArrowDownLeft : null;
                  return (
                    <Tap
                      key={row.jobId}
                      style={styles.row}
                      onPress={() => onOpenJob(row.jobId)}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.title}. ${view.a11yLabel}`}
                    >
                      <View style={styles.rowText}>
                        <View style={styles.rowHead}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{row.title}</Text>
                          {Icon && <Icon size={16} color={color} />}
                          <Text style={[styles.cardValue, { color }]} testID="payment-amount">{view.amountText}</Text>
                        </View>
                        <View style={styles.rowHead}>
                          <Text style={styles.cardMeta}>{shortDate(row.date)}</Text>
                          {view.pill && (
                            <View style={[styles.pill, view.pill.kind === 'reviewed' && styles.pillGrey]}>
                              <Text style={[styles.pillText, view.pill.kind === 'reviewed' && styles.pillTextGrey]}>
                                {view.pill.label}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.stateText} testID="payment-state">{view.caption}</Text>
                      </View>
                    </Tap>
                  );
                })}
              </View>
            ))}
          </>
        )}
      </ScrollView>
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
    label: { color: V6Colors.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    listTitle: { marginTop: 8, fontSize: 15, color: V6Colors.ink900 },
    summary: { flexDirection: 'row', gap: 8 },
    filterScroll: { flexGrow: 0 },
    filterRow: { gap: 8, paddingVertical: 2 },
    group: { gap: 10 },
    pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: Colors.warningSurface, borderWidth: 1, borderColor: Colors.warningBorder },
    pillGrey: { backgroundColor: V6Colors.canvas, borderColor: V6Colors.line },
    pillText: { color: Colors.warningText, fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },
    pillTextGrey: { color: V6Colors.ink500 },
    card: {
      flex: 1, padding: 12, borderRadius: 16, gap: 2,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    cardLabel: { color: V6Colors.ink500, fontSize: 13, fontFamily: 'Inter' },
    cardValue: { color: V6Colors.ink900, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
    cardMeta: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    row: {
      flexDirection: 'row', padding: 14, borderRadius: 14,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    rowText: { flex: 1, gap: 2 },
    rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rowTitle: { flex: 1, color: V6Colors.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
    stateText: { color: V6Colors.ink700, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, styles };
}
