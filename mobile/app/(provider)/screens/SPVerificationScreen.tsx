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
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import PaymentOption from '../../../src/components/ui/PaymentOption';
import PostProgress from '../../../src/components/post/PostProgress';
import CalmNote from '../../../src/components/post/CalmNote';
import VerifyAppBar from '../../../src/components/verify/VerifyAppBar';
import PrepCard from '../../../src/components/verify/PrepCard';
import ProtectSheet from '../../../src/components/verify/ProtectSheet';
import CheckList from '../../../src/components/verify/CheckList';
import IdExamples from '../../../src/components/verify/IdExamples';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import {
  BadgeCheck,
  Check,
  CircleAlert,
  Clock,
  IdCard,
  Lock,
  ScanFace,
  ShieldCheck,
} from 'lucide-react-native';
import { api, ApiError } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { shortDate } from '../../../src/lib/format';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { requestAppPermission } from '../../../src/lib/permissions';
import {
  VERIFY_ID_TYPES,
  pickVerifyView,
  profileChecks,
  takePhotoLabel,
  wizardProgress,
  type IdPhase,
  type VerifyDocumentType,
} from '../../../src/lib/verifyFlow';

const Radii = { card: V6Radii.card };
const Shadows = { card: V6Shadows.sm };

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

/** Tips shown before the ID photo is taken. */
const PHOTO_TIPS = [
  'Place it on a flat, dark surface',
  'Use good light, and turn off the flash',
  'Keep all 4 corners inside the frame',
];

/** Reminders on the photo check. The app cannot verify these itself, so they are not ticked. */
const PHOTO_CHECKS = ['Name and photo are sharp', 'All 4 corners are visible', 'No glare or shadows on the text'];

/** Tips shown before the selfie. The selfie is taken with the front camera only. */
const SELFIE_TIPS = [
  'Take off glasses, hat and face mask',
  'Face a window or a bright light',
  'Hold the phone at eye level',
  'Only you in the photo',
];

interface SPVerificationScreenProps {
  onBack: () => void;
  /**
   * Called when the provider taps through after being approved — refreshes the
   * auth profile (so the dashboard's "Get Verified" banner disappears) and
   * returns to the dashboard.
   */
  onVerified?: () => Promise<void>;
}

export default function SPVerificationScreen({ onBack, onVerified }: SPVerificationScreenProps) {
  const { Colors, V6Colors, styles } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  // The API refuses a verification without a service profile; say so up
  // front instead of after all three steps.
  const { providerProfile } = useAuth();
  const profileIncomplete = !providerProfile;
  const [step, setStep] = useState(1);
  /** False until the provider taps Start on the intro (or Try again after a rejection). */
  const [started, setStarted] = useState(false);
  const [protectOpen, setProtectOpen] = useState(false);
  /** Inside step 1: choosing the ID, then the photo tips, then the photo check. */
  const [idPhase, setIdPhase] = useState<IdPhase>('choose');
  const [documentType, setDocumentType] = useState<VerifyDocumentType | null>(null);
  const [idAsset, setIdAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selfieAsset, setSelfieAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  /** Set when Stripe was unavailable and the documents went to the admin queue. */
  const [fellBackToManual, setFellBackToManual] = useState(false);

  const {
    data: verification,
    loading,
    reload,
  } = useAsyncData(useCallback(() => api.myVerification(), []));

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
      setSubmitStage('Uploading your documents…');
      const [id_document_path, selfie_path] = await Promise.all([
        api.uploadImage('verification-docs', idAsset.uri),
        api.uploadImage('verification-docs', selfieAsset.uri),
      ]);

      setSubmitStage('Opening the automated check…');
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
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your documents.');
    } finally {
      setSubmitStage(null);
      setSubmitting(false);
    }
  };

  // A pending submission is terminal for the UI — only one review may be open.
  const isPending = verification?.status === 'pending';
  const isApproved = verification?.status === 'approved';
  const isRejected = verification?.status === 'rejected';

  /** Which view is on screen; the rules live in src/lib/verifyFlow.ts. */
  const view = pickVerifyView({
    loading,
    status: verification?.status ?? null,
    submitting,
    started,
  });
  const showWizard = view === 'wizard' || view === 'sending';
  const showIntro = view === 'intro' || view === 'rejected';

  const canAdvance =
    (step === 1 && !!documentType && !!idAsset) || (step === 2 && !!selfieAsset) || step === 3;

  /**
   * One screen back inside the wizard: selfie to ID photo, ID photo to ID
   * choice, ID choice to the intro. Anywhere else the arrow leaves the screen.
   */
  const goBack = () => {
    if (submitting) return;
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

  const onChoosingId = step === 1 && idPhase === 'choose';
  const chosenIdLabel = VERIFY_ID_TYPES.find((type) => type.value === documentType)?.label ?? 'ID';

  const renderStatus = () => {
    if (!verification) return null;
    if (isApproved) {
      return (
        <View style={[styles.status, styles.statusApproved]}>
          <BadgeCheck size={22} color={Colors.successText} />
          <View style={styles.statusTextBox}>
            <Text style={styles.statusTitle}>You&apos;re verified</Text>
            <Text style={styles.statusBody}>
              Approved on {shortDate(verification.reviewed_at ?? verification.submitted_at)}.
            </Text>
          </View>
        </View>
      );
    }
    if (isPending) {
      return (
        <View style={[styles.status, styles.statusPending]}>
          <Clock size={22} color={Colors.warningText} />
          <View style={styles.statusTextBox}>
            <Text style={styles.statusTitle}>Pending verification</Text>
            <Text style={styles.statusBody}>
              Submitted {shortDate(verification.submitted_at)}.{' '}
              {verification.method === 'stripe_identity' && !fellBackToManual
                ? 'The automated check is running — this usually takes a couple of minutes. You can leave this screen; we’ll notify you when it finishes.'
                : 'A TaskBuddy admin is reviewing your documents. We’ll notify you when it’s done.'}
            </Text>
            <Tap onPress={reload} activeOpacity={0.8}>
              <Text style={styles.statusAction}>Check again</Text>
            </Tap>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.status, styles.statusRejected]}>
        <CircleAlert size={22} color={Colors.dangerText} />
        <View style={styles.statusTextBox}>
          <Text style={styles.statusTitle}>Not approved</Text>
          <Text style={styles.statusBody}>
            {verification.rejection_reason ?? 'Your documents were rejected.'} You can
            start again below.
          </Text>
        </View>
      </View>
    );
  };

  const renderApprovedContinue = () => {
    if (!isApproved || !onVerified) return null;
    const goToDashboard = async () => {
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
    return (
      <Tap
        style={styles.submitButton}
        onPress={goToDashboard}
        disabled={continuing}
        activeOpacity={0.85}
      >
        {continuing ? (
          <ActivityIndicator color={Colors.onPrimary} />
        ) : (
          <Text style={styles.submitText}>Go to Dashboard</Text>
        )}
      </Tap>
    );
  };

  return (
    <View style={styles.screen}>
      <VerifyAppBar
        title="Get verified"
        onBack={goBack}
        backLabel={
          view !== 'wizard' ? 'Leave verification' : onChoosingId ? 'Back to the start' : 'Back to the previous step'
        }
        topInset={headerTop}
      />

      {/* Progress: only while the wizard is on screen. */}
      {showWizard && !loading && <PostProgress {...wizardProgress(step, idPhase)} />}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {view === 'loading' ? (
          <ActivityIndicator color={V6Colors.link} style={styles.loader} />
        ) : (
          <>
            {renderStatus()}

            {isApproved && (
              <View style={styles.notice}>
                <ShieldCheck size={22} color={V6Colors.link} />
                <Text style={styles.noticeText}>
                  Your documents are stored privately and are only visible to TaskBuddy
                  admins reviewing your account.
                </Text>
              </View>
            )}

            {renderApprovedContinue()}
            {isApproved && error && <Text style={styles.errorText}>{error}</Text>}

            {showIntro && (
              <>
                <Text style={styles.introTitle} accessibilityRole="header">
                  Get verified to start getting jobs
                </Text>
                <Text style={styles.introBody}>
                  Clients only see and hire verified providers. It takes about 3 minutes.
                </Text>
                {profileIncomplete && (
                  <View style={styles.profileNotice}>
                    <Text style={styles.profileNoticeTitle}>Finish your profile first</Text>
                    <Text style={styles.profileNoticeBody}>
                      Pick your service and add a bio in Profile → Edit Profile. Verification can't be sent until they're saved.
                    </Text>
                  </View>
                )}
                <PrepCard steps={PREP_STEPS} profileItems={profileChecks(providerProfile)} />
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

            {showWizard && (
              <>
                {/* ── Step 1 · Government ID ─────────────────────────── */}
                {step === 1 && profileIncomplete && (
                  <View style={styles.profileNotice}>
                    <Text style={styles.profileNoticeTitle}>Finish your profile first</Text>
                    <Text style={styles.profileNoticeBody}>
                      Pick your service and add a bio in Profile → Edit Profile. Verification can't be sent until they're saved.
                    </Text>
                  </View>
                )}
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

                {/* ── Step 2 · Face scan ─────────────────────────────── */}
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

                {/* ── Step 3 · Automated check ───────────────────────── */}
                {step === 3 && (
                  <View style={styles.card}>
                    <Text style={styles.label}>Automated Check</Text>
                    <Text style={styles.hint}>
                      Stripe Identity checks your ID and selfie automatically. It opens in
                      a secure browser window and takes about a minute.
                    </Text>

                    <View style={styles.summaryRow}>
                      <View style={[styles.summaryCheck, idAsset && styles.summaryCheckDone]}>
                        {!!idAsset && <Check size={13} color={Colors.onPrimary} strokeWidth={3} />}
                      </View>
                      <Text style={styles.summaryText}>Government ID ready</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <View style={[styles.summaryCheck, selfieAsset && styles.summaryCheckDone]}>
                        {!!selfieAsset && <Check size={13} color={Colors.onPrimary} strokeWidth={3} />}
                      </View>
                      <Text style={styles.summaryText}>Face scan ready</Text>
                    </View>

                    <View style={styles.privacyNote}>
                      <Lock size={18} color={V6Colors.link} />
                      <Text style={styles.privacyText}>
                        Your ID and selfie are uploaded to a private storage bucket that
                        only TaskBuddy admins can open, and are kept as a fallback in case
                        the automated check cannot decide.
                      </Text>
                    </View>

                    {!!submitStage && <Text style={styles.stageText}>{submitStage}</Text>}
                  </View>
                )}

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                {step === 3 && (
                <View style={styles.wizardActions}>
                  {step > 1 && (
                    <Tap
                      style={styles.backStepBtn}
                      onPress={goBack}
                      activeOpacity={0.85}
                      disabled={submitting}
                    >
                      <Text style={styles.backStepText}>Back</Text>
                    </Tap>
                  )}
                  <Tap
                    style={[
                      styles.submitButton,
                      styles.wizardPrimary,
                      !canAdvance && styles.submitButtonDisabled,
                    ]}
                    onPress={() => void startVerification()}
                    activeOpacity={0.85}
                    disabled={!canAdvance || submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color={Colors.onPrimary} />
                    ) : (
                      <Text style={[styles.submitText, !canAdvance && styles.submitTextDisabled]}>
                        {step === 3 ? 'Start Verification' : 'Next'}
                      </Text>
                    )}
                  </Tap>
                </View>
                )}

                {isRejected && step === 1 && (
                  <Text style={styles.retryHint}>
                    Upload fresh photos — the previous ones were not accepted.
                  </Text>
                )}
              </>
            )}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>

      {showIntro && (
        <BottomActionBar
          primaryLabel="Start"
          onPrimary={() => setStarted(true)}
          primaryDisabled={profileIncomplete}
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
    status: {
      flexDirection: 'row',
      gap: 10,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
    },
    statusApproved: { backgroundColor: V6Colors.successSurface, borderColor: V6Colors.successBorder },
    statusPending: { backgroundColor: V6Colors.warningSurface, borderColor: V6Colors.warningBorder },
    statusRejected: { backgroundColor: V6Colors.dangerSurface, borderColor: V6Colors.dangerBorder },
    statusTextBox: { flex: 1, gap: 3 },
    statusTitle: {
      color: V6Colors.ink900,
      fontFamily: 'Inter',
      fontSize: 16.5,
      fontWeight: '800',
    },
    statusBody: { color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 15.5, lineHeight: 19 },
    statusAction: { color: V6Colors.link, fontFamily: 'Inter', fontSize: 15, fontWeight: '700', marginTop: 6 },
    notice: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: V6Colors.ink50,
      borderRadius: 14,
      padding: 14,
    },
    noticeText: { flex: 1, color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 15.5, lineHeight: 19 },
    card: { backgroundColor: V6Colors.surface, borderRadius: Radii.card, padding: 18, ...Shadows.card },
    label: { color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 18.5, fontWeight: '800' },
    hint: { color: V6Colors.ink500, fontFamily: 'Inter', fontSize: 15.5, marginTop: 4, marginBottom: 14, lineHeight: 20 },
    stepTitle: { color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 22, fontWeight: '700', lineHeight: 28 },
    optionList: { gap: 8 },
    previewFrame: { height: 280, borderRadius: 14, overflow: 'hidden', backgroundColor: V6Colors.ink50 },
    checkBox: {
      backgroundColor: V6Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: V6Colors.line, padding: 14,
    },
    preview: { width: '100%', height: '100%' },
    stepHint: { color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 15.5, lineHeight: 21, marginTop: -8 },
    faceFrame: {
      width: 200, height: 200, borderRadius: 100, alignSelf: 'center', overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center', backgroundColor: V6Colors.ink50,
      borderWidth: 1.5, borderStyle: 'dashed', borderColor: V6Colors.fieldBorder,
    },

    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
    summaryCheck: {
      width: 21, height: 21, borderRadius: 7,
      borderWidth: 1.5, borderColor: V6Colors.ink200,
      alignItems: 'center', justifyContent: 'center',
    },
    summaryCheckDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    summaryText: { color: V6Colors.ink800, fontFamily: 'Inter', fontSize: 15.5 },
    privacyNote: {
      flexDirection: 'row', gap: 10,
      backgroundColor: V6Colors.ink50, borderRadius: 12, padding: 13, marginTop: 12,
    },
    privacyText: { flex: 1, color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 14, lineHeight: 19 },
    stageText: { color: V6Colors.link, fontFamily: 'Inter', fontSize: 14.5, marginTop: 12, textAlign: 'center' },

    wizardActions: { flexDirection: 'row', gap: 10 },
    wizardPrimary: { flex: 1, marginTop: 0 },
    wizardPrimaryFull: { width: '100%' },
    backStepBtn: {
      paddingHorizontal: 22, borderRadius: 24, borderWidth: 1, borderColor: V6Colors.fieldBorder,
      alignItems: 'center', justifyContent: 'center',
    },
    backStepText: { color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 16.5, fontWeight: '700' },
    submitButton: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary,
      borderRadius: 24,
      paddingVertical: 15,
      marginTop: 4,
    },
    // Readable disabled state: grey fill with dark text instead of a faded button.
    submitButtonDisabled: { backgroundColor: V6Colors.ink100 },
    submitTextDisabled: { color: V6Colors.ink700 },
    submitText: { color: Colors.onPrimary, fontSize: 18.5, fontWeight: '700', fontFamily: 'Inter' },
    profileNotice: {
      backgroundColor: V6Colors.warningSurface, borderWidth: 1, borderColor: V6Colors.warningBorder,
      borderRadius: 14, padding: 14, gap: 4,
    },
    profileNoticeTitle: { color: V6Colors.warningText, fontFamily: 'Inter', fontSize: 15, fontWeight: '700' },
    profileNoticeBody: { color: V6Colors.ink700, fontFamily: 'Inter', fontSize: 14, lineHeight: 20 },
    errorText: { color: Colors.dangerText, fontFamily: 'Inter', fontSize: 15.5, textAlign: 'center' },
    retryHint: { color: V6Colors.ink500, fontFamily: 'Inter', fontSize: 14, textAlign: 'center' },

  });
  return { Colors, V6Colors, styles };
}
