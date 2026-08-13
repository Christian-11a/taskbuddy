/**
 * SPVerificationScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-credential screen's flat
 * white .topbar (not a colored hero).
 *
 * Deviation: the mockup drives this screen through a multi-step JS wizard
 * (`cred-stepper`/`credNext()`) with demo-only step content. This app's real
 * verification flow is a single-screen 2-slot upload (Government ID +
 * selfie) backed by a real endpoint (`api.submitVerification`) and real
 * admin-reviewed status (pending/approved/rejected) — kept as-is since it's
 * the actual, working flow rather than the mockup's unbacked demo steps.
 */

import React, { useCallback, useState } from 'react';
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
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  CircleAlert,
  Clock,
  IdCard,
  ImageIcon,
  ShieldCheck,
} from 'lucide-react-native';
import { api } from '../../../src/lib/api';
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

/**
 * Provider identity verification (backlog #9). Two images go to the private
 * `verification-docs` bucket via signed upload URLs; the API only ever sees the
 * resulting storage paths. An admin reviews them in the web console.
 */
export default function SPVerificationScreen({ onBack, onVerified }: SPVerificationScreenProps) {
  const [idAsset, setIdAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selfieAsset, setSelfieAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);

  const {
    data: verification,
    loading,
    reload,
  } = useAsyncData(useCallback(() => api.myVerification(), []));

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

  /** Camera capture — used for the selfie slot to encourage a live shot. */
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

  const submit = async () => {
    if (!idAsset || !selfieAsset) return;
    setSubmitting(true);
    setError(null);
    try {
      const [id_document_path, selfie_path] = await Promise.all([
        api.uploadImage('verification-docs', idAsset.uri),
        api.uploadImage('verification-docs', selfieAsset.uri),
      ]);
      await api.submitVerification({ id_document_path, selfie_path });
      setIdAsset(null);
      setSelfieAsset(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit your documents.');
    } finally {
      setSubmitting(false);
    }
  };

  // A pending submission is terminal for the UI — only one review may be open.
  const isPending = verification?.status === 'pending';
  const isApproved = verification?.status === 'approved';
  const canSubmit = !!idAsset && !!selfieAsset && !submitting && !isPending && !isApproved;

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
            <Text style={styles.statusTitle}>Under review</Text>
            <Text style={styles.statusBody}>
              Submitted {shortDate(verification.submitted_at)}. We&apos;ll notify you once an
              admin has reviewed it.
            </Text>
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
            {verification.rejection_reason ?? 'Your documents were rejected.'} You can upload
            new documents below.
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

  const renderSlot = (
    slot: Slot,
    label: string,
    hint: string,
    asset: ImagePicker.ImagePickerAsset | null,
    Icon: typeof IdCard,
  ) => (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
      {slot === 'selfie' ? (
        // Selfie: show camera (primary) + gallery (secondary) options
        <View style={styles.selfieActions}>
          <TouchableOpacity
            style={[styles.dropzone, styles.selfieDropzonePrimary]}
            onPress={takeSelfie}
            disabled={isPending || isApproved}
            activeOpacity={0.8}
          >
            {selfieAsset ? (
              <Image source={{ uri: selfieAsset.uri }} style={styles.preview} resizeMode="cover" />
            ) : (
              <>
                <Camera size={29} color={Colors.brandTeal} />
                <Text style={styles.dropzoneText}>Take a selfie</Text>
              </>
            )}
          </TouchableOpacity>
          {!selfieAsset && (
            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={() => pick('selfie')}
              disabled={isPending || isApproved}
              activeOpacity={0.8}
            >
              <ImageIcon size={18} color={Colors.muted} />
              <Text style={styles.galleryBtnText}>Choose from gallery</Text>
            </TouchableOpacity>
          )}
          {selfieAsset && (
            <TouchableOpacity
              style={styles.galleryBtn}
              onPress={() => setSelfieAsset(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.galleryBtnText}>Retake</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        // Govt ID: gallery only
        <TouchableOpacity
          style={styles.dropzone}
          onPress={() => pick(slot)}
          disabled={isPending || isApproved}
          activeOpacity={0.8}
        >
          {asset ? (
            <Image source={{ uri: asset.uri }} style={styles.preview} resizeMode="cover" />
          ) : (
            <>
              <Icon size={29} color={Colors.brandTeal} />
              <Text style={styles.dropzoneText}>Tap to choose a photo</Text>
              <Text style={styles.dropzoneSubtext}>Max 5 MB · JPG, PNG</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={Colors.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Get Verified</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.brandTeal} style={styles.loader} />
        ) : (
          <>
            {renderStatus()}

            <View style={styles.notice}>
              <ShieldCheck size={22} color={Colors.brandTeal} />
              <Text style={styles.noticeText}>
                Your documents are stored privately and are only visible to TaskBuddy admins
                reviewing your account.
              </Text>
            </View>

            {renderApprovedContinue()}
            {isApproved && error && <Text style={styles.errorText}>{error}</Text>}

            {!isApproved && !isPending && (
              <>
                {renderSlot(
                  'id',
                  'Government ID',
                  'A clear photo of a valid ID showing your full name.',
                  idAsset,
                  IdCard,
                )}
                {renderSlot(
                  'selfie',
                  'Selfie',
                  'A photo of your face, holding the same ID.',
                  selfieAsset,
                  Camera,
                )}

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
                  onPress={submit}
                  disabled={!canSubmit}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Text style={styles.submitText}>Submit for Review</Text>
                  )}
                </TouchableOpacity>
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
  hint: { color: Colors.muted, fontFamily: 'Inter', fontSize: 15.5, marginTop: 4, marginBottom: 14 },
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
  preview: { width: '100%', height: '100%' },
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

  // Selfie slot extras
  selfieActions: { gap: 8 },
  selfieDropzonePrimary: { height: 160 },
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
  },
  galleryBtnText: {
    color: Colors.muted,
    fontFamily: 'Inter',
    fontSize: 15.5,
  },
  dropzoneSubtext: {
    color: Colors.muted,
    fontFamily: 'Inter',
    fontSize: 13.5,
    marginTop: 2,
  },
});
