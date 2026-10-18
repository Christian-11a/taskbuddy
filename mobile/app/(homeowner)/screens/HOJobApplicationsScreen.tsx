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
 * Hire opens `HirePaymentModal`: pay online at a hosted checkout (Xendit
 * test mode: GCash, Maya, card or online banking). There is no wallet
 * (migration 0056). Nothing is paid until the sheet's own "Confirm and hire"
 * is pressed. The hire is made by the payment webhook, not by this screen, so
 * after the browser closes the screen polls the application until it turns
 * `accepted`.
 * Until the server decides a card payment, that proposal waits: its pay
 * options are not offered, and only a status check or an explicit start-over
 * comes back. No other proposal can be paid for meanwhile. The wait is
 * remembered on this device (src/lib/pendingHirePayments), so leaving this
 * screen or restarting the app does not offer to pay again.
 *
 * Refusals still surface where they happen: a
 * provider who is not verified (409 `provider_not_verified`), or a rate limit
 * (429). Each shows in the payment sheet, or in the banner above the list for
 * Decline, rather than disappearing.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useEffect, useRef, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import {
  ActivityIndicator,
  BackHandler,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import { dayLabel, peso, plural, timeAgo } from '../../../src/lib/format';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import Silhouette from '../../../src/components/ui/Silhouette';
import { AlertCircle, ArrowLeft, Award, BadgeCheck, CheckCircle2, Inbox, ShieldAlert, Star } from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, type Job, type JobApplication } from '../../../src/lib/api';
import { openRedirectSession } from '../../../src/lib/appRedirectSession';
import {
  clearPendingHirePayment,
  getPendingHirePayment,
  isPendingHirePaymentExpired,
  loadPendingHirePayments,
  markPendingHirePayment,
  type PendingHirePayment,
} from '../../../src/lib/pendingHirePayments';
import HirePaymentModal from '../../../src/components/HirePaymentModal';
import HiredView from '../../../src/components/HiredView';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { capacityConflictMessage, hireVerificationMessage } from '../../../src/lib/capacityConflict';
import Banner from '../../../src/components/ui/Banner';
import { showToast } from '../../../src/components/Toast';
import HOProviderProfileScreen from './HOProviderProfileScreen';
import { HOScreen } from '../../../src/types/navigation';

interface HOJobApplicationsScreenProps {
  jobId: string | null;
  onBack?: () => void;
  onNavigate?: (screen: HOScreen, jobId?: string) => void;
}

/**
 * App.tsx can move this screen to another job without unmounting it (a proposal notification for
 * that job does). Keying on the job gives each job a fresh screen, so its proposals and the waits
 * remembered on this device are read again before any pay action is offered. The proposals keep
 * the previous job's list until the new one arrives, so resetting in place could match against it.
 */
export default function HOJobApplicationsScreen(props: HOJobApplicationsScreenProps) {
  return <JobProposals key={props.jobId ?? ''} {...props} />;
}

function JobProposals({
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
  const [refreshing, setRefreshing] = useState(false);
  // reload() is fire-and-forget; new proposals or an error mean the fetch settled.
  useEffect(() => {
    setRefreshing(false);
  }, [apps, error]);
  const onRefresh = () => {
    setRefreshing(true);
    reload();
  };
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
  // A card payment for one proposal that the server has not decided yet. Until it is decided,
  // that proposal cannot be paid for again, and no other proposal can be paid for either.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<AwaitingConfirmation | null>(null);
  // The waits this device remembers, read once on mount. Until they are in and the wait has been
  // taken from them (`hydrated`), no pay action is offered, so a remembered wait is never missed.
  const [rememberedWaits, setRememberedWaits] = useState<Map<string, PendingHirePayment> | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const waitingOnAnother = (applicationId: string) =>
    awaitingConfirmation !== null && awaitingConfirmation.applicationId !== applicationId;
  const waitingApp = awaitingConfirmation
    ? apps?.find((a) => a.id === awaitingConfirmation.applicationId)
    : undefined;
  const waitingName = waitingApp?.provider?.full_name ?? 'this provider';

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
  const profileHireable =
    profileLatest?.status === 'pending' && hiredApp === null && hydrated && !waitingOnAnother(profileLatest.id);

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
  // Set when the server answers 409 because the provider is at a capacity limit.
  const [capacityNotice, setCapacityNotice] = useState<string | null>(null);
  const [hireTarget, setHireTarget] = useState<JobApplication | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [hireScheduledAt, setHireScheduledAt] = useState<string | null>(null);
  const [hireLoading, setHireLoading] = useState(false);
  // The job could not be read, so the budget is unknown: no hire is offered.
  const [hireLoadFailed, setHireLoadFailed] = useState(false);
  const [hireBusy, setHireBusy] = useState<'wallet' | 'card' | 'check' | null>(null);
  const [hireMessage, setHireMessage] = useState<{ text: string; tone: 'error' | 'info' } | null>(null);
  // Checked and set synchronously, so a second tap before React re-renders cannot start a second payment.
  const hireInFlight = useRef(false);

  // The server decided the waiting proposal (hired, or declined or withdrawn) while the sheet was
  // shut, so nothing is waiting any more. With the sheet open for it, the check on it settles the wait.
  useEffect(() => {
    if (!awaitingConfirmation || !apps) return;
    const decided = apps.find((a) => a.id === awaitingConfirmation.applicationId);
    if (decided && decided.status !== 'pending' && hireTarget?.id !== decided.id) {
      setAwaitingConfirmation(null);
      void clearPendingHirePayment(decided.id);
    }
  }, [apps, awaitingConfirmation, hireTarget]);

  // Read what this device remembers about waiting card payments, once, on mount.
  useEffect(() => {
    let active = true;
    void loadPendingHirePayments().then((waits) => {
      if (active) setRememberedWaits(waits);
    });
    return () => {
      active = false;
    };
  }, []);

  // Once the proposals and the remembered waits are both in, the most recent wait on one of this
  // job's pending proposals becomes the screen's wait. Waits on other jobs' proposals are not this screen's.
  useEffect(() => {
    if (hydrated || !apps || !rememberedWaits) return;
    let restored: AwaitingConfirmation | null = null;
    let restoredAt = 0;
    for (const app of apps) {
      const wait = rememberedWaits.get(app.id);
      if (app.status === 'pending' && wait && (restored === null || wait.startedAt > restoredAt)) {
        restored = { applicationId: app.id, returnedPaid: wait.returnedPaid, startedAt: wait.startedAt };
        restoredAt = wait.startedAt;
      }
    }
    setAwaitingConfirmation(restored);
    setHydrated(true);
  }, [apps, rememberedWaits, hydrated]);

  // A remembered wait whose proposal the server has since decided (hired, declined or withdrawn) is over.
  useEffect(() => {
    if (!apps || !rememberedWaits) return;
    for (const app of apps) {
      if (app.status !== 'pending' && getPendingHirePayment(app.id) !== null) {
        void clearPendingHirePayment(app.id);
      }
    }
  }, [apps, rememberedWaits]);

  /**
   * A card payment has started for this proposal: the wait shows here and is remembered on the device.
   * Marking again keeps the time the checkout first started, so the screen takes that time from the device.
   */
  const beginWait = (applicationId: string, returnedPaid: boolean) => {
    const marking = markPendingHirePayment(applicationId, returnedPaid);
    const startedAt = getPendingHirePayment(applicationId)?.startedAt ?? Date.now();
    setAwaitingConfirmation({ applicationId, returnedPaid, startedAt });
    return marking;
  };

  /** The wait for this proposal is over, here and on the device. */
  const endWait = (applicationId: string) => {
    setAwaitingConfirmation(null);
    return clearPendingHirePayment(applicationId);
  };

  // A wait open on this screen for 24 hours is over, as a remembered one is. It is checked each time the
  // proposals load, so a screen left open cannot hold its proposal longer than the device's copy would.
  useEffect(() => {
    if (!awaitingConfirmation || !apps) return;
    if (!isPendingHirePaymentExpired(awaitingConfirmation, Date.now())) return;
    setAwaitingConfirmation(null);
    void clearPendingHirePayment(awaitingConfirmation.applicationId);
  }, [apps, awaitingConfirmation]);

  const openHire = async (app: JobApplication) => {
    if (!jobId || !hydrated || waitingOnAnother(app.id)) return;
    setActionError(null);
    setHireMessage(null);
    setBudget(null);
    setJobTitle(null);
    setHireScheduledAt(null);
    // Until the job is read, the sheet cannot offer a payment: the
    // budget decides what is charged, so no option is usable yet.
    setHireLoading(true);
    setHireLoadFailed(false);
    setHireTarget(app);
    try {
      const job = await api.getJob(jobId);
      setJobTitle(job.title);
      setHireScheduledAt(job.scheduled_at ?? null);
      setBudget(job.budget == null ? null : Number(job.budget));
    } catch (e) {
      // A failed read leaves the budget unknown. It must not fall through to the
      // no-budget "hire straight away" path, so the sheet offers no hire.
      setHireLoadFailed(true);
      setHireMessage({
        text: e instanceof Error ? e.message : 'Could not load this job.',
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

  /** The hire went through: the hired screen replaces the list, or the profile it was made from. */
  const showHired = (app: JobApplication) => {
    setProfileOf(null);
    setHired({
      providerName: app.provider?.full_name ?? 'Your provider',
      budget,
      scheduledAt: hireScheduledAt,
    });
  };

  const payFromWallet = async () => {
    if (hireInFlight.current) {
      showToast(HIRE_BUSY_MESSAGE, 'info');
      return;
    }
    if (!hireTarget) return;
    hireInFlight.current = true;
    setHireBusy('wallet');
    setHireMessage(null);
    try {
      await api.acceptApplication(hireTarget.id);
      showHired(hireTarget);
      closeHire();
      reload();
    } catch (e) {
      const refused = hireVerificationMessage(e) ?? capacityConflictMessage(e);
      if (refused) {
        closeHire();
        setCapacityNotice(refused);
        reload();
        return;
      }
      setHireMessage({
        text: e instanceof Error ? e.message : 'Could not complete the hire.',
        tone: 'error',
      });
      reload();
    } finally {
      hireInFlight.current = false;
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

  /**
   * Asks the server what it decided about a card payment, and shows it: hired (the hired
   * screen), still unconfirmed (the wait goes on), or no longer available (the wait ends).
   */
  const settleCardPayment = async (app: JobApplication, returnedPaid: boolean) => {
    const status = await awaitHire(app.id);
    reload();
    if (status === 'accepted') {
      void endWait(app.id);
      showHired(app);
      closeHire();
    } else if (status === 'pending') {
      setHireMessage({
        text: returnedPaid
          ? 'Payment received. Your hire is still being confirmed — check back in a moment.'
          : 'No payment was confirmed. If you did pay, your hire will appear shortly.',
        tone: 'info',
      });
    } else {
      void endWait(app.id);
      setHireMessage({
        text: 'The hire could not be completed — this proposal is no longer available. Your payment is being refunded to your payment method.',
        tone: 'error',
      });
    }
  };

  const payByCard = async () => {
    if (hireInFlight.current) {
      showToast(HIRE_BUSY_MESSAGE, 'info');
      return;
    }
    if (!hireTarget || !jobId) return;
    hireInFlight.current = true;
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
      // A checkout now exists, so a payment can be made. From here the proposal
      // waits until the server decides it, whatever the browser reports; only an
      // explicit cancel ends the wait. The wait is on the device before the browser opens.
      await beginWait(hireTarget.id, false);
      const result = await openRedirectSession(session.url, appRedirect);
      const outcome =
        result.type === 'success'
          ? new URLSearchParams(result.url.split('?')[1] ?? '').get('hire')
          : null;

      if (outcome === 'cancelled') {
        await endWait(hireTarget.id);
        setHireMessage({ text: 'Payment was cancelled.', tone: 'info' });
        return;
      }
      // Paid, or the browser was dismissed — which is not proof they didn't
      // pay. Either way only the server knows, so ask it.
      await beginWait(hireTarget.id, outcome === 'success');
      setHireMessage({ text: 'Confirming your payment…', tone: 'info' });
      await settleCardPayment(hireTarget, outcome === 'success');
    } catch (e) {
      const capacity = hireVerificationMessage(e) ?? capacityConflictMessage(e);
      if (capacity) {
        closeHire();
        setCapacityNotice(capacity);
        return;
      }
      setHireMessage({
        text: e instanceof Error ? e.message : 'Could not open the payment page.',
        tone: 'error',
      });
    } finally {
      hireInFlight.current = false;
      setHireBusy(null);
    }
  };

  /** One more round of checks on a card payment that is still waiting. It never starts a payment. */
  const checkPayment = async () => {
    if (hireInFlight.current) {
      showToast(HIRE_BUSY_MESSAGE, 'info');
      return;
    }
    if (!awaitingConfirmation || !hireTarget || hireTarget.id !== awaitingConfirmation.applicationId) return;
    if (isPendingHirePaymentExpired(awaitingConfirmation, Date.now())) {
      // Open for 24 hours without a decision: the wait is over, so the proposal can be paid for again.
      // The proposals reload, so a hire the server did decide in the meantime shows as it is.
      void endWait(awaitingConfirmation.applicationId);
      reload();
      setHireMessage({
        text: 'This payment was not confirmed within 24 hours, so it is no longer waiting.',
        tone: 'info',
      });
      return;
    }
    hireInFlight.current = true;
    setHireBusy('check');
    setHireMessage(null);
    try {
      await settleCardPayment(hireTarget, awaitingConfirmation.returnedPaid);
    } catch (e) {
      setHireMessage({
        text: e instanceof Error ? e.message : 'Something went wrong. Please try again.',
        tone: 'error',
      });
    } finally {
      hireInFlight.current = false;
      setHireBusy(null);
    }
  };

  /** The person chose to start over, so the pay options come back. */
  const startNewPayment = () => {
    if (awaitingConfirmation) void endWait(awaitingConfirmation.applicationId);
    setHireMessage(null);
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
    // A provider with an approved certificate can be hired for that service without the primary badge; the server decides (409).
    const hireable = verified || (app.certifications?.length ?? 0) > 0;
    const sent = timeAgo(app.applied_at);
    const waitingHere = awaitingConfirmation?.applicationId === app.id;
    const waitingElsewhere = waitingOnAnother(app.id);
    const actionsDisabled = busyId !== null || !hireable || waitingElsewhere || !hydrated;
    // A card payment for this proposal is still with the server, so it cannot be declined meanwhile.
    // Until the remembered waits are read, it is not known whether it is waiting, so it is held too.
    const declineDisabled = busyId !== null || waitingHere || !hydrated;
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
              {(app.certifications?.length ?? 0) > 0 && (
                <View
                  style={styles.verifiedChip}
                  testID={`certified-${app.id}`}
                  accessibilityLabel={`Certified: ${app.certifications!.map((c) => `${c.title}, ${c.issuer}`).join('; ')}`}
                >
                  <Award size={12} color={V6Colors.successText} />
                  <Text style={styles.verifiedChipText}>Certified</Text>
                </View>
              )}
            </View>
            {(app.certifications?.length ?? 0) > 0 && (
              <Text style={styles.providerMeta} numberOfLines={1}>
                {app.certifications!.map((c) => `${c.title} (${c.issuer})`).join(' · ')}
              </Text>
            )}
            <View style={styles.ratingRow}>
              <Star size={12} color={C.ink400} fill={C.ink400} />
              <Text style={styles.providerMeta}>
                {stats?.cached_avg_rating != null ? `${Number(stats.cached_avg_rating).toFixed(1)} · ` : 'New · '}
                {plural(stats?.cached_completed_jobs, 'job')} done
              </Text>
            </View>
            {state === 'open' && !hireable && (
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
                  style={[styles.linkTap, declineDisabled && styles.disabled]}
                  onPress={() => setConfirmReject(app)}
                  disabled={declineDisabled}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Decline ${name}`}
                  accessibilityState={{ disabled: declineDisabled }}
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
            {!hireable && <Text style={styles.hireNote}>Hiring unlocks once they&apos;re verified.</Text>}
            {waitingHere && (
              <Text style={styles.hireNote}>We&apos;re still confirming your payment. Tap Hire to check on it.</Text>
            )}
            {waitingHere && (
              <Text style={styles.hireNote}>We&apos;re still confirming your payment for this proposal.</Text>
            )}
            {waitingElsewhere && (
              <Text style={styles.hireNote}>Hiring pauses until {waitingName}&apos;s payment is confirmed.</Text>
            )}
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

      <ConfirmationModal
        visible={capacityNotice !== null}
        title="This provider is unavailable"
        message={capacityNotice ?? ''}
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setCapacityNotice(null)}
        onCancel={() => setCapacityNotice(null)}
      />

      <HirePaymentModal
        visible={hireTarget !== null}
        providerName={hireTarget?.provider?.full_name ?? 'this provider'}
        jobTitle={jobTitle}
        budget={budget}
        loading={hireLoading}
        loadFailed={hireLoadFailed}
        busy={hireBusy}
        message={hireMessage}
        awaiting={
          awaitingConfirmation !== null && hireTarget?.id === awaitingConfirmation.applicationId
            ? { onCheckPayment: checkPayment, onStartNewPayment: startNewPayment }
            : null
        }
        onPayWallet={payFromWallet}
        onPayCard={payByCard}
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
          <Tap style={styles.backBtn} onPress={onBack} hitSlop={5} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Back">
            <ArrowLeft size={20} color={C.ink700} />
          </Tap>
        )}
        <Text style={styles.headerTitle}>Proposals</Text>
      </View>

      {loading && <ContentSkeleton variant="list" />}
      {!!error && !loading && (
        <View style={styles.loadError}>
          {apps ? (
            <Banner tone="error" message={error} actionLabel="Try again" onAction={reload} />
          ) : (
            <LoadErrorCard title="Couldn't load the proposals" message={error} onRetry={reload} />
          )}
        </View>
      )}

      {!loading && apps && (
        <ScrollView
          testID="applications-scroll"
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={V6Colors.link} colors={[V6Colors.link]} />
          }
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
            <EmptyCard>
              <EmptyRow icon={Inbox} title="No applications yet" body="No providers have applied to this job yet." />
            </EmptyCard>
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

/** A card payment that started for one proposal, which the server has not decided yet. */
interface AwaitingConfirmation {
  applicationId: string;
  /** The browser came back saying the payment went through, so the wait says so. */
  returnedPaid: boolean;
  /** When the checkout started, the same time the device keeps. The wait is over 24 hours after it. */
  startedAt: number;
}

/** How long to wait for Stripe's webhook to turn a card payment into a hire. */
const HIRE_POLL_ATTEMPTS = 8;
const HIRE_POLL_INTERVAL_MS = 1500;

/** Said when Confirm and hire is tapped again while the first hire is still being paid for. */
const HIRE_BUSY_MESSAGE = "We're still processing your payment. Please wait a moment.";

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
    hireNote: { color: C.ink500, fontSize: 12, fontFamily: 'Inter', marginTop: 8 },

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
    loadError: { paddingHorizontal: Spacing.screenH, paddingTop: 16 },
  });
  return { Colors, V6Colors, C, styles };
}
