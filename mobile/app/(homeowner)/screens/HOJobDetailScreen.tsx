/**
 * HOJobDetailScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-job-detail screen — a
 * flat white .topbar (not a colored hero), then a borderless "hero" block
 * with kicker/title/price/facts separated by hairline dividers (not a
 * card-per-section stack), a horizontal step timeline, and a sticky bottom
 * action bar.
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
import Silhouette from '../../../src/components/ui/Silhouette';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleAlert,
  ListChecks,
  MapPin,
  MessageCircle,
  Star,
  TriangleAlert,
  Wrench,
} from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { HOScreen } from '../../../src/types/navigation';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, ApiError, type Job } from '../../../src/lib/api';
import { distanceLabel, friendlyError, jobStatusMeta, peso, plural, shortDate, timeAgo, timeOfDay, urgencyMeta } from '../../../src/lib/format';
import ConfirmationModal from '../../../src/components/ConfirmationModal';

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

/**
 * The real lifecycle, in the homeowner's words. The mockup's "Review" stage
 * is dropped — there is no such state in the backend; a job goes from work in
 * progress straight to the homeowner marking it complete.
 */
const JOB_STAGES = ['Posted', 'Hired', 'Confirmed', 'In Progress', 'Done'];

function stageIndex(status: string): number {
  switch (status) {
    case 'open':
    case 'recommending':
      return 0;
    case 'assigned':
      return 1;
    case 'confirmed':
      return 2;
    case 'in_progress':
      return 3;
    case 'completed':
      return 4;
    default:
      return 0;
  }
}

interface HOJobDetailScreenProps {
  jobId: string | null;
  onBack: () => void;
  onNavigate: (screen: HOScreen, jobId?: string) => void;
}

export default function HOJobDetailScreen({ jobId, onBack, onNavigate }: HOJobDetailScreenProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { data, loading, error, reload } = useAsyncData(async () => {
    if (!jobId) throw new Error('No job selected.');
    const job = await api.getJob(jobId);
    const provider = job.assigned_provider_id
      ? await api.getProvider(job.assigned_provider_id).catch(() => null)
      : null;
    const dispute = await api.jobDispute(jobId);
    return { job, provider, dispute };
  }, [jobId]);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [matchingMessage, setMatchingMessage] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);

  const job = data?.job;
  const acceptedDistance = job ? acceptedDistanceKm(job) : null;
  const provider = data?.provider;
  const dispute = data?.dispute;
  const meta = job ? jobStatusMeta(job.status, V6Colors) : null;
  const stage = job ? stageIndex(job.status) : 0;
  const tasks = [...(job?.job_tasks ?? [])].sort((a, b) => a.position - b.position);
  const doneCount = tasks.filter((t) => t.is_done).length;

  const runAction = async (fn: () => Promise<unknown>) => {
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
      setBusy(false);
    }
  };

  const findProviders = async () => {
    if (!job) return;
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
      setActionError(
        e instanceof ApiError ? e.message : 'Could not look for providers. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  const canCancel =
    job &&
    ['open', 'recommending', 'assigned', 'confirmed', 'in_progress'].includes(job.status);
  const canDispute = job && !!job.assigned_provider_id && (
    ['assigned', 'confirmed', 'in_progress', 'cancelled'].includes(job.status) ||
    (job.status === 'completed' && job.warranty_expires_at && Date.now() < new Date(job.warranty_expires_at).getTime())
  );
  const canComplete = job?.status === 'in_progress' && tasks.every((task) => task.is_done);
  const canReview =
    job?.status === 'completed' &&
    !!job.assigned_provider_id &&
    !job.has_review;
  const canFindProviders = job && ['open', 'recommending'].includes(job.status);

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a colored hero) */}
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
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — matches .detail-hero (borderless, bottom-divider only) */}
          <View style={styles.hero}>
            <Text style={styles.kicker}>
              {(job.service_categories?.name ?? 'Service').toUpperCase()}
            </Text>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>{job.title}</Text>
              {meta && (
                <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              )}
            </View>
            {job.budget != null && (
              <Text style={styles.heroPrice}>₱{Number(job.budget).toLocaleString()}</Text>
            )}
          </View>

          {/* Details — kept together as the first information grid after the hero. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Details</Text>
            <View style={styles.detailsGrid}>
              {[
                {
                  icon: CalendarDays,
                  label: 'Schedule',
                  value: job.scheduled_at
                    ? `${shortDate(job.scheduled_at)} · ${timeOfDay(job.scheduled_at)}`
                    : 'Flexible',
                  wide: false,
                },
                {
                  icon: TriangleAlert,
                  label: 'Urgency',
                  value: urgencyMeta(job.urgency, V6Colors).label,
                  color: urgencyMeta(job.urgency, V6Colors).color,
                  wide: false,
                },
                { icon: MapPin, label: 'Location', value: job.address, wide: true },
                { icon: Wrench, label: 'Service', value: job.service_categories?.name ?? '—', wide: false },
                { icon: CalendarDays, label: 'Posted', value: timeAgo(job.posted_at), wide: false },
              ].map((item) => (
                <View key={item.label} style={[styles.detailRow, item.wide && styles.detailRowWide]}>
                  <View style={styles.detailIcon}>
                    <item.icon size={17} color={item.color ?? C.ink500} />
                  </View>
                  <View style={styles.detailText}>
                    <Text style={styles.detailLabel}>{item.label}</Text>
                    <Text style={[styles.detailValue, item.color && { color: item.color }]} numberOfLines={item.wide ? 3 : 2}>
                      {item.value}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Job progress — this stays in the document while the action bar is docked below. */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Progress</Text>
            <View style={styles.timeline}>
              <View style={styles.timelineLine} />
              {JOB_STAGES.map((label, i) => (
                <View key={label} style={styles.timelineStep}>
                  <View style={[
                    styles.timelineDot,
                    // The last step is "Done": once reached it is complete, not "current".
                    (i < stage || (i === stage && i === JOB_STAGES.length - 1)) && styles.timelineDotDone,
                    i === stage && i < JOB_STAGES.length - 1 && styles.timelineDotCurrent,
                  ]} />
                  <Text style={[styles.timelineLabel, i <= stage && styles.timelineLabelDone]}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Description</Text>
            <Text style={styles.descText}>{job.description || 'No description provided.'}</Text>
          </View>

          {/* Task list — what was asked for, and how much of it the provider
              has ticked off. Read-only here: only the provider can change it. */}
          {tasks.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <ListChecks size={16} color={C.ink900} />
                <Text style={styles.sectionTitleInline}>Tasks</Text>
                <Text style={styles.taskCounter}>{doneCount}/{tasks.length} done</Text>
              </View>
              {tasks.map((task) => (
                <View key={task.id} style={styles.taskRow}>
                  <View style={[styles.taskBox, task.is_done && styles.taskBoxDone]}>
                    {task.is_done && <Check size={13} color={C.onPrimary} strokeWidth={3} />}
                  </View>
                  <Text style={[styles.taskLabel, task.is_done && styles.taskLabelDone]}>
                    {task.label}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job Photos</Text>
            {job.photo_urls?.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentList}>
                {job.photo_urls.map((url, index) => (
                  <Tap key={url} onPress={() => setPhotoIndex(index)} accessibilityLabel={`Open job photo ${index + 1}`} activeOpacity={0.85}>
                    <Image source={{ uri: url }} style={styles.attachmentImage} />
                  </Tap>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.emptyAttachmentText}>No photos were added to this job.</Text>
            )}
          </View>

          {/* Hired provider */}
          {provider ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Service Provider</Text>
              <View style={styles.providerCard}>
                <View style={styles.providerAvatar}>
                  <Silhouette name={provider.profiles?.full_name} textStyle={styles.providerAvatarText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.providerName}>{provider.profiles?.full_name ?? 'Provider'}</Text>
                  <View style={styles.providerRatingRow}>
                    <Star size={12} color={C.ink400} fill={C.ink400} />
                    <Text style={styles.providerRating}>
                      {provider.cached_avg_rating != null
                        ? `${Number(provider.cached_avg_rating).toFixed(1)} · `
                        : 'New · '}
                      {plural(provider.cached_completed_jobs, 'job')} completed
                    </Text>
                  </View>
                </View>
                <Tap
                  style={styles.messageBtn}
                  onPress={() => onNavigate('Chat', job.id)}
                  activeOpacity={0.8}
                >
                  <MessageCircle size={15} color={C.ink700} />
                  <Text style={styles.messageBtnText}>Message</Text>
                </Tap>
              </View>

              {job.provider_accept_address && (
                <Text style={styles.acceptedFrom}>
                  Accepted from {job.provider_accept_address}
                  {acceptedDistance != null ? ` · ${distanceLabel(acceptedDistance)} from your job` : ''}
                </Text>
              )}

            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Service Provider</Text>
              <Text style={[styles.detailValue, styles.providerNotice]}>
                No provider assigned yet. You'll be notified when someone is matched.
              </Text>
              {!!matchingMessage && <Text style={styles.matchingMessage}>{matchingMessage}</Text>}
              {['open', 'recommending'].includes(job.status) && (
              <Tap
                style={styles.primaryBtn}
                onPress={() => onNavigate('Job Applications', job.id)}
                activeOpacity={0.85}
                testID="job-detail-view-offers"
              >
                <Text style={styles.primaryBtnText}>View Offers</Text>
              </Tap>
              )}
            </View>
          )}

          {/* Related links — real app functionality, kept as flat rows */}
          {(canReview || job.has_review) && (
            <View style={styles.section}>
              {/* Only offered once there is something to review. The row used to
                  show on every job, including ones with no provider yet, where
                  POST /jobs/:id/review can only come back as an error. */}
              {canReview && (
                <Tap
                  style={styles.reviewBtn}
                  onPress={() => onNavigate('Leave Review', job.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  scale
                >
                  <Star size={18} color={C.onPrimary} fill={C.onPrimary} />
                  <Text style={styles.reviewBtnText}>Leave Review</Text>
                </Tap>
              )}
              {job.has_review && (
                <View style={styles.reviewDone}>
                  <Check size={18} color={V6Colors.successText} strokeWidth={2.5} />
                  <Text style={styles.reviewDoneText}>Review submitted</Text>
                </View>
              )}
            </View>
          )}

          <View style={{ height: 18 }} />
        </ScrollView>
      )}

      {job && (
        <View style={styles.actionBar}>
          {!!actionError && <Text style={styles.actionError}>{friendlyError(actionError)}</Text>}
          {canComplete && (
            <Tap style={styles.primaryBtn} onPress={() => setConfirmComplete(true)} activeOpacity={0.85} disabled={busy}>
              <Text style={styles.primaryBtnText}>{busy ? 'Working…' : 'Confirm Completion'}</Text>
            </Tap>
          )}
          {canFindProviders && (
            <Tap style={styles.primaryBtn} onPress={() => void findProviders()} activeOpacity={0.85} disabled={busy}>
              <Text style={styles.primaryBtnText}>{busy ? 'Looking…' : 'Find Providers'}</Text>
            </Tap>
          )}
          {job.status === 'completed' && job.warranty_expires_at && (
            <Text style={styles.barNote}>Warranty ends {new Date(job.warranty_expires_at).toLocaleString()}.</Text>
          )}
          {dispute?.status === 'open' && <Text style={styles.barNote}>{dispute.cancellation_state === 'pending' ? 'Cancellation awaiting provider response' : dispute.escrow_transactions?.status === 'disputed' ? 'Payment under admin review' : 'Complaint awaiting admin review'}</Text>}
          {/* Secondary actions share one row so the primary action stays the
              clear first choice; only cancelling is styled as destructive. */}
          {(canCancel || dispute || canDispute) && (
            <View style={styles.secondaryRow}>
              {canCancel && (
                <Tap style={[styles.outlineDangerBtn, styles.secondaryBtn]} onPress={() => setConfirmCancel(true)} activeOpacity={0.85} disabled={busy}>
                  <View style={styles.outlineBtnContent}>
                    <CircleAlert size={17} color={V6Colors.dangerText} />
                    <Text style={styles.outlineDangerBtnText} numberOfLines={1}>Cancel Job</Text>
                  </View>
                </Tap>
              )}
              {(dispute || canDispute) && (
                <Tap style={[styles.outlineBtn, styles.secondaryBtn]} onPress={() => onNavigate(dispute ? 'Dispute Status' : 'Dispute Filing', job.id)} activeOpacity={0.85}>
                  <Text style={styles.outlineBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>{dispute ? 'View Dispute Status' : 'File a Complaint'}</Text>
                </Tap>
              )}
            </View>
          )}
        </View>
      )}

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
            ? 'This cancels the booking and holds any payment while the provider has 48 hours to agree or contest. Agreement or no response refunds the client; a contest goes to admin review.'
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

      {/* Completion starts the three-day warranty before payment release. */}
      <ConfirmationModal
        visible={confirmComplete}
        title="Mark this job complete?"
        message={
          dispute?.status === 'open'
            ? 'This records completion of the work. The disputed payment stays frozen until an admin resolves it.'
            : job && Number(job.budget) > 0
            ? `This starts the three-day warranty. ${peso(job.budget!)} stays held until it ends. A complaint filed during the warranty freezes payment for admin review.`
            : 'This records completion and starts the three-day warranty. You can file a complaint during this period.'
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
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 4, paddingBottom: 12 },
    stateText: { color: C.ink500, fontSize: 16.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 30, paddingHorizontal: Spacing.screenH },

    // Hero
    hero: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
    kicker: { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.9, fontWeight: '800', color: V6Colors.link, marginBottom: 8, fontFamily: 'Inter' },
    heroTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    heroTitle: { flex: 1, fontSize: 21.5, lineHeight: 25, letterSpacing: -0.5, color: C.ink900, fontWeight: '700', fontFamily: 'Inter' },
    statusBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
    statusBadgeText: { fontSize: 12.5, fontWeight: '700', fontFamily: 'Inter' },
    heroPrice: { fontSize: 26, fontWeight: '800', letterSpacing: -0.7, color: C.ink900, marginTop: 16, fontFamily: 'Inter' },
    factsGrid: { flexDirection: 'row', gap: 8, marginTop: 14 },
    fact: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: V6Colors.wellBg, borderRadius: 12 },
    factLabel: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter' },
    factValue: { fontSize: 13.5, color: C.ink800, fontWeight: '700', fontFamily: 'Inter', marginTop: 1 },

    // Sections — borderless, bottom-divider only
    section: { paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: C.line },
    sectionTitle: { fontSize: 16, color: C.ink900, fontWeight: '800', fontFamily: 'Inter', marginBottom: 12 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
    sectionTitleInline: { flex: 1, fontSize: 16, color: C.ink900, fontWeight: '800', fontFamily: 'Inter' },
    taskCounter: { fontSize: 12, color: C.ink400, fontWeight: '700', fontFamily: 'Inter' },
    taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
    taskBox: {
      width: 20, height: 20, borderRadius: 6,
      borderWidth: 1.5, borderColor: V6Colors.ink200,
      alignItems: 'center', justifyContent: 'center',
    },
    taskBoxDone: { backgroundColor: C.cyan700, borderColor: C.cyan700 },
    taskLabel: { flex: 1, fontSize: 13.5, lineHeight: 18, color: C.ink800, fontFamily: 'Inter' },
    taskLabelDone: { color: C.ink400, textDecorationLine: 'line-through' },
    actionError: { color: V6Colors.dangerText, fontSize: 13.5, fontFamily: 'Inter', textAlign: 'center' },
    matchingMessage: { color: V6Colors.link, fontSize: 13.5, fontFamily: 'Inter', textAlign: 'center', lineHeight: 18, marginBottom: 16 },
    descText: { fontSize: 15, lineHeight: 22, color: C.ink700, fontFamily: 'Inter' },
    attachmentList: { gap: 10 },
    attachmentImage: { width: 92, height: 92, borderRadius: 10, backgroundColor: C.ink100 },
    emptyAttachmentText: { color: C.ink500, fontSize: 13.5, fontFamily: 'Inter' },

    // Horizontal timeline
    timeline: { flexDirection: 'row', justifyContent: 'space-between', position: 'relative', marginTop: 4 },
    timelineLine: { position: 'absolute', left: '10%', right: '10%', top: 7, height: 2, backgroundColor: V6Colors.line },
    timelineStep: { width: '20%', alignItems: 'center' },
    timelineDot: { width: 15, height: 15, borderRadius: 8, borderWidth: 2, borderColor: V6Colors.line, backgroundColor: C.surface, marginBottom: 6 },
    timelineDotDone: { backgroundColor: C.cyan700, borderColor: C.cyan700 },
    timelineDotCurrent: { borderColor: C.cyan700 },
    timelineLabel: { fontSize: 11, lineHeight: 14, color: C.ink400, fontFamily: 'Inter', textAlign: 'center' },
    timelineLabelDone: { color: C.ink700, fontWeight: '700' },

    // Detail rows
    detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
    detailRow: { width: '50%', flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingRight: 8 },
    detailRowWide: { width: '100%' },
    detailText: { flex: 1, minWidth: 0 },
    detailIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: V6Colors.wellBg, alignItems: 'center', justifyContent: 'center' },
    detailLabel: { fontSize: 12.5, color: C.ink500, fontFamily: 'Inter', marginBottom: 2 },
    detailValue: { fontSize: 14.5, color: C.ink800, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20, flexShrink: 1 },
    providerNotice: { marginBottom: 16 },
    acceptedFrom: { fontSize: 13.5, color: C.ink500, fontFamily: 'Inter', lineHeight: 19, marginTop: 12 },

    // Provider card
    providerCard: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    providerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primaryTonalStrong, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    providerAvatarText: { color: C.primaryDeep, fontSize: 16, fontWeight: '800', fontFamily: 'Inter' },
    providerName: { fontSize: 14.5, fontWeight: '700', color: C.ink900, fontFamily: 'Inter' },
    providerRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    providerRating: { fontSize: 11.5, color: C.ink400, fontFamily: 'Inter' },
    messageBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
    messageBtnText: { color: C.ink700, fontSize: 13, fontWeight: '700', fontFamily: 'Inter' },

    // Link rows
    linkRow: { paddingVertical: 12 },
    detailRowBorder: { borderTopWidth: 1, borderTopColor: V6Colors.wellBg },
    linkRowText: { color: V6Colors.link, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    reviewBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: C.primary, borderRadius: 16, minHeight: 52,
    },
    reviewBtnText: { color: C.onPrimary, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
    reviewDone: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: V6Colors.successSurface, borderRadius: 16, minHeight: 48,
    },
    reviewDoneText: { color: V6Colors.successText, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },

    // Action bar
    actionBar: { paddingHorizontal: Spacing.screenH, paddingTop: 12, paddingBottom: 12, gap: 10, backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line },
    previewBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.9)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    previewImage: { width: '100%', height: '80%' },
    primaryBtn: { backgroundColor: C.cyan700, borderRadius: 16, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
    primaryBtnText: { color: C.onPrimary, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
    outlineBtn: { borderWidth: 1, borderColor: V6Colors.fieldBorder, borderRadius: 16, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
    secondaryRow: { flexDirection: 'row', gap: 10 },
    secondaryBtn: { flex: 1, paddingHorizontal: 10 },
    barNote: { fontSize: 13, color: C.ink500, fontFamily: 'Inter', textAlign: 'center' },
    outlineBtnText: { color: C.ink800, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
    outlineDangerBtn: { borderWidth: 1, borderColor: V6Colors.dangerBorder, backgroundColor: V6Colors.dangerSurface, borderRadius: 16, minHeight: 52, justifyContent: 'center', alignItems: 'center' },
    outlineBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    outlineDangerBtnText: { color: V6Colors.dangerText, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, C, styles };
}
