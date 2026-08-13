/**
 * HOJobApplicationsScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-applicants screen —
 * flat white .topbar + .proposal-card list (bordered white cards, avatar +
 * name + rating/jobs meta, cover message in a shaded quote block, and two
 * actions per card).
 *
 * Also fixes a real bug found while restyling: `onBack` was already a wired
 * prop (App.tsx passes it) but the old header never rendered a back button,
 * so there was no in-app way off this screen except the OS back gesture.
 *
 * Deviation: the mockup's proposal cards show a provider's bid amount and a
 * "View Profile" + "Hire" action pair; this app's applications don't carry a
 * bid amount (providers apply to the homeowner's posted budget, not counter
 * -offer), so the actions here are the real ones this screen supports —
 * Accept / Reject — restyled to the same outline/primary button pair.
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
import { ArrowLeft, MessageCircle, Star } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';

const C = V6Colors;
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
      {/* Header — matches .topbar (flat white) */}
      <View style={styles.header}>
        {onBack && (
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={C.ink700} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>Proposals</Text>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 24 }} color={C.cyan700} />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

      {!loading && apps && (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.countText}>
            {apps.length} active proposal{apps.length === 1 ? '' : 's'} · Hire exactly one provider
          </Text>

          {apps.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No applications yet</Text>
              <Text style={styles.emptyText}>No providers have applied to this job yet.</Text>
            </View>
          )}

          <View style={styles.list}>
            {apps.map((app) => {
              const provider = app.profiles ?? null;
              return (
                <View key={app.id} style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(provider?.full_name)}</Text>
                    </View>
                    <View style={styles.copy}>
                      <Text style={styles.providerName}>{provider?.full_name ?? 'Provider'}</Text>
                      <View style={styles.ratingRow}>
                        <Star size={12} color={C.ink400} fill={C.ink400} />
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
                        <MessageCircle size={15} color={C.white} />
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.messageBox}>
                    <Text style={styles.messageText}>{app.cover_message ?? 'No cover message.'}</Text>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.outlineBtn, busyId === app.id && styles.disabled]}
                      onPress={() => runAction(app.id, () => api.rejectApplication(app.id))}
                      disabled={busyId === app.id}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.outlineBtnText}>{busyId === app.id ? 'Working…' : 'Reject'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.primaryBtn, busyId === app.id && styles.disabled]}
                      onPress={() => runAction(app.id, () => api.acceptApplication(app.id))}
                      disabled={busyId === app.id}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.primaryBtnText}>{busyId === app.id ? 'Working…' : 'Accept'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },
  countText: { color: C.ink400, fontSize: 12.5, fontFamily: 'Inter', marginBottom: 14 },

  emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
  emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center' },

  list: { gap: 11 },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 15 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  avatar: {
    width: 42, height: 42, borderRadius: 13,
    backgroundColor: C.cyan700, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: C.white, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
  copy: { flex: 1 },
  providerName: { color: C.ink900, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  providerMeta: { color: C.ink400, fontSize: 11.5, fontFamily: 'Inter' },
  chatBtn: { backgroundColor: C.cyan700, borderRadius: 10, padding: 8 },

  messageBox: { backgroundColor: '#f8fafc', borderRadius: 11, padding: 11, marginVertical: 11 },
  messageText: { color: C.ink700, fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter' },

  actionsRow: { flexDirection: 'row', gap: 8 },
  outlineBtn: { flex: 1, borderWidth: 1, borderColor: '#dce3e9', borderRadius: 11, paddingVertical: 9, alignItems: 'center' },
  outlineBtnText: { color: C.ink700, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
  primaryBtn: { flex: 1, backgroundColor: C.cyan700, borderRadius: 11, paddingVertical: 9, alignItems: 'center' },
  primaryBtnText: { color: C.white, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },

  disabled: { opacity: 0.6 },
  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
});
