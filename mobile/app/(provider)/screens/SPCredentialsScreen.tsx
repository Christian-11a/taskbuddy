import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Award } from 'lucide-react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import ContentSkeleton from '../../../src/components/ui/ContentSkeleton';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import LoadErrorCard from '../../../src/components/ui/LoadErrorCard';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { api, type Credential } from '../../../src/lib/api';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useScrollToFirstError } from '../../../src/hooks/useScrollToFirstError';
import { portfolioServices } from './SPPortfolioScreen';
import CertificateUploadForm, {
  CERTIFICATE_FIELD_ORDER,
  CREDENTIAL_TYPES,
  credentialErrors,
  credentialProblem,
  formatExpiry,
  isValidExpiry,
  type CertificateUploadFormHandle,
} from '../../../src/components/CertificateUploadForm';
import { CertificateExpiryNotice } from '../../../src/components/CertificateNotices';

// The form's rules moved to the shared component; they stay importable from here.
export { CREDENTIAL_TYPES, credentialErrors, credentialProblem, formatExpiry, isValidExpiry };
export type { CredentialField } from '../../../src/components/CertificateUploadForm';

const STATUS_LABEL: Record<Credential['status'], string> = {
  pending: 'Under review',
  approved: 'Certified',
  rejected: 'Not accepted',
  expired: 'Expired',
};

export default function SPCredentialsScreen({ onBack }: { onBack: () => void }) {
  const { styles, Colors, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const credentials = useAsyncData(() => api.myCredentials(), []);
  const { providerProfile } = useAuth();
  const services = portfolioServices(providerProfile);
  const [busy, setBusy] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Credential | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  /** The service "Upload renewal" asked for; the form starts on it. */
  const [renewFor, setRenewFor] = useState<number | null>(null);
  const formRef = useRef<CertificateUploadFormHandle>(null);
  const scroll = useScrollToFirstError(CERTIFICATE_FIELD_ORDER);
  const { scrollRef } = scroll;
  const serviceNames: Record<number, string | undefined> = {};
  for (const item of services) serviceNames[item.id] = item.name;
  for (const item of credentials.data ?? []) {
    if (item.service_categories) serviceNames[item.category_id] ??= item.service_categories.name;
  }

  // The form starts on the first service without a valid certificate (chips still let the provider change it).
  const today = formatExpiry(new Date());
  const firstUncovered = credentials.data
    ? services.find((item) => !credentials.data!.some(
        (c) => c.category_id === item.id && c.status === 'approved' && (!c.expires_on || c.expires_on >= today),
      ))?.id ?? null
    : null;

  /** Fills the form from a rejected credential so only the fix and a new photo are left. */
  const resubmit = (item: Credential) => {
    formRef.current?.prefill(item);
    setError(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const renew = (categoryId: number) => {
    setRenewFor(categoryId);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
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
      <KeyboardAwareScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Add a TESDA National Certificate, PRC licence or trade certificate for each service you offer. An admin checks
          it. You can send proposals for a service once your ID and that service's certificate are approved.
        </Text>

        <CertificateExpiryNotice credentials={credentials.data} serviceNames={serviceNames} onRenew={renew} />

        <CertificateUploadForm
          ref={formRef}
          scroll={scroll}
          categoryId={renewFor ?? firstUncovered}
          onBusyChange={setFormBusy}
          onSubmitted={(created) => {
            setNewId(created?.id ?? null);
            credentials.reload();
          }}
        />
        {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}

        <Text style={[styles.label, styles.listTitle]} accessibilityRole="header">Your credentials</Text>
        {credentials.loading && !credentials.data && <ContentSkeleton variant="list" />}
        {!!credentials.error && (
          <LoadErrorCard title="Couldn't load your credentials" message={credentials.error} onRetry={credentials.reload} />
        )}
        {credentials.data?.length === 0 && <Text style={styles.intro}>No credentials yet.</Text>}
        {credentials.data?.map((item) => (
          <View
            key={item.id}
            style={styles.card}
            testID={`credential-${item.id}`}
            onLayout={(event) => {
              if (newId && item.id === newId) {
                scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 12), animated: true });
                setNewId(null);
              }
            }}
          >
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
            {item.status === 'rejected' && (
              <Tap disabled={busy} onPress={() => resubmit(item)} accessibilityRole="button" accessibilityLabel={`Resubmit ${item.title}`}>
                <Text style={styles.link}>Resubmit</Text>
              </Tap>
            )}
            {item.status !== 'approved' && (
              <Tap disabled={busy} onPress={() => setRemoving(item)} accessibilityRole="button" accessibilityLabel={`Remove ${item.title}`}>
                <Text style={styles.link}>Remove</Text>
              </Tap>
            )}
          </View>
        ))}
      </KeyboardAwareScrollView>

      <BottomActionBar
        primaryLabel={busy || formBusy ? 'Submitting…' : 'Submit for review'}
        onPrimary={() => void formRef.current?.submit()}
        busy={busy || formBusy}
        primaryDisabled={busy || formBusy}
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
    fieldBlock: { gap: 8 },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    dateField: {
      flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
      borderRadius: 12, borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    dateFieldError: { borderColor: Colors.dangerText },
    dateText: { color: V6Colors.ink900, fontSize: 15, lineHeight: 20, fontFamily: 'Inter' },
    linkBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
    sentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sentText: { color: Colors.primary, fontSize: 14, fontWeight: '700', lineHeight: 20, fontFamily: 'Inter' },
    errorText: { color: Colors.dangerText, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
