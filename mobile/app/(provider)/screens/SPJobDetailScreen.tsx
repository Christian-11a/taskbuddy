/**
 * SPJobDetailScreen.tsx
 *
 * Job details for a provider. The status card says where the job stands and
 * what happens next. The bottom bar holds the one action that moves it on,
 * with an optional text link beside it, and rare actions live in the ⋮ menu.
 * providerJobView decides every card, step, button and menu row; this file
 * renders that result and runs the same API calls and dialogs as before.
 *
 * A job that is not hired yet has no client card. The client's name and photo
 * come from the job's conversation, so the card shows "Client" until it loads.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  EllipsisVertical,
  FileWarning,
  Flag,
  ImageOff,
  MapPin,
} from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import PhotoViewer from '../../../src/components/PhotoViewer';
import ProposalModal from '../../../src/components/ProposalModal';
import DeclineBookingModal from '../../../src/components/DeclineBookingModal';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { showToast } from '../../../src/components/Toast';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import MenuSheet, { type MenuSheetItem } from '../../../src/components/ui/MenuSheet';
import PersonCard from '../../../src/components/ui/PersonCard';
import ProgressStepper from '../../../src/components/ui/ProgressStepper';
import StatusCard from '../../../src/components/ui/StatusCard';
import Tap from '../../../src/components/ui/Tap';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import { Spacing, V6Radii } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { SPScreen } from '../../../src/types/navigation';
import { api, ApiError, type Job, type JobTask } from '../../../src/lib/api';
import { distanceLabel, peso, timeOfDay, urgencyMeta } from '../../../src/lib/format';
import { dayHeading } from '../../../src/lib/jobCalendar';
import { dateKeyOf } from '../../../src/lib/localDate';
import {
  monthDay,
  providerJobView,
  type Action,
  type ProviderApplication,
} from '../../../src/lib/providerJobView';

/** One of the provider's proposals, with the job it is for (`GET /applications/mine`). */
type MyApplication = ProviderApplication & { jobs: { id: string } | null };

interface SPJobDetailScreenProps {
  jobId: string | null;
  onBack: () => void;
  onNavigate: (screen: SPScreen, jobId?: string) => void;
  isUrgent?: boolean;
}

/** Tasks arrive unordered from the embed — `position` is the client's order. */
function sortedTasks(job: Job | null): JobTask[] {
  return [...(job?.job_tasks ?? [])].sort((a, b) => a.position - b.position);
}

/** The text of a button, link or menu row. Homeowner-only actions never reach this screen. */
function labelFor(action: Action, pending: boolean): string {
  switch (action.kind) {
    case 'sendProposal': return 'Send proposal';
    case 'getVerified': return 'Verify to apply';
    case 'withdrawProposal': return 'Withdraw proposal';
    case 'findJobs': return pending ? 'Find more jobs' : 'Find similar jobs';
    case 'startJob': return 'Start job';
    case 'declineBooking': return "Can't make it? Decline booking";
    case 'message': return 'Message client';
    case 'viewWallet': return 'View in wallet';
    case 'reportProblem': return 'Report a problem';
    case 'viewCase': return 'View Complaint Status';
    default: return '';
  }
}

/** "Wed, Oct 15 · 02:30 PM", or null when the timestamp has no date. */
function dayAndTime(iso: string | null | undefined): string | null {
  const key = dateKeyOf(iso);
  return key ? [dayHeading(key), timeOfDay(iso)].filter(Boolean).join(' · ') : null;
}

export default function SPJobDetailScreen({ jobId, onBack, onNavigate }: SPJobDetailScreenProps) {
  const { V6Colors, Colors, styles } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { profile, isVerified, refreshProfile } = useAuth();
  const { data: job, loading, error, reload } = useAsyncData(() => {
    if (!jobId) return Promise.reject(new Error('No job selected.'));
    return api.getJob(jobId);
  }, [jobId]);
  const { data: myApps, loading: appsLoading, reload: reloadApps } = useAsyncData(
    () => api.myApplications() as Promise<MyApplication[]>,
    [],
    'sp-applications',
  );
  const { data: dispute } = useAsyncData(
    () => jobId && job?.assigned_provider_id === profile?.id ? api.jobDispute(jobId) : Promise.resolve(null),
    [jobId, job?.assigned_provider_id, profile?.id],
  );
  const isAssignedToMe = job?.assigned_provider_id === profile?.id;
  // Non-blocking. Cached across visits, so the client's name is there at once. While the job is not
  // ours yet (or not loaded), the lookup rejects instead of resolving an empty list: a failed lookup
  // keeps the list already on screen, so the name never flashes back to "Client" during a reload.
  const { data: conversations } = useAsyncData(async () => {
    if (!jobId || !isAssignedToMe) throw new Error('The client is looked up once the job is yours.');
    return api.conversations();
  }, [jobId, isAssignedToMe], 'sp-job-conversations');
  const myApplication = (myApps ?? []).find((a) => a.jobs?.id === jobId);
  const clientConversation = (conversations ?? []).find((c) => c.job_id === jobId);

  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Which checklist row is mid-flight, so only that row shows a spinner.
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const tasks = sortedTasks(job);
  const doneCount = tasks.filter((t) => t.is_done).length;
  const isWorking = isAssignedToMe && job?.status === 'in_progress';
  // Ticking is only meaningful while the job is being worked on.
  const tasksEditable = isWorking;
  const pending = !isAssignedToMe && myApplication?.status === 'pending';
  // Wait for the applications list too, or "Send proposal" could show for a job already applied to.
  const applicationsSettling = appsLoading && myApps === null;
  const view = job && !applicationsSettling
    ? providerJobView({ job, me: profile, myApplication, dispute, tasks, isVerified, now: new Date() })
    : null;
  const main = view?.main ?? null;
  const link = view?.link ?? null;
  const urgency = job ? urgencyMeta(job.urgency, V6Colors) : null;
  const paid = Number(job?.budget ?? 0) > 0;
  const isDone = isAssignedToMe && job?.status === 'completed';
  const complaintOpen = dispute?.status === 'open';
  const releaseDay = job ? monthDay(job.warranty_expires_at) : null;
  const sentAt = myApplication ? dayAndTime(myApplication.applied_at) : null;
  const client = {
    name: clientConversation?.counterpart_name || 'Client',
    avatarUrl: clientConversation?.counterpart_avatar_url ?? null,
  };
  const startAddress = job?.address?.trim();
  const startMessage = startAddress
    ? `Do this when you're at ${startAddress}. The client gets a notification that you've started.`
    : "Do this when you're at the job.";

  const errorMessage = (e: unknown) =>
    e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';

  const runAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
      // Verification is required to apply (BACKEND_SCHEMA.md §17). Reaching
      // this means the cached profile said "verified" when the API disagrees,
      // so re-read it: the Verify button below then replaces Submit Proposal.
      if (e instanceof ApiError && e.code === 'verification_required') {
        void refreshProfile();
      }
    } finally {
      setBusy(false);
    }
  };

  // The two dialogs keep their own error line, so they run their request
  // here rather than through runAction (which reports under the buttons).
  const submitProposal = async (message: string) => {
    if (!job) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.applyToJob(job.id, message || undefined);
      setProposalOpen(false);
      showToast('Proposal sent', 'success');
      reload();
      // Without this, the cached `myApps` list (shared with My Work via the
      // 'sp-applications' cache key) still says "no application here", so
      // Send proposal stays visible and a second tap 400s as a duplicate.
      reloadApps();
    } catch (e) {
      setActionError(errorMessage(e));
      if (e instanceof ApiError && e.code === 'verification_required') {
        void refreshProfile();
      }
    } finally {
      setBusy(false);
    }
  };

  const submitDecline = async (reason: string) => {
    if (!job) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.declineJob(job.id, reason);
      setDeclineOpen(false);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // The client sees the withdrawn proposal as gone. Both caches reload: this
  // job's own (`job`) and the applications list shared with My Work.
  const submitWithdraw = async () => {
    if (!myApplication) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.withdrawApplication(myApplication.id);
      setWithdrawOpen(false);
      reload();
      reloadApps();
    } catch (e) {
      setWithdrawOpen(false);
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // The same call the Start job button made before the confirm existed. The
  // dialog stays open (and locked) while it runs, then closes; a failure shows
  // under the bar.
  const confirmStart = async (current: Job) => {
    await runAction(() => api.startJob(current.id));
    setStartOpen(false);
  };

  const toggleTask = async (task: JobTask) => {
    if (!job || !tasksEditable || pendingTaskId) return;
    setPendingTaskId(task.id);
    setActionError(null);
    try {
      await api.updateJobTask(job.id, task.id, !task.is_done);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setPendingTaskId(null);
    }
  };

  // What a button, link or menu row does. Each branch is the same call or
  // screen change the screen made before the redesign.
  const run = (action: Action, current: Job) => {
    switch (action.kind) {
      case 'sendProposal':
        setActionError(null);
        setProposalOpen(true);
        return;
      case 'getVerified':
        onNavigate('Verification');
        return;
      case 'withdrawProposal':
        setWithdrawOpen(true);
        return;
      case 'findJobs':
        // The Feed tab, where open jobs are listed.
        onNavigate('Dashboard');
        return;
      case 'startJob':
        // Asks first: starting the job notifies the client, so a stray tap must not do it.
        setStartOpen(true);
        return;
      case 'declineBooking':
        setDeclineOpen(true);
        return;
      case 'message':
        onNavigate('Chat', current.id);
        return;
      case 'viewWallet':
        onNavigate('Wallet');
        return;
      case 'reportProblem':
        onNavigate('Dispute Filing', current.id);
        return;
      case 'viewCase':
        onNavigate('Dispute Status', current.id);
        return;
      default:
        return;
    }
  };

  const menuItems: MenuSheetItem[] = job && view
    ? view.menu.map((action) => ({
        label: labelFor(action, pending),
        icon: action.kind === 'viewCase' ? FileWarning : Flag,
        onPress: () => run(action, job),
      }))
    : [];

  return (
    <View style={styles.screen}>
      <PhotoViewer photos={(job?.photo_urls ?? []).map((uri) => ({ uri }))}
        index={photoIndex} onIndexChange={setPhotoIndex} onClose={() => setPhotoIndex(null)} />

      {/* App bar: back, the title, and the ⋮ button only when the menu has something in it. */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap style={styles.iconBtn} onPress={onBack} activeOpacity={0.8} hitSlop={5}
          accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle}>Job details</Text>
        {menuItems.length > 0 ? (
          <Tap style={styles.iconBtn} onPress={() => setMenuOpen(true)} activeOpacity={0.8} hitSlop={5}
            accessibilityRole="button" accessibilityLabel="More job actions">
            <EllipsisVertical size={20} color={V6Colors.ink700} />
          </Tap>
        ) : (
          <View style={styles.iconSpacer} />
        )}
      </View>

      {(loading || applicationsSettling) && <ContentSkeleton variant="detail" />}
      {/* F7: an unavailable job (e.g. hired by someone else) gets a real
          error card instead of a bare grey line on an empty page. */}
      {!!error && !loading && (
        <View style={styles.errorWrap}>
          <LoadErrorCard title="This job isn't available" message={error} onRetry={reload} />
          <Text style={styles.errorHint}>It may have been filled by another provider or closed by the client.</Text>
          <Tap style={styles.errorBtn} onPress={onBack} activeOpacity={0.85} accessibilityRole="button">
            <Text style={styles.errorBtnText}>Go back</Text>
          </Tap>
        </View>
      )}

      {job && view && (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.kicker}>{(job.service_categories?.name ?? 'Job').toUpperCase()}</Text>
            <Text style={styles.title}>{job.title}</Text>
            <View style={styles.priceRow}>
              {job.budget != null && <Text style={styles.price}>{peso(job.budget)}</Text>}
              {urgency && (
                <View style={[styles.chip, { backgroundColor: urgency.bg }]}>
                  <Text style={[styles.chipText, { color: urgency.color }]}>{urgency.label}</Text>
                </View>
              )}
            </View>
          </View>

          <StatusCard tone={view.card.tone} overline={view.card.overline} title={view.card.title} body={view.card.body} />

          {pending && myApplication && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Your proposal</Text>
              <View style={styles.card}>
                {!!sentAt && <Text style={styles.metaText}>Sent {sentAt}</Text>}
                {!!myApplication.cover_message && <Text style={styles.bodyText}>{myApplication.cover_message}</Text>}
              </View>
            </View>
          )}

          {isDone && paid && (
            <View style={styles.card}>
              <View style={styles.earnRow}>
                <Text style={styles.earnLabel}>Job price</Text>
                <Text style={styles.earnValue}>{peso(job.budget)}</Text>
              </View>
              {!!releaseDay && !complaintOpen && (
                <View style={styles.earnRow}>
                  <Text style={styles.earnLabel}>Released to you</Text>
                  <Text style={styles.earnValue}>{releaseDay}</Text>
                </View>
              )}
              <Text style={styles.footnote}>A platform fee is taken when it's paid out. The exact amount shows in your Wallet.</Text>
            </View>
          )}

          {tasks.length > 0 && (
            <View style={styles.block}>
              <View style={styles.blockHeader}>
                <Text style={styles.blockTitle}>{isWorking ? 'Tasks' : 'What the job includes'}</Text>
                {isWorking && <Text style={styles.blockMeta}>{doneCount}/{tasks.length} done</Text>}
              </View>
              <View style={styles.card}>
                {tasks.map((task) => (
                  <Tap
                    key={task.id}
                    style={styles.taskRow}
                    onPress={() => void toggleTask(task)}
                    disabled={!tasksEditable || !!pendingTaskId}
                    accessibilityRole="checkbox"
                    accessibilityLabel={task.label}
                    accessibilityState={{ checked: task.is_done, disabled: !tasksEditable }}
                  >
                    <View style={[styles.taskBox, task.is_done && styles.taskBoxDone]}>
                      {pendingTaskId === task.id ? (
                        <ActivityIndicator size="small" color={task.is_done ? Colors.onPrimary : Colors.primary} />
                      ) : (
                        task.is_done && <Check size={14} color={Colors.onPrimary} strokeWidth={3} />
                      )}
                    </View>
                    <Text style={[styles.taskLabel, task.is_done && styles.taskLabelDone]}>{task.label}</Text>
                  </Tap>
                ))}
              </View>
            </View>
          )}

          {view.step && <ProgressStepper step={view.step} />}

          {isAssignedToMe && (
            <PersonCard
              name={client.name}
              avatarUrl={client.avatarUrl}
              subtitle="Client"
              onMessage={() => onNavigate('Chat', job.id)}
            />
          )}

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}><CalendarDays size={18} color={V6Colors.ink700} /></View>
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>When</Text>
                <Text style={styles.infoValue}>{dayAndTime(job.scheduled_at) ?? 'As soon as possible'}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}><MapPin size={18} color={V6Colors.ink700} /></View>
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>Where</Text>
                <Text style={styles.infoValue}>{job.address}</Text>
                {!!distanceLabel(job.distance_km) && <Text style={styles.infoSub}>{distanceLabel(job.distance_km)}</Text>}
              </View>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>What needs to be done</Text>
            <Text style={styles.bodyText}>{job.description || 'No description provided.'}</Text>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Job photos</Text>
            {job.photo_urls.length ? job.photo_urls.map((uri, index) => (
              <Tap key={uri} onPress={() => setPhotoIndex(index)} accessibilityRole="button"
                accessibilityLabel={`Open job photo ${index + 1}`}>
                <Image source={{ uri }} resizeMode="contain" accessibilityLabel={`Job photo ${index + 1}`}
                  style={styles.photo} />
              </Tap>
            )) : (
              <EmptyCard>
                <EmptyRow icon={ImageOff} title="No photos attached" body="The client did not add any photos to this job." />
              </EmptyCard>
            )}
          </View>
        </ScrollView>
      )}

      {!!actionError && !proposalOpen && !declineOpen && !withdrawOpen && (
        <Text style={styles.actionError} accessibilityRole="alert">{actionError}</Text>
      )}
      {job && main && (
        <BottomActionBar
          primaryLabel={labelFor(main, pending)}
          onPrimary={() => run(main, job)}
          busy={busy}
          secondaryLabel={link ? labelFor(link, pending) : undefined}
          onSecondary={link ? () => run(link, job) : undefined}
        />
      )}

      <MenuSheet
        visible={menuOpen && menuItems.length > 0}
        title={job?.title ?? ''}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />

      <ProposalModal
        visible={proposalOpen}
        jobTitle={job?.title}
        busy={busy}
        error={proposalOpen ? actionError : null}
        onSubmit={(message) => void submitProposal(message)}
        onCancel={() => {
          setProposalOpen(false);
          setActionError(null);
        }}
      />

      <DeclineBookingModal
        visible={declineOpen}
        jobTitle={job?.title}
        submitting={busy}
        error={declineOpen ? actionError : null}
        onCancel={() => {
          setDeclineOpen(false);
          setActionError(null);
        }}
        onConfirm={(reason) => void submitDecline(reason)}
      />

      <ConfirmationModal
        visible={withdrawOpen}
        title="Withdraw your proposal?"
        message="The client won't see it any more. You can't send another proposal for this job."
        confirmLabel="Withdraw"
        cancelLabel="Keep it"
        destructive
        busy={busy}
        onConfirm={() => void submitWithdraw()}
        onCancel={() => setWithdrawOpen(false)}
      />

      <ConfirmationModal
        visible={startOpen}
        title="Start the job now?"
        message={startMessage}
        confirmLabel="I'm here, start job"
        cancelLabel="Not yet"
        busy={busy}
        onConfirm={() => {
          if (job) void confirmStart(job);
        }}
        onCancel={() => setStartOpen(false)}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: V6Colors.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    iconBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    iconSpacer: { width: 38, height: 38 },
    headerTitle: { flex: 1, color: V6Colors.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 24, gap: 16 },

    hero: { gap: 6 },
    kicker: {
      fontFamily: 'Inter', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.9,
      textTransform: 'uppercase', color: Colors.link,
    },
    title: { fontFamily: 'Inter', fontSize: 20, fontWeight: '700', lineHeight: 26, color: V6Colors.ink900 },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    price: { fontFamily: 'Inter', fontSize: 16, fontWeight: '700', color: V6Colors.ink900 },
    chip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    chipText: { fontFamily: 'Inter', fontSize: 12, fontWeight: '600' },

    block: { gap: 10 },
    blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    blockTitle: { fontFamily: 'Inter', fontSize: 14, fontWeight: '700', lineHeight: 20, color: V6Colors.ink900 },
    blockMeta: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', color: V6Colors.ink500 },
    card: {
      gap: 12, padding: 14, borderRadius: 18, borderWidth: 1,
      borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    metaText: { fontFamily: 'Inter', fontSize: 12, lineHeight: 16, color: V6Colors.ink500 },
    bodyText: { fontFamily: 'Inter', fontSize: 14, lineHeight: 21, color: V6Colors.ink700 },

    taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 36 },
    taskBox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: V6Colors.line,
      backgroundColor: V6Colors.surface, alignItems: 'center', justifyContent: 'center',
    },
    taskBoxDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    taskLabel: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: V6Colors.ink900 },
    taskLabelDone: { color: V6Colors.ink500, textDecorationLine: 'line-through' },

    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    infoIcon: {
      width: 36, height: 36, borderRadius: 10, backgroundColor: V6Colors.wellBg,
      alignItems: 'center', justifyContent: 'center',
    },
    infoText: { flex: 1, gap: 2 },
    infoLabel: { fontFamily: 'Inter', fontSize: 12, fontWeight: '500', color: V6Colors.ink500 },
    infoValue: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    infoSub: { fontFamily: 'Inter', fontSize: 12, color: V6Colors.ink500 },
    divider: { height: 1, backgroundColor: V6Colors.line },

    earnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    earnLabel: { fontFamily: 'Inter', fontSize: 14, color: V6Colors.ink700 },
    earnValue: { fontFamily: 'Inter', fontSize: 15, fontWeight: '700', color: V6Colors.ink900 },
    footnote: { fontFamily: 'Inter', fontSize: 12, lineHeight: 17, color: V6Colors.ink500 },

    photo: { width: '100%', height: 240, borderRadius: 14 },

    actionError: {
      color: V6Colors.dangerText, fontSize: 13.5, fontFamily: 'Inter', textAlign: 'center',
      paddingHorizontal: Spacing.screenH, paddingTop: 10,
    },
    errorWrap: { marginHorizontal: Spacing.screenH, marginTop: 16, gap: 12 },
    errorHint: { color: V6Colors.ink500, fontSize: 13.5, lineHeight: 20, fontFamily: 'Inter', textAlign: 'center' },
    errorBtn: {
      marginTop: 10, minHeight: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center',
      borderRadius: V6Radii.btn, borderWidth: 1, borderColor: V6Colors.fieldBorder, backgroundColor: V6Colors.surface,
    },
    errorBtnText: { color: V6Colors.ink800, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, styles };
}
