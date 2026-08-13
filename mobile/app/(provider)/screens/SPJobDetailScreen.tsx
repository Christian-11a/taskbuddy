/**
 * SPJobDetailScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-job-detail screen — a
 * flat white .topbar, a borderless .detail-hero (kicker/title/price/facts,
 * bottom-divider only, not a card), .detail-section blocks, and a sticky
 * action bar whose primary button reflects the real job/application state.
 *
 * The screen has two faces, and which one you get depends on whether this
 * provider has taken the job on:
 *
 *   Claimable — an open job they may propose for, or a booking request a
 *   homeowner has already made to them (status 'assigned'). The checklist is
 *   shown read-only: it is the scope of work being offered, not a to-do list
 *   they own yet. The action bar offers Accept/Decline (a request) or Submit
 *   Proposal (an open job).
 *
 *   In progress — they accepted ('confirmed') or started ('in_progress'). The
 *   same checklist becomes tappable and gains a progress bar, which is the
 *   only progress signal this app has: completion is homeowner-triggered, so
 *   a provider's honest answer to "how far along are you" is which tasks are
 *   ticked.
 *
 * Deviation from the mockup: its 4-state lifecycle has an explicit "Submit for
 * Review" step. This app's backend has no such action — the homeowner marks a
 * job complete — so the in_progress state ends in an informational message
 * rather than a button that would do nothing.
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
import { Sizes, Spacing, V6Colors, V6Radii } from '../../../src/constants/theme';

const C = V6Colors;
import { SPScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, ApiError, Job, JobTask } from '../../../src/lib/api';
import { distanceLabel, peso, shortDate } from '../../../src/lib/format';
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
  const { profile, isVerified } = useAuth();
  const { data: job, loading, error, reload } = useAsyncData(() => {
    if (!jobId) return Promise.reject(new Error('No job selected.'));
    return api.getJob(jobId);
  }, [jobId]);
  const { data: myApps } = useAsyncData(
    () => api.myApplications() as Promise<MyApplication[]>,
    [],
    'sp-applications',
  );
  const myApplication = (myApps ?? []).find((a) => a.jobs.id === jobId);

  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Which checklist row is mid-flight, so only that row shows a spinner.
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);

  const isAssignedToMe = job?.assigned_provider_id === profile?.id;
  /** A homeowner hired them and is waiting for an answer. */
  const isBookingRequest = isAssignedToMe && job?.status === 'assigned';
  const isConfirmed = isAssignedToMe && job?.status === 'confirmed';
  const isWorking = isAssignedToMe && job?.status === 'in_progress';
  const isDone = isAssignedToMe && job?.status === 'completed';
  const canApply = job && ['open', 'recommending'].includes(job.status) && !isAssignedToMe && !myApplication;
  const urgent = job?.urgency === 'urgent';

  const tasks = sortedTasks(job);
  const doneCount = tasks.filter((t) => t.is_done).length;
  const progressPct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  // Ticking is only meaningful once the job is theirs and not yet closed.
  const tasksEditable = isConfirmed || isWorking;

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
    if (isBookingRequest) return 'BOOKING REQUEST';
    if (isConfirmed) return 'CONFIRMED BOOKING';
    if (isWorking) return 'WORK IN PROGRESS';
    if (isDone) return 'COMPLETED JOB';
    return `${(job?.service_categories?.name ?? 'JOB').toUpperCase()} OPPORTUNITY`;
  };

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Details</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 40 }} color={C.cyan700} />}
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
                  <Text style={styles.factValue} numberOfLines={1}>{job.address}</Text>
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

          {/* A booking request is a decision waiting to be made — say so before
              the details, not after them. */}
          {isBookingRequest && (
            <View style={styles.requestNote}>
              <Text style={styles.requestNoteText}>
                <Text style={{ fontWeight: '800' }}>You've been hired for this job.</Text>{' '}
                Accept to confirm the booking with the homeowner, or decline and tell
                them why so they can find someone else.
              </Text>
            </View>
          )}

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
                  ? 'All tasks done — the homeowner confirms completion from their side.'
                  : 'Tick tasks off as you finish them. The homeowner sees this update.'}
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
                <TouchableOpacity
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
                      task.is_done && <Check size={14} color={C.white} strokeWidth={3} />
                    )}
                  </View>
                  <Text style={[styles.taskLabel, task.is_done && styles.taskLabelDone]}>
                    {task.label}
                  </Text>
                </TouchableOpacity>
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
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <ImageIcon size={17} color={C.ink500} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Attached</Text>
                <Text style={styles.detailValue}>{job.photo_urls?.length ?? 0} photo(s)</Text>
              </View>
            </View>
          </View>

          {/* My proposal status (real data, not fabricated) */}
          {myApplication && !isAssignedToMe && (
            <View style={styles.trustNote}>
              <Text style={styles.trustNoteText}>
                <Text style={{ fontWeight: '800' }}>Your proposal</Text>
                {myApplication.status === 'pending' && ' · Waiting for the homeowner to choose a provider.'}
                {myApplication.status === 'rejected' && ' · The homeowner selected another provider.'}
                {myApplication.status === 'accepted' && ' · You were hired for this job.'}
                {myApplication.status === 'withdrawn' && ' · You withdrew this proposal.'}
              </Text>
            </View>
          )}

          {/* Actions — matches .detail-action-bar */}
          <View style={styles.actionBar}>
            {!!actionError && <Text style={styles.actionError}>{actionError}</Text>}

            {isBookingRequest && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => runAction(() => api.acceptJob(job.id))}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{busy ? 'Accepting…' : 'Accept Booking'}</Text>
              </TouchableOpacity>
            )}

            {isConfirmed && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => runAction(() => api.startJob(job.id))}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{busy ? 'Starting…' : 'Start Job'}</Text>
              </TouchableOpacity>
            )}

            {isWorking && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>Waiting for homeowner to confirm completion</Text>
              </View>
            )}
            {isDone && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>Job Completed</Text>
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
              <TouchableOpacity style={styles.primaryBtn} onPress={() => onNavigate('Verification')} activeOpacity={0.85}>
                <View style={styles.primaryBtnContent}>
                  <ShieldCheck size={18} color={C.white} />
                  <Text style={styles.primaryBtnText}>Verify to Apply</Text>
                </View>
              </TouchableOpacity>
            )}
            {!isAssignedToMe && !myApplication && canApply && isVerified && (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => runAction(() => api.applyToJob(job.id))}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.primaryBtnText}>{busy ? 'Sending…' : 'Submit Proposal'}</Text>
              </TouchableOpacity>
            )}
            {!isAssignedToMe && !myApplication && !canApply && (
              <View style={styles.lockedBtn}>
                <Text style={styles.lockedBtnText}>Job unavailable</Text>
              </View>
            )}

            {isAssignedToMe && (
              <TouchableOpacity style={styles.outlineBtn} onPress={() => onNavigate('Chat', job.id)} activeOpacity={0.85}>
                <View style={styles.primaryBtnContent}>
                  <MessageCircle size={17} color={C.ink700} />
                  <Text style={styles.outlineBtnText}>Message Homeowner</Text>
                </View>
              </TouchableOpacity>
            )}

            {(isBookingRequest || isConfirmed) && (
              <TouchableOpacity
                style={styles.outlineDangerBtn}
                onPress={() => setDeclineOpen(true)}
                activeOpacity={0.85}
                disabled={busy}
              >
                <Text style={styles.outlineDangerBtnText}>Decline Booking</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ height: 10 }} />
        </ScrollView>
      )}

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
  headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 4 },
  stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30, paddingHorizontal: Spacing.screenH },

  hero: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  kicker: { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.9, fontWeight: '800', color: C.cyan700, marginBottom: 8, fontFamily: 'Inter' },
  heroTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  heroTitle: { flex: 1, fontSize: 21.5, lineHeight: 25, letterSpacing: -0.5, color: C.ink900, fontWeight: '700', fontFamily: 'Inter' },
  heroPrice: { fontSize: 21.5, fontWeight: '800', color: C.ink900, fontFamily: 'Inter' },
  urgentTag: { color: '#b91c1c', fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginTop: 8, fontFamily: 'Inter' },
  factsGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
  fact: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: '#f5f8fa', borderRadius: 12 },
  factLabel: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter' },
  factValue: { fontSize: 13.5, color: C.ink800, fontWeight: '700', fontFamily: 'Inter', marginTop: 1 },
  factSub: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter', marginTop: 2 },

  requestNote: {
    backgroundColor: '#f2fbfd', borderWidth: 1, borderColor: C.cyan100,
    borderRadius: 14, padding: 13, marginTop: 16,
  },
  requestNoteText: { color: C.cyan800, fontSize: 12.5, lineHeight: 17, fontFamily: 'Inter' },

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
    borderWidth: 1.5, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  taskBoxDone: { backgroundColor: C.cyan700, borderColor: C.cyan700 },
  taskBoxLocked: { backgroundColor: C.ink50, borderColor: C.ink200 },
  taskLabel: { flex: 1, fontSize: 14, lineHeight: 19, color: C.ink800, fontFamily: 'Inter' },
  taskLabelDone: { color: C.ink400, textDecorationLine: 'line-through' },

  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#f6f8fa', alignItems: 'center', justifyContent: 'center' },
  detailLabel: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter', marginBottom: 2 },
  detailValue: { fontSize: 13.5, color: C.ink800, fontWeight: '600', fontFamily: 'Inter' },

  trustNote: {
    flexDirection: 'row', gap: 9, alignItems: 'flex-start',
    backgroundColor: '#f5fbfc', borderWidth: 1, borderColor: '#d8f0f4',
    borderRadius: 13, padding: 12, marginTop: 14,
  },
  trustNoteText: { flex: 1, color: C.cyan800, fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },

  actionBar: { paddingTop: 16, paddingBottom: 10, gap: 8 },
  actionError: { color: '#ef4444', fontSize: 13.5, fontFamily: 'Inter', textAlign: 'center' },
  primaryBtn: { backgroundColor: C.cyan700, borderRadius: V6Radii.btn, paddingVertical: 14, alignItems: 'center' },
  primaryBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtnText: { color: C.white, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  outlineBtn: { borderWidth: 1, borderColor: '#dce3e9', borderRadius: V6Radii.btn, paddingVertical: 14, alignItems: 'center' },
  outlineBtnText: { color: C.ink700, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  outlineDangerBtn: { borderWidth: 1, borderColor: '#ef4444', borderRadius: V6Radii.btn, paddingVertical: 14, alignItems: 'center' },
  outlineDangerBtnText: { color: '#ef4444', fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  lockedBtn: { backgroundColor: C.ink100, borderRadius: V6Radii.btn, paddingVertical: 14, alignItems: 'center' },
  lockedBtnText: { color: C.ink400, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' },
});
