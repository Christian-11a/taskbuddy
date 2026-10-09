/**
 * HOJobApplicationsScreen.tsx
 *
 * The proposals on one job, decided by the homeowner. Each pending proposal has
 * one main action, Hire (the filled pill on the right); View profile and Decline
 * are small links, so there is no equal Reject / Accept pair. Declined and
 * withdrawn proposals sit in a greyed NOT SELECTED group with no actions.
 *
 * Also fixes a real bug found while restyling: `onBack` was already a wired
 * prop (App.tsx passes it) but the old header never rendered a back button,
 * so there was no in-app way off this screen except the OS back gesture.
 *
 * Hire opens `HirePaymentModal`: pay from the wallet (the accept call holds
 * the budget), or pay by card on Stripe Checkout (BACKEND_SCHEMA.md §29.4).
 * Nothing is paid until the sheet's own "Confirm and hire" is pressed.
 * A card hire is made by Stripe's webhook, not by this screen, so after the
 * browser closes the screen polls the application until it turns `accepted`
 * — the same "the server decides, the app waits" shape as Add Money.
 *
 * Refusals still surface where they happen: an insufficient wallet (400), a
 * provider who is not verified (409 `provider_not_verified`), or a rate limit
 * (429). Each shows in the payment sheet, or in the banner above the list for
 * Decline, rather than disappearing.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import { dayLabel, peso, plural, timeAgo } from '../../../src/lib/format';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import Silhouette from '../../../src/components/ui/Silhouette';
import { AlertCircle, ArrowLeft, BadgeCheck, CheckCircle2, ShieldAlert, Star } from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, type Job, type JobApplication } from '../../../src/lib/api';
import { openRedirectSession } from '../../../src/lib/appRedirectSession';
import HirePaymentModal from '../../../src/components/HirePaymentModal';
import HiredView from '../../../src/components/HiredView';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import HOProviderProfileScreen from './HOProviderProfileScreen';
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
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { data: apps, loading, error, reload } = useAsyncData<JobApplication[]>(
    async () => {
      if (!jobId) throw new Error('No job selected.');
      return api.jobApplications(jobId);
    },
    [jobId],
  );
  // The job's title, budget and date for the summary chip. Listing the
  // proposals doesn't need it, so if it fails the chip is simply left out.
  const jobInfo = useAsyncData<Job | null>(
    async () => (jobId ? api.getJob(jobId) : null),
    [jobId],
  );
  const job = jobInfo.data;
  const jobHasBudget = job != null && job.budget != null && Number(job.budget) > 0;

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

  const hiredApp = apps?.find((a) => a.status === 'accepted') ?? null;
  const pending = apps?.filter((a) => a.status === 'pending') ?? [];
  const declined = apps?.filter((a) => a.status === 'rejected' || a.status === 'withdrawn') ?? [];
  // Once someone is hired, the other open proposals can no longer be hired.
  const notSelected = hiredApp ? [...pending, ...declined] : declined;

  // Decline asks first: it can't be undone. Hire goes straight to the payment
  // sheet, whose confirm page is the one check before any money moves.
  const [confirmReject, setConfirmReject] = useState<JobApplication | null>(null);

  // The provider profile opened from a proposal. It is shown in place of the
  // list, so the payment sheet below is the same one the list opens.
  const [profileOf, setProfileOf] = useState<JobApplication | null>(null);
  // Read the proposal's current status, not the copy the profile was opened
  // with: it can have been hired since. Only a pending one, with nobody hired
  // yet, can be hired from its profile.
  const profileLatest = profileOf ? apps?.find((a) => a.id === profileOf.id) ?? profileOf : null;
  const profileHireable = profileLatest?.status === 'pending' && hiredApp === null;

  // Set once a hire goes through; the hired screen replaces the list until left.
  const [hired, setHired] = useState<HiredState | null>(null);

  useEffect(() => {
    if (!profileOf) return;
    // Android back closes the profile first. React Native calls the most recently
    // added listener first, so this runs before the app's own back handler.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setProfileOf(null);
      return true;
    });
    return () => sub.remove();
  }, [profileOf]);

  // ── Hiring: the payment choice ─────────────────────────────────────────────
  const [hireTarget, setHireTarget] = useState<JobApplication | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [hireScheduledAt, setHireScheduledAt] = useState<string | null>(null);
  const [hireLoading, setHireLoading] = useState(false);
  const [hireBusy, setHireBusy] = useState<'wallet' | 'card' | null>(null);
  const [hireMessage, setHireMessage] = useState<{ text: string; tone: 'error' | 'info' } | null>(null);

  const openHire = async (app: JobApplication) => {
    if (!jobId) return;
    setActionError(null);
    setHireMessage(null);
    setBudget(null);
    setAvailable(null);
    setJobTitle(null);
    setHireScheduledAt(null);
    // Until the job and wallet are read, the sheet cannot offer a payment: the
    // budget decides what is charged, so no option is usable yet.
    setHireLoading(true);
    setHireTarget(app);
    try {
      const [job, wallet] = await Promise.all([api.getJob(jobId), api.wallet()]);
      setJobTitle(job.title);
      setHireScheduledAt(job.scheduled_at ?? null);
      setBudget(job.budget == null ? null : Number(job.budget));
      setAvailable(wallet.available);
    } catch (e) {
      setHireMessage({
        text: e instanceof Error ? e.message : 'Could not load your balance.',
        tone: 'error',
      });
    } finally {
      setHireLoading(false);
    }
  };

  const closeHire = () => {
    setHireTarget(null);
    setHireMessage(null);
  };

  /** The hire went through: the hired screen replaces the list. */
  const showHired = (app: JobApplication) => {
    setHired({
      providerName: app.provider?.full_name ?? 'Your provider',
      budget,
      scheduledAt: hireScheduledAt,
    });
  };

  const payFromWallet = async () => {
    if (!hireTarget) return;
    setHireBusy('wallet');
    setHireMessage(null);
    try {
      await api.acceptApplication(hireTarget.id);
      showHired(hireTarget);
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
      const result = await openRedirectSession(session.url, appRedirect);
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
        showHired(hireTarget);
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

  const subline = hiredApp
    ? 'Provider hired · Follow the job from Job Details'
    : job == null
      ? 'Pick one provider.'
      : jobHasBudget
        ? 'Pick one provider. You only pay when you hire, and the money is held safely until the job is done.'
        : "Pick one provider. Nothing is held: they're hired straight away.";

  const chipText = job
    ? [job.title, jobHasBudget ? peso(job.budget) : null, job.scheduled_at ? dayLabel(job.scheduled_at) : 'ASAP']
        .filter(Boolean)
        .join(' · ')
    : null;

  /** One proposal. `open`: can still be hired. `hired`: the accepted one. `closed`: greyed, no actions. */
  const renderProposal = (app: JobApplication, state: 'open' | 'hired' | 'closed') => {
    const provider = app.provider;
    const name = provider?.full_name ?? 'Provider';
    const stats = provider?.provider_profiles ?? null;
    const verified = stats?.is_verified === true;
    const sent = timeAgo(app.applied_at);
    const actionsDisabled = busyId !== null || !verified;
    return (
      <View key={app.id} style={[styles.card, state === 'closed' && styles.cardMuted]}>
        <View style={styles.cardHead}>
          <View style={styles.avatar}>
            <Silhouette name={provider?.full_name} textStyle={styles.avatarText} />
          </View>
          <View style={styles.copy}>
            <View style={styles.nameRow}>
              <Text style={styles.providerName} numberOfLines={1}>{name}</Text>
              {verified && (
                <View style={styles.verifiedChip}>
                  <BadgeCheck size={12} color={V6Colors.successText} />
                  <Text style={styles.verifiedChipText}>Verified</Text>
                </View>
              )}
            </View>
            <View style={styles.ratingRow}>
              <Star size={12} color={C.ink400} fill={C.ink400} />
              <Text style={styles.providerMeta}>
                {stats?.cached_avg_rating != null ? `${Number(stats.cached_avg_rating).toFixed(1)} · ` : 'New · '}
                {plural(stats?.cached_completed_jobs, 'job')} done
              </Text>
            </View>
            {state === 'open' && !verified && (
              <View style={styles.unverifiedChip}>
                <ShieldAlert size={11} color={C.amber700} />
                <Text style={styles.unverifiedChipText}>Not verified</Text>
              </View>
            )}
          </View>
        </View>

        <View style={[styles.messageBox, state === 'closed' && styles.messageBoxMuted]}>
          <Text style={styles.messageText}>{app.cover_message ?? 'No cover message.'}</Text>
          {!!sent && <Text style={styles.sentText}>Sent {sent}</Text>}
        </View>

        {state === 'open' && (
          <>
            <View style={styles.actionsRow}>
              <View style={styles.linkRow}>
                <Tap
                  style={styles.linkTap}
                  onPress={() => setProfileOf(app)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${name}'s profile`}
                  testID={`applications-profile-${app.id}`}
                >
                  <Text style={styles.linkText}>View profile</Text>
                </Tap>
                <Tap
                  style={styles.linkTap}
                  onPress={() => setConfirmReject(app)}
                  disabled={busyId !== null}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${name}`}
                  testID={`applications-reject-${app.id}`}
                >
                  <Text style={[styles.linkText, styles.linkTextMuted]}>{busyId === app.id ? 'Working…' : 'Decline'}</Text>
                </Tap>
              </View>
              {/* Hiring an unverified provider is refused by the API
                  (409 provider_not_verified); disabling it here says why
                  before the tap rather than after. */}
              <Tap
                style={[styles.hirePill, actionsDisabled && styles.disabled]}
                onPress={() => openHire(app)}
                disabled={actionsDisabled}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Hire ${name} for this job`}
                accessibilityState={{ disabled: actionsDisabled }}
                testID={`applications-accept-${app.id}`}
              >
                <Text style={styles.hirePillText}>Hire</Text>
              </Tap>
            </View>
            {!verified && <Text style={styles.unverifiedNote}>Hiring unlocks once they&apos;re verified.</Text>}
          </>
        )}

        {state === 'hired' && (
          <View style={styles.hiredBadge}>
            <CheckCircle2 size={16} color={V6Colors.successText} />
            <Text style={styles.hiredText}>Hired</Text>
          </View>
        )}

        {state === 'closed' && <Text style={styles.closedText}>{CLOSED_LABEL[app.status]}</Text>}
      </View>
    );
  };

  // The two sheets, shared by the proposals list and the profile opened from it.
  const sheets = (
    <>
      <ConfirmationModal
        visible={confirmReject !== null}
        title="Reject this proposal?"
        message={`${confirmReject?.provider?.full_name ?? 'This provider'} will be told they weren't selected. You can't undo this.`}
        confirmLabel="Reject"
        destructive
        onConfirm={() => {
          const app = confirmReject;
          setConfirmReject(null);
          if (app) void runAction(app.id, () => api.rejectApplication(app.id));
        }}
        onCancel={() => setConfirmReject(null)}
      />

      <HirePaymentModal
        visible={hireTarget !== null}
        providerName={hireTarget?.provider?.full_name ?? 'this provider'}
        jobTitle={jobTitle}
        budget={budget}
        available={available}
        loading={hireLoading}
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
    </>
  );

  if (hired) {
    return (
      <View style={styles.screen}>
        <HiredView
          providerName={hired.providerName}
          budget={hired.budget}
          scheduledAt={hired.scheduledAt}
          onMessage={() => onNavigate?.('Chat', jobId ?? undefined)}
          onViewJob={() => onNavigate?.('Job Detail', jobId ?? undefined)}
        />
        {sheets}
      </View>
    );
  }

  if (profileOf) {
    return (
      <View style={styles.screen}>
        <HOProviderProfileScreen
          id={profileOf.provider_id}
          proposal={
            profileHireable
              ? {
                  providerName: profileOf.provider?.full_name ?? 'this provider',
                  jobTitle: job?.title ?? null,
                  message: profileOf.cover_message,
                  onHire: () => {
                    void openHire(profileOf);
                  },
                }
              : undefined
          }
          onBack={() => setProfileOf(null)}
        />
        {sheets}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        {onBack && (
          <Tap style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={C.ink700} />
          </Tap>
        )}
        <Text style={styles.headerTitle}>Proposals</Text>
      </View>

      {loading && <ContentSkeleton variant="list" />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

      {!loading && apps && (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {!!chipText && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>{chipText}</Text>
            </View>
          )}
          <Text style={styles.subline}>{subline}</Text>

          {actionError && (
            <View style={styles.errorBanner} testID="applications-action-error">
              <AlertCircle size={16} color={V6Colors.dangerText} />
              <Text style={[styles.errorBannerText, { flex: 1 }]}>{actionError}</Text>
              <Tap onPress={() => reload()} activeOpacity={0.8}>
                <Text style={styles.retryText}>Retry</Text>
              </Tap>
            </View>
          )}

          {apps.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No applications yet</Text>
              <Text style={styles.emptyText}>No providers have applied to this job yet.</Text>
            </View>
          )}

          <View style={styles.list}>
            {hiredApp ? renderProposal(hiredApp, 'hired') : pending.map((app) => renderProposal(app, 'open'))}
          </View>

          {notSelected.length > 0 && (
            <>
              <Text style={styles.groupLabel}>NOT SELECTED ({notSelected.length})</Text>
              <View style={styles.list}>
                {notSelected.map((app) => renderProposal(app, 'closed'))}
              </View>
            </>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      )}

      {sheets}
    </View>
  );
}

/** What the hired screen says, captured when the hire goes through. */
interface HiredState {
  providerName: string;
  budget: number | null;
  scheduledAt: string | null;
}

/** How long to wait for Stripe's webhook to turn a card payment into a hire. */
const HIRE_POLL_ATTEMPTS = 8;
const HIRE_POLL_INTERVAL_MS = 1500;

const CLOSED_LABEL: Record<JobApplication['status'], string> = {
  pending: 'Not selected',
  accepted: 'Hired',
  rejected: 'Not selected',
  withdrawn: 'Withdrawn by the provider',
};

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    chip: {
      alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: Colors.primaryTonal,
      borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10,
    },
    chipText: { color: Colors.primaryDeep, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
    subline: { color: C.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter', marginBottom: 14 },

    emptyState: { alignItems: 'center', paddingVertical: 44, paddingHorizontal: 24 },
    emptyTitle: { color: C.ink800, fontSize: 16, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
    emptyText: { color: C.ink400, fontSize: 14, fontFamily: 'Inter', textAlign: 'center' },

    list: { gap: 11 },
    groupLabel: {
      color: C.ink500, fontSize: 12, fontWeight: '700', fontFamily: 'Inter',
      letterSpacing: 0.6, marginTop: 20, marginBottom: 10,
    },
    card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 15 },
    cardMuted: { backgroundColor: C.ink50 },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
    avatar: {
      width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
      backgroundColor: C.primaryTonalStrong, alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: C.primaryDeep, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
    copy: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    providerName: { flexShrink: 1, color: C.ink900, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    verifiedChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: V6Colors.successSurface, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
    },
    verifiedChipText: { color: V6Colors.successText, fontSize: 11, fontWeight: '700', fontFamily: 'Inter' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    providerMeta: { color: C.ink500, fontSize: 12, fontFamily: 'Inter', flexShrink: 1 },

    messageBox: { backgroundColor: V6Colors.wellBg, borderRadius: 11, padding: 11, marginVertical: 11 },
    messageBoxMuted: { backgroundColor: C.surface },
    messageText: { color: C.ink700, fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter' },
    sentText: { color: C.ink500, fontSize: 11.5, fontFamily: 'Inter', marginTop: 6 },

    actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    linkRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 14 },
    linkTap: { minHeight: 44, justifyContent: 'center' },
    linkText: { color: V6Colors.link, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
    linkTextMuted: { color: C.ink700 },
    hirePill: {
      minHeight: 40, minWidth: 84, borderRadius: 999, backgroundColor: Colors.primary,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
    },
    hirePillText: { color: Colors.onPrimary, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
    unverifiedNote: { color: C.ink500, fontSize: 12, fontFamily: 'Inter', marginTop: 8 },

    unverifiedChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
      backgroundColor: V6Colors.warningSurface, borderRadius: 999,
      paddingHorizontal: 8, paddingVertical: 3, marginTop: 4,
    },
    unverifiedChipText: { color: C.amber700, fontSize: 10.5, fontWeight: '700', fontFamily: 'Inter' },
    hiredBadge: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44,
      borderRadius: 12, backgroundColor: V6Colors.successSurface, borderWidth: 1, borderColor: V6Colors.successBorder,
    },
    hiredText: { color: V6Colors.successText, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    closedText: { color: C.ink500, fontSize: 12.5, fontWeight: '600', fontFamily: 'Inter', marginTop: 10 },

    errorBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: V6Colors.dangerSurface, borderWidth: 1, borderColor: V6Colors.dangerBorder,
      borderRadius: 12, padding: 11, marginBottom: 12,
    },
    retryText: { color: V6Colors.link, fontSize: 12.5, fontWeight: '700', fontFamily: 'Inter' },
    errorBannerText: { color: V6Colors.dangerText, fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter' },

    disabled: { opacity: 0.5 },
    stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30 },
  });
  return { Colors, V6Colors, C, styles };
}
