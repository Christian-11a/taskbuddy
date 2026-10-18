import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowDownLeft, ArrowLeft } from 'lucide-react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import { api } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { peso, shortDate } from '../../../src/lib/format';
import { maskDestination, payoutStatus, payoutTitle } from '../../../src/lib/payoutLabels';
import { groupReleasedByMonth, payoutRows, sentRows, spokenPesos, summarizeEarnings } from '../../../src/lib/earningsSummary';

/** What the provider has been paid, what is on its way, and each payout. History only. */
export default function SPEarningsScreen({ onBack, onOpenJob }: { onBack: () => void; onOpenJob: (jobId: string) => void }) {
  const { styles, V6Colors, Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [refreshing, setRefreshing] = useState(false);
  // reload() is fire-and-forget, so the spinner stops when the fetch itself settles, on success or failure.
  const history = useAsyncData(() => api.paymentHistory().finally(() => setRefreshing(false)), [], 'payment-history');
  const jobs = useAsyncData(() => api.assignedJobs(), [], 'sp-assigned');
  const onRefresh = () => {
    setRefreshing(true);
    history.reload();
    jobs.reload();
  };

  const now = new Date();
  const payouts = payoutRows(history.data);
  const groups = groupReleasedByMonth(payouts);
  const sends = sentRows(history.data);
  const summary = summarizeEarnings(history.data, jobs.data ?? [], now);
  const jobTitles = new Map((jobs.data ?? []).map((job) => [job.id, job.title]));
  // The job lookup is optional: without it titles fall back and "On its way" is hidden.
  const jobsOk = !!jobs.data && !jobs.error;
  const error = history.error;
  const loading = history.loading && !history.data;
  const successColor = Colors.successText;

  const cards: { key: string; label: string; value: number }[] = [
    { key: 'month', label: 'Released to you this month', value: summary.paidThisMonth },
    { key: 'total', label: 'Released to you in total', value: summary.paidTotal },
    ...(jobsOk ? [{ key: 'way', label: 'On its way', value: summary.onItsWay }] : []),
    ...(summary.feesThisMonth !== null ? [{ key: 'fees', label: 'Platform fees this month', value: summary.feesThisMonth }] : []),
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Earnings</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={V6Colors.link} colors={[V6Colors.link]} />
        }
      >
        <Text style={styles.intro}>
          Payouts go to your GCash, Maya or bank account automatically when the client confirms the job is done.
        </Text>

        {loading && <ContentSkeleton variant="list" />}
        {!!error && (
          <LoadErrorCard
            title="Couldn't load your earnings"
            message={error}
            onRetry={() => { history.reload(); jobs.reload(); }}
          />
        )}

        {!loading && !error && (
          <>
            <View style={styles.grid}>
              {cards.map((card) => (
                <View key={card.key} style={styles.summaryCard} testID={`summary-${card.key}`}>
                  <Text style={styles.cardLabel}>{card.label}</Text>
                  <Text style={styles.cardValue}>{peso(card.value)}</Text>
                </View>
              ))}
            </View>
            {jobsOk && summary.onHold > 0 && (
              <Text style={styles.holdText} testID="on-hold">On hold: complaint open {peso(summary.onHold)}</Text>
            )}

            <Text style={[styles.label, styles.listTitle]} accessibilityRole="header">Released to you</Text>
            {payouts.length === 0 && <Text style={styles.intro}>No payouts yet.</Text>}
            {groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <View>
                  <Text style={[styles.label, styles.listTitle]} accessibilityRole="header">{group.title}</Text>
                  <Text style={styles.cardMeta}>{group.summary}</Text>
                </View>
                {group.rows.map((row) => {
                  const title = (row.job_id && jobTitles.get(row.job_id)) || payoutTitle(row.title);
                  const jobId = row.job_id;
                  const hasFee = row.commission_amount != null;
                  return (
                    <Tap
                      key={row.id}
                      disabled={!jobId}
                      onPress={() => jobId && onOpenJob(jobId)}
                      accessibilityRole="button"
                      accessibilityLabel={`${title}. Released ${spokenPesos(row.amount)} to you${hasFee ? `. Platform fee ${spokenPesos(row.commission_amount as number)}` : ''}`}
                      style={styles.payout}
                      testID="payout-row"
                    >
                      <View style={styles.payoutText}>
                        <View style={styles.payoutHead}>
                          <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
                          <ArrowDownLeft size={16} color={successColor} />
                          <Text style={[styles.cardValue, { color: successColor }]} testID="payout-amount">+{peso(row.amount)}</Text>
                        </View>
                        <Text style={styles.cardMeta}>{shortDate(row.created_at)}</Text>
                        {hasFee && (
                          <Text style={styles.cardMeta} testID="payout-fee">Platform fee −{peso(row.commission_amount as number)}</Text>
                        )}
                      </View>
                    </Tap>
                  );
                })}
              </View>
            ))}

            <Text style={[styles.label, styles.listTitle]} accessibilityRole="header">Sent to your account</Text>
            <Text style={styles.intro}>Released money is sent in batches, so these are not matched to single jobs.</Text>
            {sends.length === 0 && <Text style={styles.intro}>Nothing sent yet.</Text>}
            {sends.map((row) => {
              const status = payoutStatus(row.status);
              const statusColor = status.tone === 'success' ? V6Colors.successText
                : status.tone === 'warning' ? V6Colors.warningText
                : status.tone === 'danger' ? V6Colors.dangerText
                : V6Colors.ink500;
              return (
                <View key={row.id} style={styles.payout} testID="send-row" accessible
                  accessibilityLabel={`${spokenPesos(row.amount)} sent to your account, ${status.label}`}>
                  <View style={styles.payoutText}>
                    <View style={styles.payoutHead}>
                      <Text style={styles.cardValue}>{peso(row.amount)}</Text>
                      <View style={[styles.pill, { borderColor: statusColor }]}>
                        <Text style={[styles.statusText, { color: statusColor }]} testID="send-status">{status.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.cardMeta}>
                      {[maskDestination(row.withdrawal_destination), shortDate(row.created_at)].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
              );
            })}
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
    content: { padding: 20, paddingBottom: 32, gap: 14 },
    intro: { color: V6Colors.ink500, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    label: { color: V6Colors.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    listTitle: { marginTop: 8, fontSize: 15, color: V6Colors.ink900 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    summaryCard: {
      flexGrow: 1, flexBasis: '45%', padding: 14, borderRadius: 16, gap: 2,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    cardLabel: { color: V6Colors.ink500, fontSize: 13, fontFamily: 'Inter' },
    cardValue: { color: V6Colors.ink900, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
    cardMeta: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    rowTitle: { flex: 1, color: V6Colors.ink900, fontSize: 14, fontWeight: '600', lineHeight: 19, fontFamily: 'Inter' },
    payout: {
      flexDirection: 'row', padding: 14, borderRadius: 14,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    payoutText: { flex: 1, gap: 2 },
    payoutHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    group: { gap: 10 },
    holdText: { color: Colors.warningText, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
    statusText: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
