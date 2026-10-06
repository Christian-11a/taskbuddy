/**
 * SPJobDetailScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-job-detail screen — a
 * flat white .topbar, a borderless .detail-hero (kicker/title/price/facts,
 * bottom-divider only, not a card), .detail-section blocks, and a sticky
 * action bar whose primary button reflects the real job/application state.
 *
 * Open jobs accept proposals. Client hiring confirms the booking without
 * another provider acceptance. Start Job enables the checklist; completion
 * remains client-confirmed after all tasks are done.
 *
 * Deviation from the mockup: its 4-state lifecycle has an explicit "Submit for
 * Review" step. This app's backend has no such action — the homeowner marks a
 * job complete — so the in_progress state ends in an informational message
 * rather than a button that would do nothing.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import PhotoViewer from '../../../src/components/PhotoViewer';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  ListChecks,
  MapPin,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react-native';
import { CalendarDays } from 'lucide-react-native';
import { Spacing, V6Radii } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { SPScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, ApiError, Job, JobTask } from '../../../src/lib/api';
import { distanceLabel, peso, shortDate } from '../../../src/lib/format';
import ProposalModal from '../../../src/components/ProposalModal';
import { showToast } from '../../../src/components/Toast';
import DeclineBookingModal from '../../../src/components/DeclineBookingModal';

interface MyApplication {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  jobs: { id: string };
}

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

export default function SPJobDetailScreen({ jobId, onBack, onNavigate }: SPJobDetailScreenProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { profile, isVerified, refreshProfile } = useAuth();
  const { data: job, loading, error, reload } = useAsyncData(() => {
    if (!jobId) return Promise.reject(new Error('No job selected.'));
    return api.getJob(jobId);
  }, [jobId]);
  const { data: myApps, reload: reloadApps } = useAsyncData(
    () => api.myApplications() as Promise<MyApplication[]>,
    [],
    'sp-applications',
  );
  const { data: dispute } = useAsyncData(
    () => jobId && job?.assigned_provider_id === profile?.id ? api.jobDispute(jobId) : Promise.resolve(null),
    [jobId, job?.assigned_provider_id, profile?.id],
  );
  const myApplication = (myApps ?? []).find((a) => a.jobs.id === jobId);

  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Which checklist row is mid-flight, so only that row shows a spinner.
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const isAssignedToMe = job?.assigned_provider_id === profile?.id;
  /** A homeowner hired them and is waiting for an answer. */
  const isConfirmed = isAssignedToMe && ['assigned', 'confirmed'].includes(job?.status ?? '');
  const isWorking = isAssignedToMe && job?.status === 'in_progress';
  const isDone = isAssignedToMe && job?.status === 'completed';
  const withinWarranty = job?.warranty_expires_at && Date.now() < new Date(job.warranty_expires_at).getTime();
  const isCancelled = isAssignedToMe && job?.status === 'cancelled';
  const canApply = job && ['open', 'recommending'].includes(job.status) && !isAssignedToMe && !myApplication;
  const urgent = job?.urgency === 'urgent';

  const tasks = sortedTasks(job);
  const doneCount = tasks.filter((t) => t.is_done).length;
  const progressPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  // Ticking is only meaningful once the job is theirs and not yet closed.
  const tasksEditable = isWorking;

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
      // Submit Proposal stays visible and a second tap 400s as a duplicate.
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

  const kicker = () => {
    if (isConfirmed) return 'CONFIRMED BOOKING';
    if (isWorking) return 'WORK IN PROGRESS';
    if (isDone) return 'COMPLETED JOB';
    if (isCancelled) return 'CANCELLED BOOKING';
    return `${(job?.service_categories?.name ?? 'JOB').toUpperCase()} OPPORTUNITY`;
  };

  return (
    <View style={styles.screen}>
      <PhotoViewer photos={(job?.photo_urls ?? []).map(uri => ({ uri }))}
        index={photoIndex} onIndexChange={setPhotoIndex} onClose={() => setPhotoIndex(null)} />
      {/* Header — matches .topbar (flat white) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <Text style={styles.headerTitle}>Job Details</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading && <ContentSkeleton variant="detail" />}
      {!!error && !loading && <Text style={styles.stateText}>{error}</Text>}

      {job && (
        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          {/* Hero — matches .detail-hero */}
          <View style={styles.hero}>
            <Text style={styles.kicker}>{kicker()}</Text>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>{job.title}</Text>
              {job.budget != null && <Text style={styles.heroPrice}>{peso(job.budget)}</Text>}
            </View>
            {urgent && <Text style={styles.urgentTag}>URGENT</Text>}
            <View style={styles.factsGrid}>
              <View style={styles.fact}>
                <MapPin size={17} color={C.ink500} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.factLabel}>Location</Text>
                  <Text style={styles.factValue} numberOfLines={3}>{job.address}</Text>
                  {!!distanceLabel(job.distance_km) && (
                    <Text style={styles.factSub}>{distanceLabel(job.distance_km)}</Text>
                  )}
                </View>
              </View>
              <View style={styles.fact}>
                <CalendarDays size={17} color={C.ink500} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.factLabel}>Schedule</Text>
                  <Text style={styles.factValue} numberOfLines={1}>
                    {job.scheduled_at ? shortDate(job.scheduled_at) : 'Flexible'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Progress — only once the job is actually theirs. */}
          {(isConfirmed || isWorking) && tasks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Progress</Text>
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {doneCount}/{tasks.length}
                </Text>
              </View>
              <Text style={styles.progressHint}>
                {doneCount === tasks.length
                  ? 'All tasks done — the client confirms completion from their side.'
                  : 'Tick tasks off as you finish them. The client sees this update.'}
              </Text>
            </View>
          )}

          {/* Checklist — read-only while claimable, tappable once it's theirs. */}
          {tasks.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <ListChecks size={16} color={C.ink900} />
                <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
                  {tasksEditable ? 'Task List' : 'What This Job Includes'}
                </Text>
              </View>
              {tasks.map((task) => (
                <Tap
                  key={task.id}
                  style={styles.taskRow}
                  onPress={() => void toggleTask(task)}
                  activeOpacity={tasksEditable ? 0.7 : 1}
                  disabled={!tasksEditable || !!pendingTaskId}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: task.is_done, disabled: !tasksEditable }}
                >
                  <View
                    style={[
                      styles.taskBox,
                      task.is_done && styles.taskBoxDone,
                      !tasksEditable && styles.taskBoxLocked,
                    ]}
                  >
                    {pendingTaskId === task.id ? (
                      <ActivityIndicator size="small" color={task.is_done ? C.white : C.cyan700} />
                    ) : (
                      task.is_done && <Check size={14} color={C.onPrimary} strokeWidth={3} />
                    )}
                  </View>
                  <Text style={[styles.taskLabel, task.is_done && styles.taskLabelDone]}>
                    {task.label}
                  </Text>
                </Tap>
              ))}
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What Needs To Be Done</Text>
            <Text style={styles.descText}>{job.description || 'No description provided.'}</Text>
          </View>

          {/* Job photos (real data — job.photo_urls) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Photos</Text>
            {job.photo_urls.length ? job.photo_urls.map((uri, index) => (
              <Tap key={uri} onPress={() => setPhotoIndex(index)}
                accessibilityLabel={`Open job photo ${index + 1}`}>
                <Image source={{ uri }} resizeMode="contain" accessibilityLabel={`Job photo ${index + 1}`}
                  style={{ width: '100%', height: 240, marginTop: 12 }} />
              </Tap>
            )) : <Text style={styles.detailValue}>No photos attached</Text>}

          </View>

          {/* My proposal status (real data, not fabricated) */}
          {myApplication && !isAssignedToMe && (
            <View style={styles.trustNote}>
              <Text style={styles.trustNoteText}>
                <Text style={{ fontWeight: '800' }}>Your proposal</Text>
                {myApplication.status === 'pending' && ' · Waiting for the client to choose a provider.'}
                {myApplication.status === 'rejected' && ' · The client selected another provider.'}
                {myApplication.status === 'accepted' && ' · You were hired for this job.'}
                {myApplication.status === 'withdrawn' && ' · You withdrew this proposal.'}
              </Text>
            </View>
          )}

          {/* Actions — matches .detail-action-bar */}
          <View style={styles.actionBar}>
            {!!actionError && !proposalOpen && !declineOpen && (
              <Text style={styles.actionError}>{actionError}</Text>
            )}

            {isConfirmed && (
              <Tap
                style={styles.primaryBtn}
                onPress={() => runAction(() => api.startJob(job.id))}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{busy ? 'Starting…' : 'Start Job'}</Text>
              </Tap>
            )}

            {isWorking && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>{tasks.length > 0 && doneCount === tasks.length ? 'Waiting for client to confirm completion' : 'Work in progress — complete the task checklist'}</Text>
              </View>
            )}
            {isAssignedToMe && dispute?.status === 'open' && <Text style={styles.lockedBtnText}>{dispute.cancellation_state === 'pending' ? 'Cancellation awaiting your response' : dispute.escrow_transactions?.status === 'disputed' ? 'Payment under admin review' : 'Complaint awaiting admin review'}</Text>}
            {isAssignedToMe && (isCancelled || isConfirmed || isWorking || (isDone && withinWarranty) || dispute) && (
              <Tap style={styles.outlineBtn}
                onPress={() => onNavigate(dispute ? 'Dispute Status' : 'Dispute Filing', job.id)}>
                <Text style={styles.outlineBtnText}>{dispute ? 'View Dispute Status' : 'File a Complaint'}</Text>
              </Tap>
            )}
            {isDone && job.warranty_expires_at && (
              <Text style={styles.lockedBtnText}>Warranty ends {new Date(job.warranty_expires_at).toLocaleString()}.</Text>
            )}
            {isDone && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>Job Completed</Text>
              </View>
            )}
            {isCancelled && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>Booking Cancelled</Text>
              </View>
            )}

            {!isAssignedToMe && myApplication && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>
                  {myApplication.status === 'pending' ? 'Proposal Pending' : myApplication.status === 'rejected' ? 'Not Selected' : 'Proposal ' + myApplication.status}
                </Text>
              </View>
            )}
            {!isAssignedToMe && !myApplication && canApply && !isVerified && (
              <Tap style={styles.primaryBtn} onPress={() => onNavigate('Verification')} activeOpacity={0.85}>
                <View style={styles.primaryBtnContent}>
                  <ShieldCheck size={18} color={C.onPrimary} />
                  <Text style={styles.primaryBtnText}>Verify to Apply</Text>
                </View>
              </Tap>
            )}
            {!isAssignedToMe && !myApplication && canApply && isVerified && (
              <Tap
                style={styles.primaryBtn}
                onPress={() => {
                  setActionError(null);
                  setProposalOpen(true);
                }}
                activeOpacity={0.85}
                disabled={busy}
                testID="btn-submit-proposal"
              >
                <Text style={styles.primaryBtnText}>Submit Proposal</Text>
              </Tap>
            )}
            {!isAssignedToMe && !myApplication && !canApply && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>Job unavailable</Text>
              </View>
            )}

            {isAssignedToMe && (
              <Tap style={styles.outlineBtn} onPress={() => onNavigate('Chat', job.id)} activeOpacity={0.85}>
                <View style={styles.primaryBtnContent}>
                  <MessageCircle size={17} color={C.ink700} />
                  <Text style={styles.outlineBtnText}>Message Client</Text>
                </View>
              </Tap>
            )}

            {isConfirmed && (
              <Tap
                style={styles.outlineDangerBtn}
                onPress={() => setDeclineOpen(true)}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.outlineDangerBtnText}>Decline Booking</Text>
              </Tap>
            )}
          </View>

          <View style={{ height: 10 }} />
        </ScrollView>
      )}

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
    </View>
  );
}

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
    headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 4 },
    stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30, paddingHorizontal: Spacing.screenH },

    hero: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
    kicker: { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.9, fontWeight: '800', color: V6Colors.link, marginBottom: 8, fontFamily: 'Inter' },
    heroTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
    heroTitle: { flex: 1, fontSize: 21.5, lineHeight: 25, letterSpacing: -0.5, color: C.ink900, fontWeight: '700', fontFamily: 'Inter' },
    heroPrice: { fontSize: 21.5, fontWeight: '800', color: C.ink900, fontFamily: 'Inter' },
    urgentTag: { color: V6Colors.dangerText, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginTop: 8, fontFamily: 'Inter' },
    factsGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
    fact: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: V6Colors.wellBg, borderRadius: 12 },
    factLabel: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter' },
    factValue: { fontSize: 13.5, color: C.ink800, fontWeight: '700', fontFamily: 'Inter', marginTop: 1 },
    factSub: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter', marginTop: 2 },

    section: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
    sectionTitle: { fontSize: 14, color: C.ink900, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12 },
    // The row already spaces itself; the shared title keeps its own margin for
    // the sections that use it alone.
    sectionTitleInline: { marginBottom: 0 },
    descText: { fontSize: 14, lineHeight: 21, color: C.ink700, fontFamily: 'Inter' },

    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    progressTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: C.ink100, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: 999, backgroundColor: C.cyan700 },
    progressText: { fontSize: 13, fontWeight: '800', color: C.ink900, fontFamily: 'Inter' },
    progressHint: { fontSize: 12, lineHeight: 16, color: C.ink400, fontFamily: 'Inter', marginTop: 8 },

    taskRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
    taskBox: {
      width: 22, height: 22, borderRadius: 7,
      borderWidth: 1.5, borderColor: V6Colors.ink200,
      alignItems: 'center', justifyContent: 'center',
    },
    taskBoxDone: { backgroundColor: C.cyan700, borderColor: C.cyan700 },
    taskBoxLocked: { backgroundColor: C.ink50, borderColor: C.ink200 },
    taskLabel: { flex: 1, fontSize: 14, lineHeight: 19, color: C.ink800, fontFamily: 'Inter' },
    taskLabelDone: { color: C.ink400, textDecorationLine: 'line-through' },

    detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    detailIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: V6Colors.wellBg, alignItems: 'center', justifyContent: 'center' },
    detailLabel: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter', marginBottom: 2 },
    detailValue: { fontSize: 13.5, color: C.ink800, fontWeight: '600', fontFamily: 'Inter' },

    trustNote: {
      flexDirection: 'row', gap: 9, alignItems: 'flex-start',
      backgroundColor: V6Colors.infoSurface, borderWidth: 1, borderColor: V6Colors.infoSurface,
      borderRadius: 13, padding: 12, marginTop: 14,
    },
    trustNoteText: { flex: 1, color: V6Colors.link, fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },

    actionBar: { paddingTop: 16, paddingBottom: 10, gap: 10 },
    actionError: { color: V6Colors.dangerText, fontSize: 13.5, fontFamily: 'Inter', textAlign: 'center' },
    primaryBtn: { backgroundColor: C.cyan700, borderRadius: 16, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
    primaryBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    primaryBtnText: { color: C.onPrimary, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
    outlineBtn: { borderWidth: 1, borderColor: V6Colors.fieldBorder, borderRadius: 16, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
    outlineBtnText: { color: C.ink800, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
    outlineDangerBtn: { borderWidth: 1, borderColor: V6Colors.dangerBorder, backgroundColor: V6Colors.dangerSurface, borderRadius: 16, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
    outlineDangerBtnText: { color: V6Colors.dangerText, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
    lockedBtn: { backgroundColor: C.ink100, borderRadius: 16, minHeight: 52, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center' },
    lockedBtnText: { color: C.ink700, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' },
  });
  return { Colors, V6Colors, C, styles };
}
