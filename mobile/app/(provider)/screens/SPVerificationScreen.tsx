/**
 * SPVerificationScreen.tsx
 *
 * Provider identity verification, in three steps (Fig 3.24 / story 3):
 *
 *   1. Government ID — a photo of a valid ID
 *   2. Face scan     — a selfie, camera first
 *   3. Automated check — a Stripe Identity session decides, no admin needed
 *
 * What happens to the two images matters, so it is stated plainly on screen
 * and worth restating here: they go straight from the device to the private
 * `verification-docs` Storage bucket through a short-lived signed URL, and
 * only the resulting object *path* is ever sent to the API. The bucket is
 * private and, from migration 0019, carries Row-Level Security that lets only
 * admins read those objects — the provider who uploaded them cannot read them
 * back either.
 *
 * Step 3 is the automated one. The session is opened with both paths attached,
 * so a single pending submission carries the Stripe verdict *and* the images:
 * if Stripe cannot decide (Identity not enabled on the account, an unsupported
 * document, an abandoned session), an admin can still finish the review by
 * hand rather than the provider starting over. If Stripe is not configured on
 * the server at all, the API answers 503 before creating anything and this
 * falls back to submitting the documents for manual review — the outcome is
 * the same status either way: PENDING, awaiting a decision.
 *
 * The verdict arrives by webhook, not in a response, so after the browser
 * closes the screen polls GET /verifications/me for a short while.
 *
 * Certificate (new API only, i.e. `/verifications/me` carries identity /
 * certificate / verified): a provider is verified only with BOTH the ID and an
 * approved certificate for their service, so the flow gains a fourth step
 * between the selfie and the review (five progress steps). The step reuses
 * CertificateUploadForm, which creates the credential through the existing
 * credentials API when the provider taps "Upload certificate" (it is sent
 * then, not at the final review). A certificate that is already approved or
 * under review can be skipped. With the old API shape nothing changes.
 *
 * Deep entry: `startAt="certificate"` (+ optional `categoryId`) opens straight
 * on the certificate upload for that service, for the proposal gate's
 * `certificate_required` answer.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import CertificateUploadForm, {
  CERTIFICATE_FIELD_ORDER,
  type CertificateUploadFormHandle,
} from '../../../src/components/CertificateUploadForm';
import {
  CertificateExpiryNotice,
  CertificateStatusRows,
  certificateActionLabel,
} from '../../../src/components/CertificateNotices';
import { portfolioServices } from './SPPortfolioScreen';
import Tap from '../../../src/components/ui/Tap';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import CheckRow from '../../../src/components/ui/CheckRow';
import PaymentOption from '../../../src/components/ui/PaymentOption';
import StatusCard from '../../../src/components/ui/StatusCard';
import SuccessMark from '../../../src/components/ui/SuccessMark';
import PostProgress from '../../../src/components/post/PostProgress';
import CalmNote from '../../../src/components/post/CalmNote';
import VerifyAppBar from '../../../src/components/verify/VerifyAppBar';
import PrepCard from '../../../src/components/verify/PrepCard';
import ProtectSheet from '../../../src/components/verify/ProtectSheet';
import CheckList from '../../../src/components/verify/CheckList';
import IdExamples from '../../../src/components/verify/IdExamples';
import PhotoCard from '../../../src/components/verify/PhotoCard';
import SendingChecklist from '../../../src/components/verify/SendingChecklist';
import PendingTimeline from '../../../src/components/verify/PendingTimeline';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { IdCard, Lock, ScanFace, ShieldCheck } from 'lucide-react-native';
import { api, ApiError, type CertificateState, type Credential } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { shortDate } from '../../../src/lib/format';
import { Spacing } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useScrollToFirstError } from '../../../src/hooks/useScrollToFirstError';
import { certificateGuidance, hasNewShape, verificationSummary } from '../../../src/lib/verificationStatus';
import { requestAppPermission } from '../../../src/lib/permissions';
import { missingProfileSteps, profileReadyToVerify, type MissingProfileStep } from '../../../src/lib/verifyReady';
import {
  SESSION_STAGE,
  UPLOAD_STAGE,
  VERIFY_ID_TYPES,
  pendingRows,
  pickVerifyView,
  profileChecks,
  rejectionNote,
  sendingRows,
  takePhotoLabel,
  wizardProgress,
  type IdPhase,
  type VerifyDocumentType,
  type VerifyView,
} from '../../../src/lib/verifyFlow';

/** Stripe's decision comes by webhook; poll for it, but not forever. */
const POLL_INTERVAL_MS = 4000;
const POLL_ATTEMPTS = 8;

/** The "Before you start" card: the four things the provider will do, in order. */
const PREP_STEPS = [
  { title: 'Choose your ID', detail: "PhilSys, driver's licence, UMID, passport or postal ID" },
  { title: 'Photo of your ID', detail: 'A clear, full photo of your ID' },
  { title: 'Selfie', detail: 'To match you with your ID' },
  { title: 'Review and send', detail: 'Then a short secure check with Stripe' },
];

/** The same list with the certificate step, for the new API. */
const PREP_STEPS_WITH_CERTIFICATE = [
  ...PREP_STEPS.slice(0, 3),
  { title: 'Certificate for your service', detail: 'A TESDA, PRC or trade certificate' },
  PREP_STEPS[3],
];

/** Tips shown before the ID photo is taken. */
const PHOTO_TIPS = [
  'Place it on a flat, dark surface',
  'Use good light, and turn off the flash',
  'Keep all 4 corners inside the frame',
];

/** Reminders on the photo check. The app cannot verify these itself, so they are not ticked. */
const PHOTO_CHECKS = ['Name and photo are sharp', 'All 4 corners are visible', 'No glare or shadows on the text'];

/** The consent the provider ticks before anything is sent. Only a UI gate: what is sent does not change. */
const CONSENT_TEXT = 'This is my own valid ID, and I agree to TaskBuddy using these photos to verify me.';

/** Tips shown before the selfie. The selfie is taken with the front camera only. */
const SELFIE_TIPS = [
  'Take off glasses, hat and face mask',
  'Face a window or a bright light',
  'Hold the phone at eye level',
  'Only you in the photo',
];

/** Generic tips for a rejection. The app does not know which part failed, so these cover the usual causes. */
const HOW_TO_FIX = [
  'Retake the ID photo in good, even light',
  'Make sure your name and photo are sharp',
  'Take the selfie without glasses, a hat or a face mask',
];

const PROFILE_REASON = 'Finish your profile to continue';
const CONSENT_REASON = 'Tick the box above to continue';

/** The notice's title, worded for the profile steps still missing. */
function profileNoticeTitleFor(missing: readonly MissingProfileStep[]): string {
  if (missing.length > 1) return 'Add your address and bio first';
  return missing[0] === 'address' ? 'Add your address first' : 'Add your bio first';
}

interface SPVerificationScreenProps {
  onBack: () => void;
  /** Opens Edit Profile, where the provider adds the address and bio that verification waits for. */
  onEditProfile: () => void;
  /**
   * Called when the provider taps through after being approved — refreshes the
   * auth profile (so the dashboard's "Get Verified" banner disappears) and
   * returns to the dashboard.
   */
  onVerified?: () => Promise<void>;
  /** Open straight on the certificate upload (the proposal gate's `certificate_required`). */
  startAt?: 'certificate';
  /** With `startAt`: the service the certificate is for. Defaults to the provider's primary service. */
  categoryId?: number;
}

export default function SPVerificationScreen({ onBack, onEditProfile, onVerified, startAt, categoryId }: SPVerificationScreenProps) {
  const { Colors, V6Colors, styles } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  // The API refuses a verification without a service profile, an address or
  // a bio; say so up front instead of after all three steps.
  const { profile, providerProfile } = useAuth();
  const profileIncomplete = !profileReadyToVerify(profile, providerProfile);
  const missingSteps = providerProfile ? missingProfileSteps(profile, providerProfile) : [];
  const profileNotice = providerProfile
    ? {
      title: profileNoticeTitleFor(missingSteps),
      body: missingSteps.includes('address')
        ? 'Clients find you by your address. Include a house number and street, and a short bio tells them what you do best.'
        : 'Clients find you by your address, and your bio tells them what you do best.',
    }
    : {
      title: 'Finish your profile first',
      body: 'Pick your service, add your address and a short bio in Edit Profile.',
    };
  // The blocking card: what is missing, and a button to Edit Profile. Start and Continue stay disabled until it is fixed.
  const profileNoticeView = (
    <View style={styles.profileNotice}>
      <Text style={styles.profileNoticeTitle}>{profileNotice.title}</Text>
      <Text style={styles.profileNoticeBody}>{profileNotice.body}</Text>
      <Tap
        style={styles.profileNoticeButton}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go to Edit Profile"
        onPress={onEditProfile}
      >
        <Text style={styles.profileNoticeButtonText}>Go to Edit Profile</Text>
      </Tap>
    </View>
  );
  const [step, setStep] = useState(1);
  /** False until the provider taps Start on the intro (or Try again after a rejection). */
  const [started, setStarted] = useState(false);
  const [protectOpen, setProtectOpen] = useState(false);
  /** Inside step 1: choosing the ID, then the photo tips, then the photo check. */
  const [idPhase, setIdPhase] = useState<IdPhase>('choose');
  const [documentType, setDocumentType] = useState<VerifyDocumentType | null>(null);
  /** The consent checkbox on the review step. */
  const [consented, setConsented] = useState(false);
  /** Set when a submission has finished and the reload has not yet brought the new status. */
  const [awaitingReload, setAwaitingReload] = useState(false);
  const [idAsset, setIdAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selfieAsset, setSelfieAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  /** Set when Stripe was unavailable and the documents went to the admin queue. */
  const [fellBackToManual, setFellBackToManual] = useState(false);
  /** The certificate upload on its own screen (status screen action, renewal or deep entry). */
  const [certOnly, setCertOnly] = useState(startAt === 'certificate');
  const [certCategory, setCertCategory] = useState<number | null>(categoryId ?? null);
  /** A certificate was sent from the wizard's certificate step. */
  const [certSent, setCertSent] = useState(false);
  /** A successful credential POST can arrive before the verification read catches up. */
  const [submittedCertificate, setSubmittedCertificate] = useState<
    Pick<Credential, 'category_id' | 'status'> | null
  >(null);
  const [certBusy, setCertBusy] = useState(false);
  /** The certificate photo picked on the wizard's certificate step; the review shows it. */
  const [certAsset, setCertAsset] = useState<{ uri: string } | null>(null);
  /** Replace certificate was tapped on the review, so the upload form is shown even though one was sent. */
  const [certReplacing, setCertReplacing] = useState(false);
  const formRef = useRef<CertificateUploadFormHandle>(null);
  const scroll = useScrollToFirstError(CERTIFICATE_FIELD_ORDER);
  const scrollRef = scroll.scrollRef;

  const {
    data: verification,
    loading,
    refreshing,
    error: verificationError,
    reload,
  } = useAsyncData(useCallback(() => api.myVerification(), []), [], 'verification-me');

  // The two-part state is only there on the new API; the old one keeps today's screens.
  const newShape = hasNewShape(verification);
  const serverSummary = verificationSummary(verification);
  const primaryCategory = providerProfile?.category_id
    ?? verification?.services?.find((item) => item.primary)?.category_id
    ?? null;
  const summary = submittedCertificate?.category_id === primaryCategory
    && serverSummary.certificate === 'none'
    ? {
        ...serverSummary,
        certificate: submittedCertificate.status,
        headline: submittedCertificate.status === 'pending' && serverSummary.identity === 'approved'
          ? 'ID approved · certificate under review'
          : serverSummary.headline,
        detail: submittedCertificate.status === 'pending' && serverSummary.identity === 'approved'
          ? 'An admin is checking your certificate.'
          : serverSummary.detail,
      }
    : serverSummary;
  const credentials = useAsyncData(
    useCallback(() => (newShape ? api.myCredentials() : Promise.resolve([] as Credential[])), [newShape]),
    [newShape],
  );

  // After a submission the old status stays loaded until the reload has run.
  // Keep the loader up until then, so that old status never shows again.
  const sawLoading = useRef(false);
  const consentY = useRef(0);
  useEffect(() => {
    if (!awaitingReload) return;
    // With a cached status the reload runs as a refresh, not a first load: both count.
    if (loading || refreshing) {
      sawLoading.current = true;
    } else if (sawLoading.current) {
      sawLoading.current = false;
      setAwaitingReload(false);
    }
  }, [awaitingReload, loading, refreshing]);

  // Any timer still running when the screen goes away must not call setState.
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    },
    [],
  );

  /** The gallery is offered for the ID photo only. The selfie is always a live camera shot. */
  const pickIdPhoto = async () => {
    if (!(await requestAppPermission('gallery'))) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];

    // TC-AUTH-007: enforce 5 MB cap
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      setError('File is too large. Please choose an image under 5 MB.');
      return;
    }

    setError(null);
    setIdAsset(asset);
    setIdPhase('check');
  };

  /** Camera capture — the selfie should be a live shot, not a saved photo. */
  const takeSelfie = async () => {
    if (!(await requestAppPermission('camera'))) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      cameraType: ImagePicker.CameraType.front,
    });
    if (result.canceled) return;
    const asset = result.assets[0];

    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      setError('Photo is too large. Please retake under 5 MB.');
      return;
    }

    setError(null);
    setSelfieAsset(asset);
  };

  /** Camera capture for the ID photo. The back camera is the default, as in the system camera. */
  const takeIdPhoto = async () => {
    if (!(await requestAppPermission('camera'))) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];

    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      setError('Photo is too large. Please retake under 5 MB.');
      return;
    }

    setError(null);
    setIdAsset(asset);
    setIdPhase('check');
  };

  /** Re-checks the submission a few times, since the verdict lands by webhook. */
  const pollForResult = (attemptsLeft: number) => {
    if (attemptsLeft <= 0) return;
    pollTimer.current = setTimeout(() => {
      reload();
      pollForResult(attemptsLeft - 1);
    }, POLL_INTERVAL_MS);
  };

  const startVerification = async () => {
    if (!idAsset || !selfieAsset) return;
    setSubmitting(true);
    setError(null);
    setFellBackToManual(false);
    try {
      setSubmitStage(UPLOAD_STAGE);
      const [id_document_path, selfie_path] = await Promise.all([
        api.uploadImage('verification-docs', idAsset.uri),
        api.uploadImage('verification-docs', selfieAsset.uri),
      ]);

      setSubmitStage(SESSION_STAGE);
      try {
        const session = await api.startIdentitySession({
          id_document_path,
          selfie_path,
          document_type: documentType ?? undefined,
        });
        if (session.url) {
          // Expo Go cannot load Stripe's native SDK, so the hosted flow in a
          // browser is the route that works in every build of this app.
          await WebBrowser.openBrowserAsync(session.url);
        }
        pollForResult(POLL_ATTEMPTS);
      } catch (identityError) {
        // The API creates its row only after Stripe answers, so a server-side
        // failure here — 503 when Stripe Identity isn't configured, or a 5xx
        // from Stripe itself — has left nothing behind and the manual queue is
        // still open to us. A 4xx is different: a rate limit (429), an expired
        // session or a review already pending would all be *wrong* to paper
        // over with a manual submission, so those surface as they are.
        if (!(identityError instanceof ApiError) || identityError.status < 500) {
          throw identityError;
        }
        await api.submitVerification({
          id_document_path,
          selfie_path,
          document_type: documentType ?? undefined,
        });
        setFellBackToManual(true);
      }

      setIdAsset(null);
      setSelfieAsset(null);
      setDocumentType(null);
      setStep(1);
      setIdPhase('choose');
      setConsented(false);
      setCertSent(false);
      setAwaitingReload(true);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your documents.');
    } finally {
      setSubmitStage(null);
      setSubmitting(false);
    }
  };

  /** Which view is on screen; the rules live in src/lib/verifyFlow.ts. */
  // New API: the ID status comes from `identity`; an approved ID without the certificate is not "approved".
  const idStatus: 'pending' | 'approved' | 'rejected' | null = newShape
    ? summary.verified || summary.identity === 'approved'
      ? 'approved'
      : summary.identity === 'none' ? null : summary.identity
    : verification?.status ?? null;
  const baseView = pickVerifyView({
    loading,
    status: idStatus,
    submitting,
    started,
    settling: awaitingReload,
    failed: verificationError !== null,
  });
  const screenView: VerifyView | 'status' = baseView === 'approved' && newShape && !summary.verified ? 'status' : baseView;
  const view: VerifyView | 'status' | 'certificate' =
    certOnly && ['intro', 'status', 'pending', 'rejected', 'approved'].includes(screenView) ? 'certificate' : screenView;
  // A rejected provider who has not yet tapped Try again still needs the wizard's photo hint.
  const isRejected = idStatus === 'rejected';

  // The service a certificate is for: the one asked for, else the provider's primary service.
  const services = portfolioServices(providerProfile);
  const targetCategory = certCategory ?? providerProfile?.category_id ?? verification?.services?.find((item) => item.primary)?.category_id ?? null;
  const targetService = verification?.services?.find((item) => item.category_id === targetCategory);
  const targetName = targetService?.name ?? services.find((item) => item.id === targetCategory)?.name ?? null;
  const targetState: CertificateState = targetService?.certificate ?? summary.certificate;
  const serviceNames: Record<number, string | undefined> = {};
  for (const item of services) serviceNames[item.id] = item.name;
  for (const item of verification?.services ?? []) if (item.name) serviceNames[item.category_id] = item.name;
  for (const item of credentials.data ?? []) {
    if (item.service_categories) serviceNames[item.category_id] ??= item.service_categories.name;
  }
  /** Already approved or under review: the wizard's certificate step can be skipped. */
  const certificateCovered = !certReplacing && (certSent || targetState === 'approved' || targetState === 'pending');
  const reviewStep = newShape ? 4 : 3;
  const openCertificate = (category: number | null = null) => {
    setCertCategory(category);
    setCertOnly(true);
  };
  /** Replace certificate on the review: back to the upload form for the same service (the certificate step is 3). */
  const replaceCertificate = () => {
    setCertReplacing(true);
    setCertSent(false);
    setStep(3);
  };

  /**
   * One screen back inside the wizard: selfie to ID photo, ID photo to ID
   * choice, ID choice to the intro. Anywhere else the arrow leaves the screen.
   */
  const goBack = () => {
    if (submitting) return;
    if (view === 'certificate') {
      setCertOnly(false);
      return;
    }
    if (view !== 'wizard') {
      onBack();
      return;
    }
    if (step > 1) {
      if (step === 2) setIdPhase(idAsset ? 'check' : 'tips');
      setStep(step - 1);
      return;
    }
    if (idPhase === 'choose') setStarted(false);
    else setIdPhase('choose');
  };

  /** Try again after a rejection: the wizard opens at the ID choice. */
  const tryAgain = () => {
    setStarted(true);
    setStep(1);
    setIdPhase('choose');
  };

  /** Approved: refresh the profile and go to the feed, as the Go to Dashboard button always did. */
  const continueToFeed = async () => {
    if (!onVerified) return;
    setContinuing(true);
    setError(null);
    try {
      await onVerified();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not refresh your profile. Try again.');
    } finally {
      setContinuing(false);
    }
  };

  const onChoosingId = step === 1 && idPhase === 'choose';
  const chosenIdLabel = VERIFY_ID_TYPES.find((type) => type.value === documentType)?.label ?? 'ID';
  /** A passport's photo is of its photo page, not its front. */
  const idSideName = documentType === 'passport' ? 'Photo page' : 'Front';

  /** Why the bottom button is off, said in words above it; null when it is live. */
  const disabledReason: string | null =
    view === 'intro'
      ? (profileIncomplete ? PROFILE_REASON : null)
      : view === 'wizard' && onChoosingId
        ? (profileIncomplete ? PROFILE_REASON : !documentType ? 'Choose an ID to continue' : null)
        : view === 'wizard' && step === reviewStep
          ? (!consented ? CONSENT_REASON : profileIncomplete ? PROFILE_REASON : null)
          : null;

  const headerTitle =
    view === 'certificate'
      ? 'Upload certificate'
      : view === 'pending' || view === 'rejected' || view === 'status' ? 'Verification' : 'Get verified';

  return (
    <View style={styles.screen}>
      {view !== 'approved' && (
        <VerifyAppBar
          title={headerTitle}
          onBack={goBack}
          backLabel={
            view === 'certificate'
              ? 'Back to your status'
              : view !== 'wizard'
              ? 'Leave verification'
              : onChoosingId
                ? 'Back to the start'
                : 'Back to the previous step'
          }
          topInset={headerTop}
        />
      )}

      {/* Progress: only while the wizard is on screen. */}
      {view === 'wizard' && <PostProgress {...wizardProgress(step, idPhase, newShape)} />}

      <KeyboardAwareScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {view === 'loading' && <ContentSkeleton variant="detail" />}
        {/* Not knowing the status is not a new application: say so, and offer no start. */}
        {view === 'error' && (
          <LoadErrorCard title="Couldn't check your verification" message={verificationError} onRetry={reload} />
        )}

        {view === 'pending' && verification && (
          <>
            <StatusCard
              tone="attention"
              overline={`In review · sent ${shortDate(verification.submitted_at)}`}
              title="We're checking your documents"
              body={
                verification.method === 'stripe_identity' && !fellBackToManual
                  ? 'The automated check is running — this usually takes a couple of minutes. You can leave this screen; we’ll notify you when it finishes.'
                  : "An admin is reviewing them. We'll notify you as soon as there's a decision."
              }
            >
              <Tap onPress={reload} hitSlop={8} accessibilityRole="button" accessibilityLabel="Check again">
                <Text style={styles.checkAgain}>Check again</Text>
              </Tap>
            </StatusCard>
            {newShape && <CertificateStatusRows summary={summary} onCertificateAction={() => openCertificate()} />}
            <Text style={styles.sectionTitle} accessibilityRole="header">Progress</Text>
            <PendingTimeline rows={pendingRows({ method: verification.method, fellBackToManual })} />
          </>
        )}

        {view === 'rejected' && verification && (
          <>
            <StatusCard
              tone="closed"
              overline={`Not approved · ${shortDate(verification.reviewed_at ?? verification.submitted_at)}`}
              title="Your documents were rejected."
              body={rejectionNote(verification.rejection_reason) ?? undefined}
            />
            {newShape && <CertificateStatusRows summary={summary} onCertificateAction={() => openCertificate()} />}
            <Text style={styles.sectionTitle} accessibilityRole="header">How to fix it</Text>
            <CheckList items={HOW_TO_FIX} />
          </>
        )}

        {/* New API: ID approved but not verified yet, so the certificate is what is left. */}
        {view === 'status' && (
          <>
            <StatusCard
              tone={summary.certificate === 'pending' ? 'attention' : summary.certificate === 'none' ? 'action' : 'closed'}
              overline="Verification"
              title={summary.headline}
              body={summary.detail}
            >
              {summary.certificate === 'pending' && (
                <Tap onPress={() => { reload(); credentials.reload(); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Check again">
                  <Text style={styles.checkAgain}>Check again</Text>
                </Tap>
              )}
            </StatusCard>
            <CertificateExpiryNotice credentials={credentials.data} serviceNames={serviceNames} onRenew={openCertificate} />
            <CertificateStatusRows summary={summary} onCertificateAction={() => openCertificate()} />
          </>
        )}

        {view === 'certificate' && (
          <>
            <Text style={styles.stepTitle} accessibilityRole="header">
              {targetName ? `Your ${targetName} certificate` : 'Your certificate'}
            </Text>
            <CertificateUploadForm
              ref={formRef}
              scroll={scroll}
              categoryId={targetCategory}
              serviceName={targetName}
              lockService
              guidance={certificateGuidance(targetName)}
              onBusyChange={setCertBusy}
              onPhotoPicked={(uri) => setCertAsset({ uri })}
              onSubmitted={(created) => {
                if (created) setSubmittedCertificate({ category_id: created.category_id, status: created.status });
                setCertOnly(false);
                setCertCategory(null);
                setAwaitingReload(true);
                reload();
                credentials.reload();
              }}
            />
          </>
        )}

        {view === 'approved' && (
          <View style={styles.celebrate}>
            <SuccessMark
              size={96}
              fallback={
                <View style={styles.badge}>
                  <ShieldCheck size={44} color={Colors.successText} />
                </View>
              }
            />
            <Text style={styles.approvedTitle} accessibilityRole="header">
              {"You're verified!"}
            </Text>
            <Text style={styles.approvedBody}>
              Clients can now see you, and jobs near you are open. Your profile shows the Verified badge.
            </Text>
            <CalmNote
              icon={ShieldCheck}
              text="Your documents are stored privately and are only visible to TaskBuddy admins reviewing your account."
            />
            {newShape && (
              <CertificateExpiryNotice credentials={credentials.data} serviceNames={serviceNames} onRenew={openCertificate} />
            )}
            {!!error && <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text>}
          </View>
        )}

        {view === 'intro' && (
          <>
            <Text style={styles.introTitle} accessibilityRole="header">
              Get verified to start getting jobs
            </Text>
            <Text style={styles.introBody}>
              Clients only see and hire verified providers. It takes about 3 minutes.
            </Text>
            {profileIncomplete && profileNoticeView}
            <PrepCard steps={newShape ? PREP_STEPS_WITH_CERTIFICATE : PREP_STEPS} profileItems={profileChecks(profile, providerProfile)} />
            <Tap
              style={styles.protectLink}
              onPress={() => setProtectOpen(true)}
              hitSlop={{ top: 12, bottom: 12 }}
              accessibilityRole="button"
              accessibilityLabel="How we protect your ID"
            >
              <ShieldCheck size={16} color={Colors.link} />
              <Text style={styles.protectLinkText}>How we protect your ID</Text>
            </Tap>
          </>
        )}

        {view === 'sending' && (
          <>
            <Text style={styles.stepTitle} accessibilityRole="header">
              Sending your documents…
            </Text>
            <Text style={styles.stepHint}>Please keep the app open. This takes a few seconds.</Text>
            <SendingChecklist rows={sendingRows(submitStage)} />
          </>
        )}

        {view === 'wizard' && (
          <>
            {/* ── Step 1 · Government ID ─────────────────────────── */}
            {step === 1 && profileIncomplete && profileNoticeView}
            {step === 1 && idPhase === 'choose' && (
              <>
                <Text style={styles.stepTitle} accessibilityRole="header">
                  Which ID will you use?
                </Text>
                <View style={styles.optionList} accessibilityRole="radiogroup">
                  {VERIFY_ID_TYPES.map((doc) => (
                    <PaymentOption
                      key={doc.value}
                      title={doc.label}
                      meta={doc.side}
                      icon={IdCard}
                      selected={documentType === doc.value}
                      onSelect={() => setDocumentType(doc.value)}
                    />
                  ))}
                </View>
                <CalmNote
                  icon={ShieldCheck}
                  text="Use your original, valid ID. Photocopies, screenshots and expired IDs can't be accepted."
                />
              </>
            )}
            {step === 1 && idPhase === 'tips' && (
              <>
                <Text style={styles.stepTitle} accessibilityRole="header">
                  {`Get a clear photo of your ${chosenIdLabel}`}
                </Text>
                <IdExamples />
                <CheckList items={PHOTO_TIPS} />
              </>
            )}

            {step === 1 && idPhase === 'check' && (
              <>
                <Text style={styles.stepTitle} accessibilityRole="header">
                  Is everything readable?
                </Text>
                {!!idAsset && (
                  <View style={styles.previewFrame}>
                    <Image source={{ uri: idAsset.uri }} style={styles.preview} resizeMode="cover" />
                  </View>
                )}
                <View style={styles.checkBox}>
                  <CheckList items={PHOTO_CHECKS} muted />
                </View>
              </>
            )}

            {/* ── Step 2 · Selfie: live camera only ─────────────── */}
            {step === 2 && (
              <>
                <Text style={styles.stepTitle} accessibilityRole="header">
                  Now a quick selfie
                </Text>
                <Text style={styles.stepHint}>We match your face with the photo on your ID.</Text>
                <View style={styles.faceFrame}>
                  {selfieAsset ? (
                    <Image source={{ uri: selfieAsset.uri }} style={styles.preview} resizeMode="cover" />
                  ) : (
                    <ScanFace size={56} color={V6Colors.link} />
                  )}
                </View>
                <CheckList items={SELFIE_TIPS} />
              </>
            )}

            {/* ── Step 3 · Certificate for your service (new API only) ── */}
            {newShape && step === 3 && (
              <>
                <Text style={styles.stepTitle} accessibilityRole="header">
                  {targetName ? `Your ${targetName} certificate` : 'Your certificate'}
                </Text>
                {certificateCovered ? (
                  <StatusCard
                    tone={targetState === 'approved' ? 'done' : 'attention'}
                    overline="Certificate"
                    title={targetState === 'approved' ? 'Your certificate is approved' : 'Your certificate is under review'}
                    body="Nothing to upload here. You can continue."
                  />
                ) : (
                  <CertificateUploadForm
                    ref={formRef}
                    scroll={scroll}
                    categoryId={targetCategory}
                    serviceName={targetName}
                    lockService
                    guidance={certificateGuidance(targetName)}
                    onBusyChange={setCertBusy}
                    onPhotoPicked={(uri) => setCertAsset({ uri })}
                    onSubmitted={() => {
                      setCertReplacing(false);
                      setCertSent(true);
                      credentials.reload();
                      setStep(reviewStep);
                    }}
                  />
                )}
              </>
            )}

            {/* ── Last step · Review and send ────────────────────── */}
            {step === reviewStep && (
              <>
                <Text style={styles.stepTitle} accessibilityRole="header">
                  Ready to send
                </Text>
                <View style={styles.photoRow}>
                  {!!idAsset && (
                    <PhotoCard
                      title={idSideName}
                      uri={idAsset.uri}
                      retakeLabel="Retake ID photo"
                      onRetake={() => {
                        setIdPhase('tips');
                        setStep(1);
                      }}
                    />
                  )}
                  {!!selfieAsset && (
                    <PhotoCard
                      title="Selfie"
                      uri={selfieAsset.uri}
                      retakeLabel="Retake selfie"
                      onRetake={() => setStep(2)}
                    />
                  )}
                  {newShape && (
                    // The photo is only held for a certificate sent in this session; otherwise the card shows its status alone.
                    <PhotoCard
                      title={`Certificate${targetName ? ` · ${targetName}` : ''}`}
                      uri={certSent ? (certAsset?.uri ?? null) : null}
                      note={targetState === 'approved' && !certSent ? 'Approved' : 'Sent for review'}
                      actionLabel="Replace"
                      retakeLabel="Replace certificate"
                      onRetake={certSent && certAsset ? replaceCertificate : undefined}
                    />
                  )}
                </View>
                {newShape && (
                  <Text style={styles.stepHint} testID="verify-review-certificate">
                    {`Certificate${targetName ? ` for ${targetName}` : ''}: ${certSent ? 'sent for review' : targetState === 'approved' ? 'approved' : 'under review'}`}
                  </Text>
                )}
                <View onLayout={(event) => { consentY.current = event.nativeEvent.layout.y; }}>
                  <CheckRow
                    label={CONSENT_TEXT}
                    checked={consented}
                    onToggle={() => setConsented((value) => !value)}
                  />
                </View>
                <CalmNote
                  icon={Lock}
                  text="Next, Stripe opens a secure page and asks you to scan your ID and face once more to confirm it's you. Only TaskBuddy admins can see the photos you took here."
                />
                <Text style={styles.stepHint}>
                  If Stripe isn't available, your photos go to a TaskBuddy admin for manual review.
                </Text>
              </>
            )}

            {isRejected && step === 1 && (
              <Text style={styles.retryHint}>
                Upload fresh photos — the previous ones were not accepted.
              </Text>
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </KeyboardAwareScrollView>

      {/* Step errors and the reason a button is off sit just above the bar, where the eye is. */}
      {view === 'wizard' && !!error && (
        <Text style={styles.barError} accessibilityLiveRegion="polite" testID="verify-step-error">{error}</Text>
      )}
      {!!disabledReason && (
        disabledReason === CONSENT_REASON ? (
          <Tap
            onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, consentY.current - 12), animated: true })}
            accessibilityRole="button"
            accessibilityLabel={disabledReason}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={styles.barHint} testID="verify-disabled-reason">{disabledReason}</Text>
          </Tap>
        ) : (
          <Text style={styles.barHint} testID="verify-disabled-reason">{disabledReason}</Text>
        )
      )}

      {view === 'intro' && (
        <BottomActionBar
          primaryLabel="Start"
          onPrimary={() => setStarted(true)}
          primaryDisabled={profileIncomplete}
        />
      )}

      {view === 'rejected' && <BottomActionBar primaryLabel="Try again" onPrimary={tryAgain} />}

      {view === 'approved' && onVerified && (
        <BottomActionBar
          primaryLabel="See jobs near you"
          onPrimary={() => void continueToFeed()}
          busy={continuing}
        />
      )}

      {view === 'wizard' && onChoosingId && (
        <BottomActionBar
          primaryLabel="Continue"
          onPrimary={() => setIdPhase('tips')}
          primaryDisabled={!documentType || profileIncomplete}
        />
      )}

      {view === 'wizard' && step === 1 && idPhase === 'tips' && (
        <BottomActionBar
          primaryLabel={takePhotoLabel(documentType)}
          onPrimary={() => void takeIdPhoto()}
          secondaryLabel="Upload from gallery"
          onSecondary={() => void pickIdPhoto()}
        />
      )}

      {view === 'wizard' && step === 1 && idPhase === 'check' && (
        <BottomActionBar
          primaryLabel="Use this photo"
          onPrimary={() => setStep(2)}
          secondaryLabel="Retake"
          onSecondary={() => setIdPhase('tips')}
        />
      )}

      {view === 'wizard' && step === 2 && (
        <BottomActionBar
          primaryLabel={selfieAsset ? 'Continue' : 'Take selfie'}
          onPrimary={() => (selfieAsset ? setStep(3) : void takeSelfie())}
          secondaryLabel={selfieAsset ? 'Retake' : undefined}
          onSecondary={selfieAsset ? () => void takeSelfie() : undefined}
        />
      )}

      {view === 'wizard' && newShape && step === 3 && (
        certificateCovered ? (
          <BottomActionBar primaryLabel="Continue" onPrimary={() => setStep(reviewStep)} />
        ) : (
          <BottomActionBar
            primaryLabel={certBusy ? 'Uploading…' : 'Upload certificate'}
            onPrimary={() => void formRef.current?.submit()}
            busy={certBusy}
            primaryDisabled={certBusy}
          />
        )
      )}

      {view === 'certificate' && (
        <BottomActionBar
          primaryLabel={certBusy ? 'Uploading…' : 'Upload certificate'}
          onPrimary={() => void formRef.current?.submit()}
          busy={certBusy}
          primaryDisabled={certBusy}
        />
      )}

      {view === 'status' && !!certificateActionLabel(summary.certificate) && (
        <BottomActionBar
          primaryLabel={certificateActionLabel(summary.certificate)!}
          onPrimary={() => openCertificate()}
        />
      )}

      {view === 'wizard' && step === reviewStep && (
        <BottomActionBar
          primaryLabel="Continue to secure check"
          onPrimary={() => void startVerification()}
          primaryDisabled={!consented || profileIncomplete}
        />
      )}

      <ProtectSheet visible={protectOpen} onClose={() => setProtectOpen(false)} />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: V6Colors.canvas },
    loader: { marginTop: 40 },
    content: { padding: Spacing.screenH, gap: 16 },
    introTitle: { color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 24, fontWeight: '700', lineHeight: 30 },
    introBody: { color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 15, lineHeight: 21, marginTop: -8 },
    protectLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 40 },
    protectLinkText: { color: Colors.link, fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18 },
    sectionTitle: { color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 16, fontWeight: '700', lineHeight: 22, marginTop: 4 },
    checkAgain: { color: Colors.link, fontFamily: 'Inter', fontSize: 15, fontWeight: '700', lineHeight: 20, marginTop: 8 },
    celebrate: { alignItems: 'center', gap: 14, paddingTop: 24 },
    badge: {
      width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.successSurface,
    },
    approvedTitle: { color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 24, fontWeight: '700', lineHeight: 30, textAlign: 'center' },
    approvedBody: { color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 15, lineHeight: 21, textAlign: 'center' },
    stepTitle: { color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 22, fontWeight: '700', lineHeight: 28 },
    stepHint: { color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 15.5, lineHeight: 21 },
    optionList: { gap: 8 },
    previewFrame: { height: 280, borderRadius: 14, overflow: 'hidden', backgroundColor: V6Colors.ink50 },
    checkBox: {
      backgroundColor: V6Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: V6Colors.line, padding: 14,
    },
    preview: { width: '100%', height: '100%' },
    faceFrame: {
      width: 200, height: 200, borderRadius: 100, alignSelf: 'center', overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center', backgroundColor: V6Colors.ink50,
      borderWidth: 1.5, borderStyle: 'dashed', borderColor: V6Colors.fieldBorder,
    },
    photoRow: { flexDirection: 'row', gap: 12 },
    profileNotice: {
      backgroundColor: V6Colors.warningSurface, borderWidth: 1, borderColor: V6Colors.warningBorder,
      borderRadius: 14, padding: 14, gap: 4,
    },
    profileNoticeTitle: { color: V6Colors.warningText, fontFamily: 'Inter', fontSize: 15, fontWeight: '700' },
    profileNoticeBody: { color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 14, lineHeight: 20 },
    profileNoticeButton: {
      minHeight: 48, borderRadius: 14, marginTop: 6, backgroundColor: Colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    profileNoticeButtonText: { color: Colors.onPrimary, fontFamily: 'Inter', fontSize: 15, fontWeight: '700' },
    barError: {
      color: Colors.dangerText, fontFamily: 'Inter', fontSize: 14, textAlign: 'center',
      paddingHorizontal: Spacing.screenH, paddingVertical: 8, backgroundColor: V6Colors.surface,
    },
    barHint: {
      color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 13.5, textAlign: 'center',
      paddingHorizontal: Spacing.screenH, paddingTop: 8, backgroundColor: V6Colors.surface,
    },
    errorText: { color: Colors.dangerText, fontFamily: 'Inter', fontSize: 15.5, textAlign: 'center' },
    retryHint: { color: V6Colors.ink500, fontFamily: 'Inter', fontSize: 14, textAlign: 'center' },
  });
  return { Colors, V6Colors, styles };
}
