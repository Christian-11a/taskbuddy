import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Award, ImagePlus } from 'lucide-react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import TextField from '../../../src/components/ui/TextField';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { api, type Credential, type CredentialType } from '../../../src/lib/api';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { requestAppPermission } from '../../../src/lib/permissions';
import { cleanText, textLength } from '../../../src/lib/textRules';
import { portfolioServices, PHOTO_MAX_BYTES } from './SPPortfolioScreen';

export const CREDENTIAL_TYPES: { key: CredentialType; label: string; issuer: string }[] = [
  { key: 'tesda_nc', label: 'TESDA NC', issuer: 'TESDA' },
  { key: 'prc_license', label: 'PRC licence', issuer: 'PRC' },
  { key: 'trade_certificate', label: 'Trade certificate', issuer: '' },
  { key: 'other', label: 'Other', issuer: '' },
];

const STATUS_LABEL: Record<Credential['status'], string> = {
  pending: 'Under review',
  approved: 'Certified',
  rejected: 'Not accepted',
  expired: 'Expired',
};

/** YYYY-MM-DD and a real calendar day. Empty is fine: not every credential expires. */
export function isValidExpiry(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

/** The first thing missing before a credential can be submitted, or null. */
export function credentialProblem(input: {
  hasPhoto: boolean;
  categoryId: number | null;
  title: string;
  issuer: string;
  expiresOn: string;
}): string | null {
  if (!input.hasPhoto) return 'Add a clear photo of the certificate.';
  if (!input.categoryId) return 'Choose the service this credential is for.';
  if (textLength(input.title) < 2) return 'Enter the certificate name, e.g. Plumbing NC II.';
  if (textLength(input.issuer) < 2) return 'Enter who issued it, e.g. TESDA.';
  if (!isValidExpiry(input.expiresOn)) return 'Enter the expiry date as YYYY-MM-DD, or leave it blank.';
  return null;
}

export default function SPCredentialsScreen({ onBack }: { onBack: () => void }) {
  const { styles, Colors, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const credentials = useAsyncData(() => api.myCredentials(), []);
  const { providerProfile } = useAuth();
  const services = portfolioServices(providerProfile);
  const [uri, setUri] = useState<string | null>(null);
  const [type, setType] = useState<CredentialType>('tesda_nc');
  const [category, setCategory] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [issuer, setIssuer] = useState('TESDA');
  const [number, setNumber] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Credential | null>(null);
  const selectedCategory = category ?? services[0]?.id ?? null;

  const reset = () => {
    setUri(null);
    setTitle('');
    setNumber('');
    setExpiresOn('');
  };

  const choose = async () => {
    setError(null);
    try {
      if (!(await requestAppPermission('gallery'))) {
        setError('Photo library access is required to add a certificate photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > PHOTO_MAX_BYTES) {
        setError('Choose a photo no larger than 10 MB.');
        return;
      }
      setUri(asset.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open your photos.');
    }
  };

  const submit = async () => {
    const problem = credentialProblem({ hasPhoto: !!uri, categoryId: selectedCategory, title, issuer, expiresOn });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const document_path = await api.uploadImage('provider-credentials', uri!);
      await api.createCredential({
        category_id: selectedCategory!,
        credential_type: type,
        title: cleanText(title),
        issuer: cleanText(issuer),
        credential_number: cleanText(number) || undefined,
        expires_on: expiresOn || undefined,
        document_path,
      });
      reset();
      credentials.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit this credential.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const entry = removing!;
    setRemoving(null);
    setBusy(true);
    try {
      await api.removeCredential(entry.id);
      credentials.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove this credential.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={V6Colors.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Certifications</Text>
      </View>
      <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Add a TESDA National Certificate, PRC licence or trade certificate for a service you offer. An admin checks
          it, then clients see a Certified badge on that service.
        </Text>

        <Text style={styles.label}>Type</Text>
        <View style={styles.chips}>
          {CREDENTIAL_TYPES.map((item) => {
            const selected = type === item.key;
            return (
              <Tap
                key={item.key}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => { setType(item.key); setIssuer(item.issuer); }}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
              </Tap>
            );
          })}
        </View>

        {services.length > 1 && (
          <>
            <Text style={styles.label}>Service</Text>
            <View style={styles.chips}>
              {services.map((item) => {
                const selected = selectedCategory === item.id;
                return (
                  <Tap
                    key={item.id}
                    disabled={busy}
                    accessibilityRole="radio"
                    accessibilityLabel={item.name}
                    accessibilityState={{ selected }}
                    onPress={() => setCategory(item.id)}
                    style={[styles.chip, selected && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.name}</Text>
                  </Tap>
                );
              })}
            </View>
          </>
        )}
        {services.length === 1 && <Text style={styles.label}>{`Service: ${services[0].name}`}</Text>}

        <TextField label="Certificate name" value={title} onChangeText={setTitle} maxLength={120} editable={!busy} keyboardAppearance={appearance} helper="e.g. Plumbing NC II" />
        <TextField label="Issued by" value={issuer} onChangeText={setIssuer} maxLength={120} editable={!busy} keyboardAppearance={appearance} />
        <TextField label="Certificate number (optional)" value={number} onChangeText={setNumber} maxLength={60} editable={!busy} keyboardAppearance={appearance} />
        <TextField label="Expiry date (optional)" value={expiresOn} onChangeText={setExpiresOn} maxLength={10} editable={!busy} keyboardAppearance={appearance} helper="YYYY-MM-DD" placeholder="2028-12-31" />

        {uri ? (
          <Tap disabled={busy} onPress={() => void choose()} accessibilityRole="button" accessibilityLabel="Change certificate photo">
            <Image source={{ uri }} style={styles.preview} resizeMode="contain" accessible accessibilityLabel="Selected certificate photo" />
          </Tap>
        ) : (
          <Tap disabled={busy} onPress={() => void choose()} style={styles.pickTile} accessibilityRole="button" accessibilityLabel="Add certificate photo">
            <ImagePlus size={28} color={Colors.link} />
            <Text style={styles.pickText}>Add certificate photo</Text>
          </Tap>
        )}

        {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}

        <Text style={[styles.label, styles.listTitle]} accessibilityRole="header">Your credentials</Text>
        {credentials.loading && !credentials.data && <ContentSkeleton variant="list" />}
        {!!credentials.error && (
          <LoadErrorCard title="Couldn't load your credentials" message={credentials.error} onRetry={credentials.reload} />
        )}
        {credentials.data?.length === 0 && <Text style={styles.intro}>No credentials yet.</Text>}
        {credentials.data?.map((item) => (
          <View key={item.id} style={styles.card} testID={`credential-${item.id}`}>
            <Award size={22} color={item.status === 'approved' ? Colors.primary : V6Colors.ink500} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {[item.issuer, item.service_categories?.name, item.expires_on && `until ${item.expires_on}`].filter(Boolean).join(' · ')}
              </Text>
              <Text style={[styles.status, item.status === 'approved' && styles.statusOk]}>{STATUS_LABEL[item.status]}</Text>
              {item.status === 'rejected' && !!item.rejection_reason && (
                <Text style={styles.cardMeta}>{item.rejection_reason}</Text>
              )}
            </View>
            {item.status !== 'approved' && (
              <Tap disabled={busy} onPress={() => setRemoving(item)} accessibilityRole="button" accessibilityLabel={`Remove ${item.title}`}>
                <Text style={styles.link}>Remove</Text>
              </Tap>
            )}
          </View>
        ))}
      </KeyboardAwareScrollView>

      <BottomActionBar
        primaryLabel={busy ? 'Submitting…' : 'Submit for review'}
        onPrimary={() => void submit()}
        busy={busy}
        primaryDisabled={busy}
      />

      <ConfirmationModal
        visible={removing !== null}
        title="Remove credential?"
        message="This withdraws it from review."
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
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
      backgroundColor: V6Colors.surface, paddingHorizontal: 20, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, color: V6Colors.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: 24, gap: 14 },
    intro: { color: V6Colors.ink500, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    label: { color: V6Colors.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    listTitle: { marginTop: 8, fontSize: 15, color: V6Colors.ink900 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center',
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
    chipText: { color: V6Colors.ink700, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
    chipTextOn: { color: Colors.onPrimary, fontWeight: '700' },
    pickTile: {
      alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 140,
      borderRadius: 16, backgroundColor: Colors.primaryTonal,
    },
    pickText: { color: Colors.link, fontSize: 15, fontWeight: '600', lineHeight: 20, fontFamily: 'Inter' },
    preview: { height: 180, width: '100%', borderRadius: 16, backgroundColor: V6Colors.ink100 },
    card: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    cardText: { flex: 1, gap: 2 },
    cardTitle: { color: V6Colors.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    cardMeta: { color: V6Colors.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    status: { color: V6Colors.ink700, fontSize: 13, fontWeight: '700', fontFamily: 'Inter', marginTop: 2 },
    statusOk: { color: Colors.primary },
    link: { color: Colors.link, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
    errorText: { color: Colors.dangerText, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
