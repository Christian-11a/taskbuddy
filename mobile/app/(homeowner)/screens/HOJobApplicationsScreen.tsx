/**
 * HOJobApplicationsScreen.tsx
 *
 * Lists job applications for a given jobId. Fetches via `api.jobApplications(jobId)`.
 * Shows provider info and cover message. Accept / Reject buttons call
 * `api.acceptApplication(id)` / `api.rejectApplication(id)`.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MessageCircle, Star } from 'lucide-react-native';
import { Colors, Radii, Shadows, Spacing } from '../../../src/constants/theme';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials } from '../../../src/lib/format';
import { HOScreen } from '../../../src/types/navigation';

interface HOJobApplicationsScreenProps {
  jobId: string | null;
  onBack?: () => void;
  onNavigate?: (screen: HOScreen, jobId?: string) => void;
}

export default function HOJobApplicationsScreen({
  jobId,
  onBack,
  onNavigate,
}: HOJobApplicationsScreenProps) {
  const { data: apps, loading, error, reload } = useAsyncData<any[]>(
    async () => {
      if (!jobId) throw new Error('No job selected.');
      return api.jobApplications(jobId);
    },
    [jobId],
  );

  const [busyId, setBusyId] = useState<string | null>(null);

  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Applications</Text>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 24 }} color={Colors.brandTeal} />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

      {!loading && apps && (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {apps.length === 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>No applications yet</Text>
              <Text style={styles.detailValue}>No providers have applied to this job yet.</Text>
            </View>
          )}

          {apps.map((app) => {
            const provider = app.profiles ?? null;
            return (
              <View key={app.id} style={styles.card}>
                <Text style={styles.cardTitle}>Application</Text>

                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(provider?.full_name)}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.providerName}>{provider?.full_name ?? 'Provider'}</Text>
                    <View style={styles.ratingRow}>
                      <Star size={12} color={Colors.slate} fill={Colors.slate} />
                      <Text style={styles.providerMeta}>
                        {app.cached_avg_rating != null
                          ? `${Number(app.cached_avg_rating).toFixed(1)} · `
                          : 'New · '}
                        {app.cached_completed_jobs ?? 0} jobs
                      </Text>
                    </View>
                  </View>

                  {onNavigate && jobId && (
                    <TouchableOpacity
                      style={styles.chatBtn}
                      onPress={() => onNavigate('Chat', jobId)}
                      activeOpacity={0.85}
                    >
                      <MessageCircle size={14} color={Colors.white} />
                    </TouchableOpacity>
                  )}
                </View>

                <Text style={styles.coverLabel}>Cover Message</Text>
                <Text style={styles.coverMessage}>{app.cover_message ?? '—'}</Text>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.acceptBtn, busyId === app.id && styles.disabled]}
                    onPress={() => runAction(app.id, () => api.acceptApplication(app.id))}
                    disabled={busyId === app.id}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.acceptText}>{busyId === app.id ? 'Working…' : 'Accept'}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.rejectBtn, busyId === app.id && styles.disabled]}
                    onPress={() => runAction(app.id, () => api.rejectApplication(app.id))}
                    disabled={busyId === app.id}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.rejectText}>{busyId === app.id ? 'Working…' : 'Reject'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingHorizontal: Spacing.screenH,
    paddingTop: 18,
    paddingBottom: 12,
  },
  headerTitle: { color: Colors.brandDark, fontSize: 20, fontWeight: '800', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 10, paddingBottom: 20 },

  card: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 16, marginBottom: 12, ...Shadows.card },
  cardTitle: { color: Colors.brandDark, fontSize: 14, fontWeight: '800', fontFamily: 'Inter', marginBottom: 8 },
  detailValue: { color: Colors.brandDark, fontSize: 14, fontFamily: 'Inter' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  avatar: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },

  info: { flex: 1 },
  providerName: { color: Colors.brandDark, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  providerMeta: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },

  chatBtn: {
    backgroundColor: Colors.brandTeal, borderRadius: 10, padding: 8,
  },

  coverLabel: { color: Colors.muted, fontSize: 12, fontFamily: 'Inter', marginTop: 6 },
  coverMessage: { color: Colors.brandDark, fontSize: 14, fontFamily: 'Inter', marginTop: 6 },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  acceptBtn: {
    flex: 1, backgroundColor: Colors.brandTeal, borderRadius: 12, padding: 12, alignItems: 'center', marginRight: 8,
  },
  acceptText: { color: Colors.white, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
  rejectBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.error, borderRadius: 12, padding: 12, alignItems: 'center', marginLeft: 8,
  },
  rejectText: { color: Colors.error, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },

  disabled: { opacity: 0.6 },
  stateText: { color: Colors.slate, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
});
