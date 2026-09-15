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
 *
 * Accept is where the hire's money is held, so it is also where the hire's
 * refusals surface: an insufficient wallet (400), a provider who is not
 * verified (409 `provider_not_verified`), or a rate limit (429). Each shows in
 * the payment modal (or, for Reject, the banner above the list) rather than
 * disappearing — the actions used to have no catch at all, so a short wallet
 * looked like a button that did nothing.
 *
 * Accept opens `HirePaymentModal`: pay from the wallet (the accept call holds
 * the budget), or pay by card on Stripe Checkout (BACKEND_SCHEMA.md §29.4).
 * A card hire is made by Stripe's webhook, not by this screen, so after the
 * browser closes the screen polls the application until it turns `accepted`
 * — the same "the server decides, the app waits" shape as Add Money.
 */

import React, { useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AlertCircle, ArrowLeft, MessageCircle, ShieldAlert, Star } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';

const C = V6Colors;
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, type JobApplication } from '../../../src/lib/api';
import { initials } from '../../../src/lib/format';
import HirePaymentModal from '../../../src/components/HirePaymentModal';
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
  const { data: apps, loading, error, reload } = useAsyncData<JobApplication[]>(
    async () => {
      if (!jobId) throw new Error('No job selected.');
      return api.jobApplications(jobId);
    },
    [jobId],
  );

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      );
      // Whatever refused this, the list may be stale — someone else may have
      // decided the application, or the provider's status may have changed.
      reload();
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = apps?.filter((a) => a.status === 'pending').length ?? 0;

  // ── Hiring: the payment choice ─────────────────────────────────────────────
  const [hireTarget, setHireTarget] = useState<JobApplication | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [hireBusy, setHireBusy] = useState<'wallet' | 'card' | null>(null);
  const [hireMessage, setHireMessage] = useState<{ text: string; tone: 'error' | 'info' } | null>(null);

  const openHire = async (app: JobApplication) => {
    if (!jobId) return;
    setActionError(null);
    setHireMessage(null);
    setBudget(null);
    setAvailable(null);
    setHireTarget(app);
    try {
      const [job, wallet] = await Promise.all([api.getJob(jobId), api.wallet()]);
      setBudget(job.budget == null ? null : Number(job.budget));
      setAvailable(wallet.available);
    } catch (e) {
      setHireMessage({
        text: e instanceof Error ? e.message : 'Could not load your balance.',
        tone: 'error',
      });
    }
  };

  const closeHire = () => {
    setHireTarget(null);
    setHireMessage(null);
  };

  const payFromWallet = async () => {
    if (!hireTarget) return;
    setHireBusy('wallet');
    setHireMessage(null);
    try {
      await api.acceptApplication(hireTarget.id);
      closeHire();
      reload();
    } catch (e) {
      setHireMessage({
        text: e instanceof Error ? e.message : 'Could not complete the hire.',
        tone: 'error',
      });
      reload();
    } finally {
      setHireBusy(null);
    }
  };

  /** Re-reads the proposal until the webhook has decided it, or we give up waiting. */
  const awaitHire = async (applicationId: string) => {
    for (let attempt = 0; attempt < HIRE_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, HIRE_POLL_INTERVAL_MS));
      const latest = (await api.jobApplications(jobId!)).find((a) => a.id === applicationId);
      if (latest && latest.status !== 'pending') return latest.status;
    }
    return 'pending' as const;
  };

  const payByCard = async () => {
    if (!hireTarget || !jobId) return;
    setHireBusy('card');
    setHireMessage(null);
    try {
      // exp://[ip]:8081/--/hire in Expo Go, taskbuddy://hire in a build —
      // the backend allowlists both.
      const appRedirect = AuthSession.makeRedirectUri({ scheme: 'taskbuddy', path: 'hire' });
      const session = await api.createHireCheckoutSession({
        application_id: hireTarget.id,
        app_redirect: appRedirect,
      });
      const result = await WebBrowser.openAuthSessionAsync(session.url, appRedirect);
      const outcome =
        result.type === 'success'
          ? new URLSearchParams(result.url.split('?')[1] ?? '').get('hire')
          : null;

      if (outcome === 'cancelled') {
        setHireMessage({ text: 'Payment was cancelled.', tone: 'info' });
        return;
      }
      // Paid, or the browser was dismissed — which is not proof they didn't
      // pay. Either way only the server knows, so ask it.
      setHireMessage({ text: 'Confirming your payment…', tone: 'info' });
      const status = await awaitHire(hireTarget.id);
      reload();
      if (status === 'accepted') {
        closeHire();
      } else if (status === 'pending') {
        setHireMessage({
          text:
            outcome === 'success'
              ? 'Payment received. Your hire is still being confirmed — check back in a moment.'
              : 'No payment was confirmed. If you did pay, your hire will appear shortly.',
          tone: 'info',
        });
      } else {
        setHireMessage({
          text: 'Your payment is in your wallet, but the hire could not be completed — this proposal is no longer available.',
          tone: 'error',
        });
      }
    } catch (e) {
      setHireMessage({
        text: e instanceof Error ? e.message : 'Could not open the payment page.',
        tone: 'error',
      });
    } finally {
      setHireBusy(null);
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
            {pendingCount} active proposal{pendingCount === 1 ? '' : 's'} · Hire exactly one provider
          </Text>

          {actionError && (
            <View style={styles.errorBanner} testID="applications-action-error">
              <AlertCircle size={16} color={C.red700} />
              <Text style={[styles.errorBannerText, { flex: 1 }]}>{actionError}</Text>
            </View>
          )}

          {apps.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No applications yet</Text>
              <Text style={styles.emptyText}>No providers have applied to this job yet.</Text>
            </View>
          )}

          <View style={styles.list}>
            {apps.map((app) => {
              const provider = app.provider;
              const stats = provider?.provider_profiles ?? null;
              const verified = stats?.is_verified === true;
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
                          {stats?.cached_avg_rating != null
                            ? `${Number(stats.cached_avg_rating).toFixed(1)} · `
                            : 'New · '}
                          {stats?.cached_completed_jobs ?? 0} jobs
                        </Text>
                      </View>
                      {!verified && (
                        <View style={styles.unverifiedChip}>
                          <ShieldAlert size={11} color={C.amber700} />
                          <Text style={styles.unverifiedChipText}>Not verified</Text>
                        </View>
                      )}
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

                  {app.status === 'pending' ? (
                    <View style={styles.actionsRow}>
                      <TouchableOpacity
                        style={[styles.outlineBtn, busyId !== null && styles.disabled]}
                        onPress={() => runAction(app.id, () => api.rejectApplication(app.id))}
                        disabled={busyId !== null}
                        activeOpacity={0.85}
                        testID={`applications-reject-${app.id}`}
                      >
                        <Text style={styles.outlineBtnText}>{busyId === app.id ? 'Working…' : 'Reject'}</Text>
                      </TouchableOpacity>
                      {/* Hiring an unverified provider is refused by the API
                          (409 provider_not_verified); disabling it here says
                          why before the tap rather than after. */}
                      <TouchableOpacity
                        style={[styles.primaryBtn, (busyId !== null || !verified) && styles.disabled]}
                        onPress={() => openHire(app)}
                        disabled={busyId !== null || !verified}
                        activeOpacity={0.85}
                        testID={`applications-accept-${app.id}`}
                      >
                        <Text style={styles.primaryBtnText}>
                          {busyId === app.id ? 'Working…' : verified ? 'Accept' : 'Awaiting verification'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.decidedText}>{DECIDED_LABEL[app.status]}</Text>
                  )}
                </View>
              );
            })}
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      <HirePaymentModal
        visible={hireTarget !== null}
        providerName={hireTarget?.provider?.full_name ?? 'this provider'}
        budget={budget}
        available={available}
        busy={hireBusy}
        message={hireMessage}
        onPayWallet={payFromWallet}
        onPayCard={payByCard}
        onAddMoney={() => {
          closeHire();
          onNavigate?.('Wallet');
        }}
        onClose={closeHire}
      />
    </View>
  );
}

/** How long to wait for Stripe's webhook to turn a card payment into a hire. */
const HIRE_POLL_ATTEMPTS = 8;
const HIRE_POLL_INTERVAL_MS = 1500;

const DECIDED_LABEL: Record<Exclude<JobApplication['status'], 'pending'>, string> = {
  accepted: 'Hired',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn by the provider',
};

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

  unverifiedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#fef3c7', borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 2,
  },
  unverifiedChipText: { color: C.amber700, fontSize: 10.5, fontWeight: '700', fontFamily: 'Inter' },
  decidedText: { color: C.ink500, fontSize: 12.5, fontWeight: '600', fontFamily: 'Inter', textAlign: 'center' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    borderRadius: 12, padding: 11, marginBottom: 12,
  },
  errorBannerText: { color: C.red700, fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter' },

  disabled: { opacity: 0.6 },
  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
});
