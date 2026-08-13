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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Check,
  CircleAlert,
  Clock,
  IdCard,
  ImageIcon,
  Lock,
  ScanFace,
  ShieldCheck,
} from 'lucide-react-native';
import { api, ApiError } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { shortDate } from '../../../src/lib/format';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const Colors = {
  ...V6Colors,
  background: V6Colors.canvas,
  backgroundAlt: V6Colors.ink50,
  brandDark: V6Colors.ink900,
  brandTeal: V6Colors.cyan700,
  slate: V6Colors.ink500,
  muted: V6Colors.ink400,
  error: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
} as const;
const Radii = { card: V6Radii.card };
const Shadows = { card: V6Shadows.sm };

/** Stripe's decision comes by webhook; poll for it, but not forever. */
const POLL_INTERVAL_MS = 4000;
const POLL_ATTEMPTS = 8;

const STEPS = ['Government ID', 'Face Scan', 'Automated Check'];

interface SPVerificationScreenProps {
  onBack: () => void;
  /**
   * Called when the provider taps through after being approved — refreshes the
   * auth profile (so the dashboard's "Get Verified" banner disappears) and
   * returns to the dashboard.
   */
  onVerified?: () => Promise<void>;
}

type Slot = 'id' | 'selfie';

export default function SPVerificationScreen({ onBack, onVerified }: SPVerificationScreenProps) {
  const [step, setStep] = useState(1);
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

  const pick = async (slot: Slot) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Allow photo library access to upload your documents.');
      return;
    }
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
    if (slot === 'id') setIdAsset(asset);
    else setSelfieAsset(asset);
  };

  /** Camera capture — the selfie should be a live shot, not a saved photo. */
  const takeSelfie = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Allow camera access to take your selfie.');
      return;
    }
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
        });
        if (session.url) {
          // Expo Go cannot load Stripe's native SDK, so the hosted flow in a
          // browser is the route that works in every build of this app.
          await WebBrowser.openBrowserAsync(session.url);
        }
        pollForResult(POLL_ATTEMPTS);
      } catch (identityError) {
        // The API creates its row only after Stripe answers, so a failure here
        // has left nothing behind and the manual queue is still open to us.
        if (!(identityError instanceof ApiError)) throw identityError;
        await api.submitVerification({ id_document_path, selfie_path });
        setFellBackToManual(true);
      }

      setIdAsset(null);
      setSelfieAsset(null);
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
  const inWizard = !isPending && !isApproved;

  const canAdvance =
    (step === 1 && !!idAsset) || (step === 2 && !!selfieAsset) || step === 3;

  const renderStatus = () => {
    if (!verification) return null;
    if (isApproved) {
      return (
        <View style={[styles.status, styles.statusApproved]}>
          <BadgeCheck size={22} color={Colors.success} />
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
          <Clock size={22} color={Colors.warning} />
          <View style={styles.statusTextBox}>
            <Text style={styles.statusTitle}>Pending verification</Text>
            <Text style={styles.statusBody}>
              Submitted {shortDate(verification.submitted_at)}.{' '}
              {verification.method === 'stripe_identity' && !fellBackToManual
                ? 'The automated check is running — this usually takes a couple of minutes. You can leave this screen; we’ll notify you when it finishes.'
                : 'A TaskBuddy admin is reviewing your documents. We’ll notify you when it’s done.'}
            </Text>
            <TouchableOpacity onPress={reload} activeOpacity={0.8}>
              <Text style={styles.statusAction}>Check again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.status, styles.statusRejected]}>
        <CircleAlert size={22} color={Colors.error} />
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
      <TouchableOpacity
        style={styles.submitButton}
        onPress={goToDashboard}
        disabled={continuing}
        activeOpacity={0.85}
      >
        {continuing ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.submitText}>Go to Dashboard</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={Colors.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Get Verified</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Stepper — only while there is something to step through. */}
      {inWizard && !loading && (
        <View style={styles.stepperWrap}>
          <View style={styles.stepper}>
            {STEPS.map((label, i) => (
              <View key={label} style={[styles.stepPill, i < step && styles.stepPillDone]} />
            ))}
          </View>
          <Text style={styles.stepperLabel}>
            Step {step} of {STEPS.length} · {STEPS[step - 1]}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.brandTeal} style={styles.loader} />
        ) : (
          <>
            {renderStatus()}

            {isApproved && (
              <View style={styles.notice}>
                <ShieldCheck size={22} color={Colors.brandTeal} />
                <Text style={styles.noticeText}>
                  Your documents are stored privately and are only visible to TaskBuddy
                  admins reviewing your account.
                </Text>
              </View>
            )}

            {renderApprovedContinue()}
            {isApproved && error && <Text style={styles.errorText}>{error}</Text>}

            {inWizard && (
              <>
                {/* ── Step 1 · Government ID ─────────────────────────── */}
                {step === 1 && (
                  <View style={styles.card}>
                    <Text style={styles.label}>Government ID</Text>
                    <Text style={styles.hint}>
                      A clear photo of a valid ID showing your full name and photo —
                      UMID, driver&apos;s licence, passport, PhilSys, or postal ID.
                    </Text>
                    <TouchableOpacity
                      style={styles.dropzone}
                      onPress={() => void pick('id')}
                      activeOpacity={0.8}
                    >
                      {idAsset ? (
                        <Image source={{ uri: idAsset.uri }} style={styles.preview} resizeMode="cover" />
                      ) : (
                        <>
                          <IdCard size={29} color={Colors.brandTeal} />
                          <Text style={styles.dropzoneText}>Tap to choose a photo</Text>
                          <Text style={styles.dropzoneSubtext}>Max 5 MB · JPG, PNG</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {!!idAsset && (
                      <TouchableOpacity
                        style={styles.galleryBtn}
                        onPress={() => void pick('id')}
                        activeOpacity={0.8}
                      >
                        <ImageIcon size={18} color={Colors.muted} />
                        <Text style={styles.galleryBtnText}>Choose a different photo</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* ── Step 2 · Face scan ─────────────────────────────── */}
                {step === 2 && (
                  <View style={styles.card}>
                    <Text style={styles.label}>Face Scan</Text>
                    <Text style={styles.hint}>
                      Take a selfie holding the same ID. Good light, no hat or sunglasses
                      — this is matched against the ID photo.
                    </Text>
                    <TouchableOpacity
                      style={[styles.dropzone, styles.selfieDropzonePrimary]}
                      onPress={() => void takeSelfie()}
                      activeOpacity={0.8}
                    >
                      {selfieAsset ? (
                        <Image source={{ uri: selfieAsset.uri }} style={styles.preview} resizeMode="cover" />
                      ) : (
                        <>
                          <ScanFace size={30} color={Colors.brandTeal} />
                          <Text style={styles.dropzoneText}>Take a selfie</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.galleryBtn}
                      onPress={() => (selfieAsset ? void takeSelfie() : void pick('selfie'))}
                      activeOpacity={0.8}
                    >
                      {!selfieAsset && <ImageIcon size={18} color={Colors.muted} />}
                      <Text style={styles.galleryBtnText}>
                        {selfieAsset ? 'Retake' : 'Choose from gallery'}
                      </Text>
                    </TouchableOpacity>
                  </View>
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
                        {!!idAsset && <Check size={13} color={Colors.white} strokeWidth={3} />}
                      </View>
                      <Text style={styles.summaryText}>Government ID ready</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <View style={[styles.summaryCheck, selfieAsset && styles.summaryCheckDone]}>
                        {!!selfieAsset && <Check size={13} color={Colors.white} strokeWidth={3} />}
                      </View>
                      <Text style={styles.summaryText}>Face scan ready</Text>
                    </View>

                    <View style={styles.privacyNote}>
                      <Lock size={18} color={Colors.brandTeal} />
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

                <View style={styles.wizardActions}>
                  {step > 1 && (
                    <TouchableOpacity
                      style={styles.backStepBtn}
                      onPress={() => setStep((s) => s - 1)}
                      activeOpacity={0.85}
                      disabled={submitting}
                    >
                      <Text style={styles.backStepText}>Back</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.submitButton,
                      styles.wizardPrimary,
                      step === 1 && styles.wizardPrimaryFull,
                      !canAdvance && styles.submitButtonDisabled,
                    ]}
                    onPress={() => (step === 3 ? void startVerification() : setStep((s) => s + 1))}
                    activeOpacity={0.85}
                    disabled={!canAdvance || submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.submitText}>
                        {step === 3 ? 'Start Verification' : 'Next'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backButton: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, color: Colors.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

  stepperWrap: { backgroundColor: Colors.white, paddingHorizontal: Spacing.screenH, paddingBottom: 14 },
  stepper: { flexDirection: 'row', gap: 5 },
  stepPill: { flex: 1, height: 5, borderRadius: 3, backgroundColor: Colors.ink100 },
  stepPillDone: { backgroundColor: Colors.cyan600 },
  stepperLabel: { color: Colors.muted, fontSize: 12.5, fontFamily: 'Inter', marginTop: 8 },

  content: { padding: Spacing.screenH, gap: 16 },
  loader: { marginTop: 40 },
  status: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  statusApproved: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  statusPending: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  statusRejected: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  statusTextBox: { flex: 1, gap: 3 },
  statusTitle: {
    color: Colors.brandDark,
    fontFamily: 'Inter',
    fontSize: 16.5,
    fontWeight: '800',
  },
  statusBody: { color: Colors.slate, fontFamily: 'Inter', fontSize: 15.5, lineHeight: 19 },
  statusAction: { color: Colors.brandTeal, fontFamily: 'Inter', fontSize: 15, fontWeight: '700', marginTop: 6 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 14,
    padding: 14,
  },
  noticeText: { flex: 1, color: Colors.slate, fontFamily: 'Inter', fontSize: 15.5, lineHeight: 19 },
  card: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 18, ...Shadows.card },
  label: { color: Colors.brandDark, fontFamily: 'Inter', fontSize: 18.5, fontWeight: '800' },
  hint: { color: Colors.muted, fontFamily: 'Inter', fontSize: 15.5, marginTop: 4, marginBottom: 14, lineHeight: 20 },
  dropzone: {
    height: 150,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(144,153,184,0.5)',
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  dropzoneText: { color: Colors.muted, fontFamily: 'Inter', fontSize: 15.5 },
  dropzoneSubtext: { color: Colors.muted, fontFamily: 'Inter', fontSize: 13.5, marginTop: 2 },
  preview: { width: '100%', height: '100%' },
  selfieDropzonePrimary: { height: 190 },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  summaryCheck: {
    width: 21, height: 21, borderRadius: 7,
    borderWidth: 1.5, borderColor: '#cbd5e1',
    alignItems: 'center', justifyContent: 'center',
  },
  summaryCheckDone: { backgroundColor: Colors.brandTeal, borderColor: Colors.brandTeal },
  summaryText: { color: Colors.ink800, fontFamily: 'Inter', fontSize: 15.5 },
  privacyNote: {
    flexDirection: 'row', gap: 10,
    backgroundColor: Colors.backgroundAlt, borderRadius: 12, padding: 13, marginTop: 12,
  },
  privacyText: { flex: 1, color: Colors.slate, fontFamily: 'Inter', fontSize: 14, lineHeight: 19 },
  stageText: { color: Colors.brandTeal, fontFamily: 'Inter', fontSize: 14.5, marginTop: 12, textAlign: 'center' },

  wizardActions: { flexDirection: 'row', gap: 10 },
  wizardPrimary: { flex: 1, marginTop: 0 },
  wizardPrimaryFull: { width: '100%' },
  backStepBtn: {
    paddingHorizontal: 22, borderRadius: 24, borderWidth: 1, borderColor: '#dce3e9',
    alignItems: 'center', justifyContent: 'center',
  },
  backStepText: { color: Colors.ink700, fontFamily: 'Inter', fontSize: 16.5, fontWeight: '700' },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brandTeal,
    borderRadius: 24,
    paddingVertical: 15,
    marginTop: 4,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitText: { color: Colors.white, fontSize: 18.5, fontWeight: '700', fontFamily: 'Inter' },
  errorText: { color: Colors.error, fontFamily: 'Inter', fontSize: 15.5, textAlign: 'center' },
  retryHint: { color: Colors.muted, fontFamily: 'Inter', fontSize: 14, textAlign: 'center' },

  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(144,153,184,0.3)',
    backgroundColor: Colors.backgroundAlt,
    marginTop: 8,
  },
  galleryBtnText: {
    color: Colors.muted,
    fontFamily: 'Inter',
    fontSize: 15.5,
  },
});
