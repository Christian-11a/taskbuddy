import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import { api } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { peso, shortDate } from '../../../src/lib/format';
import { payoutStatus, payoutTitle } from '../../../src/lib/payoutLabels';
import { payoutRows, sentRows, summarizeEarnings } from '../../../src/lib/earningsSummary';

/** What the provider has been paid, what is on its way, and each payout. History only. */
export default function SPEarningsScreen({ onBack, onOpenJob }: { onBack: () => void; onOpenJob: (jobId: string) => void }) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const history = useAsyncData(() => api.paymentHistory(), []);
  const jobs = useAsyncData(() => api.assignedJobs(), []);

  const now = new Date();
  const payouts = payoutRows(history.data);
  const sends = sentRows(history.data);
  const summary = summarizeEarnings(history.data, jobs.data ?? [], now);
  const jobTitles = new Map((jobs.data ?? []).map((job) => [job.id, job.title]));
  // The job lookup is optional: without it titles fall back and "On its way" is hidden.
  const jobsOk = !!jobs.data && !jobs.error;
  const error = history.error;
  const loading = history.loading && !history.data;

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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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

            <Text style={[styles.label, styles.listTitle]} accessibilityRole="header">Released to you</Text>
            {payouts.length === 0 && <Text style={styles.intro}>No payouts yet.</Text>}
            {payouts.map((row) => {
              const title = (row.job_id && jobTitles.get(row.job_id)) || payoutTitle(row.title);
              const jobId = row.job_id;
              return (
                <Tap
                  key={row.id}
                  disabled={!jobId}
                  onPress={() => jobId && onOpenJob(jobId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}, ${peso(row.amount)}`}
                  style={styles.payout}
                  testID="payout-row"
                >
                  <View style={styles.payoutText}>
                    <Text style={styles.cardValue}>{peso(row.amount)}</Text>
                    <Text style={styles.rowTitle} numberOfLines={2}>{title}</Text>
                    <Text style={styles.cardMeta}>{shortDate(row.created_at)}</Text>
                    {row.commission_amount != null && (
                      <Text style={styles.cardMeta} testID="payout-fee">Platform fee {peso(row.commission_amount)}</Text>
                    )}
                  </View>
                </Tap>
              );
            })}

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
                <View key={row.id} style={styles.payout} testID="send-row">
                  <View style={styles.payoutText}>
                    <View style={styles.payoutHead}>
                      <Text style={styles.cardValue}>{peso(row.amount)}</Text>
                      <Text style={[styles.statusText, { color: statusColor }]} testID="send-status">{status.label}</Text>
                    </View>
                    <Text style={styles.cardMeta}>
                      {[row.withdrawal_destination, shortDate(row.created_at)].filter(Boolean).join(' · ')}
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
    rowTitle: { color: V6Colors.ink700, fontSize: 14, fontWeight: '600', lineHeight: 19, fontFamily: 'Inter' },
    payout: {
      flexDirection: 'row', padding: 14, borderRadius: 14,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    payoutText: { flex: 1, gap: 2 },
    payoutHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    statusText: { fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
