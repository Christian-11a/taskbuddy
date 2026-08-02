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
  ShieldCheck,
} from 'lucide-react-native';
import { api } from '../../../src/lib/api';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { shortDate } from '../../../src/lib/format';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';

interface SPVerificationScreenProps {
  onBack: () => void;
}

type Slot = 'id' | 'selfie';

/**
 * Provider identity verification (backlog #9). Two images go to the private
 * `verification-docs` bucket via signed upload URLs; the API only ever sees the
 * resulting storage paths. An admin reviews them in the web console.
 */
export default function SPVerificationScreen({ onBack }: SPVerificationScreenProps) {
  const [idAsset, setIdAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selfieAsset, setSelfieAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      quality: 0.8,
    });
    if (result.canceled) return;
    setError(null);
    if (slot === 'id') setIdAsset(result.assets[0]);
    else setSelfieAsset(result.assets[0]);
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
          <BadgeCheck size={20} color={Colors.success} />
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
          <Clock size={20} color={Colors.warning} />
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
        <CircleAlert size={20} color={Colors.error} />
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
            <Icon size={26} color={Colors.brandTeal} />
            <Text style={styles.dropzoneText}>Tap to choose a photo</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Get Verified</Text>
          <View style={styles.headerSpacer} />
        </View>
        <Text style={styles.headerSubtitle}>Build trust with clients</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color={Colors.brandTeal} style={styles.loader} />
        ) : (
          <>
            {renderStatus()}

            <View style={styles.notice}>
              <ShieldCheck size={20} color={Colors.brandTeal} />
              <Text style={styles.noticeText}>
                Your documents are stored privately and are only visible to TaskBuddy admins
                reviewing your account.
              </Text>
            </View>

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
    backgroundColor: Colors.brandDark,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: Colors.white, fontSize: 18, fontWeight: '800', fontFamily: 'Inter' },
  headerSpacer: { width: 40 },
  headerSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 13, fontFamily: 'Inter' },
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
    fontSize: 14,
    fontWeight: '800',
  },
  statusBody: { color: Colors.slate, fontFamily: 'Inter', fontSize: 13, lineHeight: 19 },
  notice: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 14,
    padding: 14,
  },
  noticeText: { flex: 1, color: Colors.slate, fontFamily: 'Inter', fontSize: 13, lineHeight: 19 },
  card: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 18, ...Shadows.card },
  label: { color: Colors.brandDark, fontFamily: 'Inter', fontSize: 15, fontWeight: '800' },
  hint: { color: Colors.muted, fontFamily: 'Inter', fontSize: 13, marginTop: 4, marginBottom: 14 },
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
  dropzoneText: { color: Colors.muted, fontFamily: 'Inter', fontSize: 13 },
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
  submitText: { color: Colors.white, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  errorText: { color: Colors.error, fontFamily: 'Inter', fontSize: 13, textAlign: 'center' },
});
