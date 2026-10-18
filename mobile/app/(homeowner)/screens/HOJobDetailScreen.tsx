/**
 * HOJobDetailScreen.tsx
 *
 * One job from the homeowner's side. The status card says what is happening
 * now, the progress step shows how far the job got, and one main button does
 * the next thing. Rare or risky actions (report a problem, cancel) sit in the ⋮
 * menu. Which card, step and buttons show is decided in src/lib/jobDetailView.ts.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CalendarClock,
  CircleX,
  ClipboardList,
  EllipsisVertical,
  FileText,
  MapPin,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react-native';
import PhotoViewer from '../../../src/components/PhotoViewer';
import PhotoStrip from '../../../src/components/PhotoStrip';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import Banner from '../../../src/components/ui/Banner';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import RefreshBar from '../../../src/components/ui/RefreshBar';
import EmptyCard from '../../../src/components/ui/EmptyCard';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import EmptyRow from '../../../src/components/ui/EmptyRow';
import MenuSheet, { type MenuSheetItem } from '../../../src/components/ui/MenuSheet';
import PersonCard from '../../../src/components/ui/PersonCard';
import ProgressStepper from '../../../src/components/ui/ProgressStepper';
import SectionHeader from '../../../src/components/ui/SectionHeader';
import StatusCard from '../../../src/components/ui/StatusCard';
import Tap from '../../../src/components/ui/Tap';
import { showToast } from '../../../src/components/Toast';
import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { HOScreen } from '../../../src/types/navigation';
import { api, ApiError, type Job, type JobApplication, type JobChangeRequest, type ProviderCard } from '../../../src/lib/api';
import ScheduleChangeCard from '../../../src/components/ScheduleChangeCard';
import ScheduleChangeSheet from '../../../src/components/ScheduleChangeSheet';
import { canProposeScheduleChange, pendingScheduleChange } from '../../../src/lib/scheduleChange';
import { findProvidersFailureMessage } from '../../../src/lib/findProvidersFailure';
import { homeownerJobView, showsChecklist, type Action, type JobView } from '../../../src/lib/jobDetailView';
import { countPendingProposals, isOpenJob } from '../../../src/lib/proposalCounts';
import {
  distanceLabel,
  friendlyError,
  peso,
  plural,
  shortDate,
  timeAgo,
  timeOfDay,
  urgencyMeta,
} from '../../../src/lib/format';

function acceptedDistanceKm(job: Job): number | null {
  if (job.provider_accept_latitude == null || job.provider_accept_longitude == null) return null;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(job.provider_accept_latitude - job.latitude);
  const longitudeDelta = toRadians(job.provider_accept_longitude - job.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(job.latitude)) * Math.cos(toRadians(job.provider_accept_latitude)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Shown under the cancel row: cancelling after a hire is not an instant refund. */
const CANCEL_HINT = 'Cancelling after hiring asks the provider to agree. Your money comes back once they do.';
const HIT_SLOP = { top: 2, bottom: 2, left: 2, right: 2 };
/** Under the waiting card on an open job with no offers: the backend also invites matches on its own. */
const AUTO_INVITE_HINT = 'We also invite matched providers automatically if nobody applies soon.';
/** Said when a tap lands while the last action on this job is still running. */
const BUSY_MESSAGE = 'Still working on your last request. Please wait.';

/** Button text for an action, in the main slot or as the link under it. */
function actionLabel(action: Action, slot: 'main' | 'link'): string {
  switch (action.kind) {
    case 'reviewProposals': return `Review proposals (${action.count})`;
    case 'findProviders': return slot === 'link' ? 'Find providers near you' : 'Find providers';
    case 'viewOffers': return 'View proposals';
    case 'message': return `Message ${action.name}`;
    case 'confirmDone': return 'Confirm job is done';
    case 'reportProblem': return 'Report a problem';
    case 'viewCase': return 'View case';
    case 'leaveReview': return 'Leave a review';
    case 'postAgain': return 'Post again';
    case 'cancelJob': return 'Cancel job';
    default: return '';
  }
}

/** "4.0 · 2 jobs done", or "New · 0 jobs done" before any rating. */
function ratingText(rating: number | null | undefined, jobsDone: number | null | undefined): string {
  return `${rating != null ? Number(rating).toFixed(1) : 'New'} · ${plural(jobsDone, 'job')} done`;
}

interface HOJobDetailScreenProps {
  jobId: string | null;
  onBack: () => void;
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function HOJobDetailScreen({ jobId, onBack, onNavigate }: HOJobDetailScreenProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [refreshing, setRefreshing] = useState(false);
  // reload() is fire-and-forget, so the spinner is stopped when the fetch itself settles, on success or failure.
  const { data, loading, error, reload } = useAsyncData(async () => {
    try {
      if (!jobId) throw new Error('No job selected.');
      const job = await api.getJob(jobId);
      const provider = job.assigned_provider_id
        ? await api.getProvider(job.assigned_provider_id).catch(() => null)
        : null;
      const dispute = await api.jobDispute(jobId);
      return { job, provider, dispute };
    } finally {
      setRefreshing(false);
    }
  }, [jobId]);
  // Date/time change requests for this job (in memory only). A failed lookup just means no card.
  const { data: changes, reload: reloadChanges } = useAsyncData<JobChangeRequest[]>(
    async () => (jobId ? api.jobChangeRequests(jobId).catch(() => []) : []),
    [jobId],
    `job-changes-${jobId}`,
  );
  const [changeOpen, setChangeOpen] = useState(false);
  const onRefresh = () => {
    setRefreshing(true);
    reload();
    reloadChanges();
  };

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [matchingMessage, setMatchingMessage] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // list is null when the lookup failed, so the count of pending offers is unknown.
  const [offers, setOffers] = useState<{ jobId: string; list: JobApplication[] | null } | null>(null);
  // Checked and set synchronously, so two taps before React re-renders cannot start two actions.
  const inFlight = useRef(false);

  const job = data?.job;
  const provider: ProviderCard | null = data?.provider ?? null;
  const dispute = data?.dispute ?? null;
  const pendingChange = pendingScheduleChange(changes);
  const canChangeDate = !!job && canProposeScheduleChange(job, job.client_id, job.client_id, job.assigned_provider_id, pendingChange);
  const acceptedDistance = job ? acceptedDistanceKm(job) : null;
  // "0 m away" (the provider accepted from the job itself) and an unknown distance add nothing, so the line is left out.
  const acceptedAway = acceptedDistance != null && Math.round(acceptedDistance * 1000) > 0 ? acceptedDistance : null;
  const tasks = [...(job?.job_tasks ?? [])].sort((a, b) => a.position - b.position);
  const doneCount = tasks.filter((t) => t.is_done).length;
  // Checkboxes only once the work is under way or finished; before that the tasks are a plain list.
  const checklist = showsChecklist(job?.status, tasks);

  // Proposals on an open job. Loaded after the job and never blocks the screen:
  // until they arrive the job reads as having none. A failed lookup is kept as
  // unknown (list null), so the card offers the list without claiming a count.
  useEffect(() => {
    const current = data?.job;
    if (!current || !isOpenJob(current)) return;
    let active = true;
    Promise.resolve()
      .then(() => api.jobApplications(current.id))
      .then((list) => {
        if (active) setOffers({ jobId: current.id, list });
      })
      .catch(() => {
        if (active) setOffers({ jobId: current.id, list: null });
      });
    return () => {
      active = false;
    };
  }, [data]);

  const offerEntry = offers && job && offers.jobId === job.id ? offers : null;
  const offerList = offerEntry?.list ?? null;
  const pendingOffers = offerList ? offerList.filter((application) => application.status === 'pending') : [];
  // 0 until the lookup answers; null when it failed, so the count is unknown and no number is shown.
  const pendingCount = offerEntry ? (offerList ? countPendingProposals(offerList) : null) : 0;

  const runAction = async (fn: () => Promise<unknown>) => {
    if (inFlight.current) {
      showToast(BUSY_MESSAGE, 'info');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setActionError(
        e instanceof ApiError ? e.message : 'Something went wrong. Please try again.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const findProviders = async () => {
    if (!job) return;
    if (inFlight.current) {
      showToast(BUSY_MESSAGE, 'info');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    setMatchingMessage(null);
    try {
      const result = await api.triggerRecommendations(job.id);
      setMatchingMessage(
        result.notified > 0
          ? `We invited ${result.notified} matched provider${result.notified === 1 ? '' : 's'} to apply.`
          : 'No providers matched yet. You can try again later while the job remains open.',
      );
      reload();
    } catch (e) {
      setActionError(findProvidersFailureMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const view: JobView | null = job
    ? homeownerJobView({ job, dispute, pendingCount, tasks, provider, now: Date.now() })
    : null;
  const main = view?.main ?? null;
  const link = view?.link ?? null;
  // Said only when the proposals have answered with none. While they load, or when the lookup failed, the offers are unknown.
  const showAutoInviteHint = !!job && isOpenJob(job) && offerList !== null && pendingCount === 0
    && main?.kind === 'findProviders';
  const urgency = job ? urgencyMeta(job.urgency, V6Colors) : null;

  const perform = (action: Action) => {
    if (!job) return;
    // While an action is running, a tap that gets here is a repeat, so say why it did nothing.
    // The ⋮ menu rows are disabled instead, so they stay silent.
    if (inFlight.current) {
      showToast(BUSY_MESSAGE, 'info');
      return;
    }
    switch (action.kind) {
      case 'reviewProposals':
        onNavigate('Job Applications', job.id);
        return;
      case 'findProviders':
        void findProviders();
        return;
      case 'viewOffers':
        onNavigate('Job Applications', job.id);
        return;
      case 'message':
        onNavigate('Chat', job.id);
        return;
      case 'confirmDone':
        setConfirmComplete(true);
        return;
      case 'reportProblem':
        onNavigate('Dispute Filing', job.id);
        return;
      case 'viewCase':
        onNavigate('Dispute Status', job.id);
        return;
      case 'leaveReview':
        onNavigate('Leave Review', job.id);
        return;
      case 'postAgain':
        onNavigate('Create Job', String(action.categoryId));
        return;
      case 'cancelJob':
        setConfirmCancel(true);
        return;
      default:
        // Provider actions never reach this screen.
        return;
    }
  };

  const baseMenuItems: MenuSheetItem[] = (view?.menu ?? []).flatMap((action): MenuSheetItem[] => {
    switch (action.kind) {
      case 'reportProblem':
        return [{ label: 'Report a problem', icon: TriangleAlert, disabled: busy, onPress: () => perform(action) }];
      case 'viewCase':
        return [{ label: 'View case', icon: FileText, disabled: busy, onPress: () => perform(action) }];
      case 'cancelJob':
        return [{
          label: 'Cancel job',
          icon: CircleX,
          tone: 'danger',
          hint: job?.assigned_provider_id ? CANCEL_HINT : undefined,
          disabled: busy,
          onPress: () => perform(action),
        }];
      default:
        return [];
    }
  });

  const menuItems: MenuSheetItem[] = canChangeDate
    ? [{ label: 'Change date or time', icon: CalendarClock, disabled: busy, onPress: () => setChangeOpen(true) }, ...baseMenuItems]
    : baseMenuItems;

  const hasProvider = !!job?.assigned_provider_id;
  const providerHeading = job?.status === 'completed'
    ? 'Done by'
    : job?.status === 'cancelled' ? 'Provider' : 'Your provider';

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap
          style={styles.iconBtn}
          onPress={onBack}
          activeOpacity={0.8}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <Text style={styles.headerTitle} numberOfLines={1}>Job details</Text>
        {menuItems.length > 0 ? (
          <Tap
            style={styles.iconBtn}
            onPress={() => setMenuOpen(true)}
            activeOpacity={0.8}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="More job actions"
          >
            <EllipsisVertical size={20} color={C.ink700} />
          </Tap>
        ) : (
          <View style={styles.iconSpacer} />
        )}
      </View>

      {/* The skeleton only stands in for a job not loaded yet; a reload keeps the job and shows the bar. */}
      {loading && !data && <ContentSkeleton variant="detail" />}
      {!!error && !loading && (
        <View style={styles.loadErrorWrap}>
          <LoadErrorCard title="Couldn't load this job" message={error} onRetry={reload} />
        </View>
      )}

      {job && view && (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={V6Colors.link} colors={[V6Colors.link]} />
          }
        >
          {loading && !!data && <RefreshBar />}
          <View style={styles.titleBlock}>
            <Text style={styles.kicker}>
              {(job.service_categories?.name ?? 'Service').toUpperCase()}
            </Text>
            <Text style={styles.title}>{job.title}</Text>
            <View style={styles.priceRow}>
              {job.budget != null && (
                <Text style={styles.price}>{peso(job.budget)}</Text>
              )}
              {urgency && (
                <View style={[styles.urgencyChip, { backgroundColor: urgency.bg }]}>
                  <Text style={[styles.urgencyText, { color: urgency.color }]}>{urgency.label}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.statusBlock}>
            {view.banner && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${view.banner.text} View case`}
                testID="dispute-banner"
                onPress={() => perform(view.banner!.action)}
                style={styles.disputeBanner}
              >
                <Text style={styles.disputeBannerText}>{view.banner.text}</Text>
                <Text style={styles.disputeBannerLink}>View case</Text>
              </Pressable>
            )}
            {pendingChange && (
              <ScheduleChangeCard
                request={pendingChange}
                userId={job.client_id}
                otherName={provider?.profiles?.full_name}
                onDecided={() => { reload(); reloadChanges(); }}
              />
            )}
            <StatusCard
              tone={view.card.tone}
              overline={view.card.overline}
              title={view.card.title}
              body={view.card.body}
            >
              {job.has_review ? (
                <View style={styles.reviewChip}>
                  <Check size={14} color={V6Colors.successText} strokeWidth={2.6} />
                  <Text style={styles.reviewChipText}>Review submitted</Text>
                </View>
              ) : undefined}
            </StatusCard>
            {showAutoInviteHint && <Text style={styles.muted}>{AUTO_INVITE_HINT}</Text>}
          </View>

          {/* Open jobs: the offers, the best two first. */}
          {isOpenJob(job) && (
            <View style={styles.block}>
              <SectionHeader
                title="Proposals"
                count={pendingCount ? pendingCount : undefined}
                linkLabel="See all"
                onLinkPress={() => onNavigate('Job Applications', job.id)}
              />
              {!!matchingMessage && <Text style={styles.matchingMessage}>{matchingMessage}</Text>}
              {pendingOffers.slice(0, 2).map((application) => (
                <PersonCard
                  key={application.id}
                  name={application.provider?.full_name ?? 'Provider'}
                  avatarUrl={application.provider?.avatar_url}
                  subtitle={ratingText(
                    application.provider?.provider_profiles?.cached_avg_rating,
                    application.provider?.provider_profiles?.cached_completed_jobs,
                  )}
                  rating
                  onPress={() => onNavigate('Job Applications', job.id)}
                />
              ))}
              {offerList !== null && pendingOffers.length === 0 && (
                <EmptyCard>
                  <EmptyRow
                    icon={ClipboardList}
                    title="No proposals yet"
                    body="Providers who apply show up here."
                  />
                </EmptyCard>
              )}
            </View>
          )}

          {view.step && <ProgressStepper step={view.step} />}

          {hasProvider && (
            <View style={styles.block}>
              <SectionHeader title={providerHeading} />
              <PersonCard
                name={provider?.profiles?.full_name?.trim() || 'Your provider'}
                avatarUrl={provider?.profiles?.avatar_url}
                subtitle={provider ? ratingText(provider.cached_avg_rating, provider.cached_completed_jobs) : undefined}
                rating
                onMessage={() => onNavigate('Chat', job.id)}
              />
              {!!job.provider_accept_address && acceptedAway != null && (
                <Text style={styles.acceptedFrom}>
                  Accepted from {job.provider_accept_address}
                  {` · ${distanceLabel(acceptedAway)} from your job`}
                </Text>
              )}
            </View>
          )}

          <View style={styles.infoCard}>
            <InfoRow
              icon={CalendarDays}
              label="When"
              value={job.scheduled_at ? `${shortDate(job.scheduled_at)} · ${timeOfDay(job.scheduled_at)}` : 'Flexible'}
            />
            <View style={styles.divider} />
            <InfoRow icon={MapPin} label="Where" value={job.address} />
          </View>

          <View style={styles.block}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Job Description</Text>
            <Text style={styles.description}>{job.description || 'No description provided.'}</Text>
            <Text style={styles.muted}>Posted {timeAgo(job.posted_at)}</Text>
          </View>

          {/* Read-only for the homeowner: only the provider ticks tasks off. Before the work starts, a plain list. */}
          {tasks.length > 0 && checklist && (
            <View style={styles.block}>
              <View style={styles.rowBetween}>
                <Text style={styles.sectionTitle} accessibilityRole="header">Tasks</Text>
                <Text style={styles.counter}>{doneCount}/{tasks.length} done</Text>
              </View>
              {tasks.map((task) => (
                <View key={task.id}>
                  <View
                    testID={`task-row-${task.id}`}
                    accessible
                    accessibilityRole="checkbox"
                    accessibilityLabel={task.label}
                    accessibilityState={{ checked: task.is_done, disabled: true }}
                    style={styles.taskRow}
                  >
                    <View style={[styles.taskBox, task.is_done && styles.taskBoxDone]}>
                      {task.is_done && <Check size={16} color={C.onPrimary} strokeWidth={3} />}
                    </View>
                    <Text style={[styles.taskLabel, task.is_done && styles.taskLabelDone]}>{task.label}</Text>
                    {task.is_done && <Text style={styles.taskDoneLabel}>Done</Text>}
                  </View>
                  {(task.proof_photo_urls?.length ?? 0) > 0 && (
                    <View style={styles.taskPhotos}>
                      <PhotoStrip urls={task.proof_photo_urls ?? []} label={`Proof for ${task.label}, photo`} testID={`task-proof-${task.id}`} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {tasks.length > 0 && !checklist && (
            <View style={styles.block}>
              <Text style={styles.sectionTitle} accessibilityRole="header">What the job includes</Text>
              {tasks.map((task) => (
                <View key={task.id} testID={`task-item-${task.id}`} style={styles.bulletRow}>
                  <View style={styles.bulletBox}>
                    <View style={styles.bulletDot} />
                  </View>
                  <Text style={styles.taskLabel}>{task.label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* No photos: no heading and no empty block. */}
          {job.photo_urls?.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.sectionTitle} accessibilityRole="header">Job Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentList}>
                {job.photo_urls.map((url, index) => (
                  <Tap
                    key={url}
                    onPress={() => setPhotoIndex(index)}
                    accessibilityRole="button"
                    accessibilityLabel={`Open job photo ${index + 1}`}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: url }} style={styles.attachmentImage} />
                  </Tap>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      )}

      {!!job && !!actionError && (
        <View style={styles.errorWrap}>
          <Banner tone="error" message={friendlyError(actionError)} />
        </View>
      )}

      {!!job && !!main && (
        <BottomActionBar
          primaryLabel={actionLabel(main, 'main')}
          onPrimary={() => perform(main)}
          busy={busy}
          secondaryLabel={link ? actionLabel(link, 'link') : undefined}
          onSecondary={link ? () => perform(link) : undefined}
        />
      )}

      {!!job && (
        <ScheduleChangeSheet
          visible={changeOpen}
          jobId={job.id}
          currentScheduledAt={job.scheduled_at}
          onClose={() => setChangeOpen(false)}
          onSent={() => reloadChanges()}
        />
      )}

      <MenuSheet
        visible={menuOpen}
        title={job?.title ?? ''}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />

      <PhotoViewer photos={(job?.photo_urls ?? []).map(uri => ({ uri }))}
        index={photoIndex} onIndexChange={setPhotoIndex} onClose={() => setPhotoIndex(null)} />

      {/* Cancelling is irreversible and moves money — ask first. */}
      <ConfirmationModal
        visible={confirmCancel}
        title="Cancel this job?"
        message={
          job?.status === 'in_progress' || dispute?.status === 'open'
            ? 'This cancels the job and preserves its history. Any held payment stays frozen for an admin to review before release or refund.'
            : job?.assigned_provider_id
            ? 'This cancels the booking and holds any payment while the provider has 48 hours to agree or contest. Agreement or no response refunds you; a contest goes to admin review.'
            : 'This takes the job down so providers can no longer apply. It cannot be undone.'
        }
        confirmLabel="Cancel Job"
        cancelLabel="Keep Job"
        destructive
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => {
          setConfirmCancel(false);
          if (!job) return;
          void runAction(async () => {
            await api.cancelJob(job.id);
            onBack();
          });
        }}
      />

      {/* Completion releases the payment at once (migration 0060), so it asks first. */}
      <ConfirmationModal
        visible={confirmComplete}
        title="Mark this job complete?"
        message={
          dispute?.status === 'open'
            ? 'This records completion of the work. The disputed payment stays frozen until an admin resolves it.'
            : job && Number(job.budget) > 0
            ? `This confirms you are satisfied with the work and releases ${peso(job.budget!)} to the provider right away. A released payment is final and cannot be refunded, so report any problem before you confirm.`
            : 'This confirms the work is done to your satisfaction. Report any problem before you confirm.'
        }
        confirmLabel="Yes, Mark Complete"
        cancelLabel="Not Yet"
        busy={busy}
        onCancel={() => setConfirmComplete(false)}
        onConfirm={() => {
          setConfirmComplete(false);
          if (!job) return;
          void runAction(() => api.completeJob(job.id));
        }}
      />
    </View>
  );
}

/** One labelled fact in the When / Where card. */
function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  const { C, styles } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.infoRow}>
      <Icon size={18} color={C.ink500} />
      <View style={styles.infoText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
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
      borderBottomWidth: 1, borderBottomColor: C.line,
    },
    iconBtn: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      alignItems: 'center', justifyContent: 'center',
    },
    iconSpacer: { width: 44, height: 44 },
    headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 24, gap: 18 },
    loadErrorWrap: { paddingHorizontal: Spacing.screenH, paddingTop: 16 },

    titleBlock: { gap: 6 },
    kicker: {
      fontFamily: 'Inter', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.9,
      textTransform: 'uppercase', color: Colors.link,
    },
    title: { fontFamily: 'Inter', fontSize: 20, fontWeight: '700', lineHeight: 26, letterSpacing: -0.3, color: C.ink900 },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    price: { fontFamily: 'Inter', fontSize: 18, fontWeight: '700', color: C.ink900 },
    urgencyChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    urgencyText: { fontFamily: 'Inter', fontSize: 12, fontWeight: '700' },

    statusBlock: { gap: 8 },
    disputeBanner: {
      backgroundColor: V6Colors.warningSurface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 2,
    },
    disputeBannerText: { fontFamily: 'Inter', fontSize: 14, lineHeight: 19, color: V6Colors.warningText },
    disputeBannerLink: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', color: V6Colors.warningText, textDecorationLine: 'underline' },
    block: { gap: 10 },
    sectionTitle: { fontFamily: 'Inter', fontSize: 17, fontWeight: '600', color: C.ink900 },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    counter: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', color: C.ink500 },
    matchingMessage: { fontFamily: 'Inter', fontSize: 13.5, lineHeight: 18, color: Colors.link },
    acceptedFrom: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: C.ink500 },
    muted: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: C.ink500 },
    description: { fontFamily: 'Inter', fontSize: 15, lineHeight: 22, color: C.ink700 },

    reviewChip: {
      flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, marginTop: 4,
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: C.surface,
    },
    reviewChipText: { fontFamily: 'Inter', fontSize: 12.5, fontWeight: '700', color: C.successText },

    infoCard: { gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    infoText: { flex: 1, gap: 2 },
    infoLabel: { fontFamily: 'Inter', fontSize: 12, fontWeight: '500', color: C.ink500 },
    infoValue: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: C.ink900 },
    divider: { height: 1, backgroundColor: C.line },

    taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    taskBox: {
      width: 24, height: 24, flexShrink: 0, borderRadius: 6, borderWidth: 1.5, borderColor: C.line,
      alignItems: 'center', justifyContent: 'center',
    },
    taskBoxDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    taskLabel: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: C.ink900 },
    taskLabelDone: { color: C.ink500, textDecorationLine: 'line-through' },
    taskDoneLabel: { fontFamily: 'Inter', fontSize: 12.5, fontWeight: '700', lineHeight: 16, color: C.successText },
    taskPhotos: { marginLeft: 36 },
    bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
    bulletBox: { width: 24, alignItems: 'center' },
    bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.ink500 },

    attachmentList: { gap: 10 },
    attachmentImage: { width: 92, height: 92, borderRadius: 12, backgroundColor: C.ink100 },

    errorWrap: { paddingHorizontal: Spacing.screenH, paddingTop: 10, backgroundColor: C.canvas },
  });
  return { Colors, V6Colors, C, styles };
}
