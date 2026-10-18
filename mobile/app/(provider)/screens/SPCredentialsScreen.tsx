import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Award, Calendar, Check, CircleAlert, ImagePlus } from 'lucide-react-native';
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
import { useScrollToFirstError } from '../../../src/hooks/useScrollToFirstError';
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

export type CredentialField = 'photo' | 'title' | 'issuer' | 'expiry';
const FIELD_ORDER: readonly CredentialField[] = ['photo', 'title', 'issuer', 'expiry'];

/** Per-field messages, shown under each field after Submit. */
export function credentialErrors(input: {
  hasPhoto: boolean;
  title: string;
  issuer: string;
  expiresOn: string;
}): Partial<Record<CredentialField, string>> {
  const errors: Partial<Record<CredentialField, string>> = {};
  if (!input.hasPhoto) errors.photo = 'Add a clear photo of the certificate.';
  if (textLength(input.title) < 2) errors.title = 'Enter the certificate name, e.g. Plumbing NC II.';
  if (textLength(input.issuer) < 2) errors.issuer = 'Enter who issued it, e.g. TESDA.';
  if (!isValidExpiry(input.expiresOn)) errors.expiry = 'Pick the expiry date again, or clear it.';
  return errors;
}

/** A picked day as YYYY-MM-DD in the phone's own calendar, the format the API takes. */
export function formatExpiry(day: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${two(day.getMonth() + 1)}-${two(day.getDate())}`;
}

function parseExpiry(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CredentialField, string>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sent, setSent] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);
  const { scrollRef, fieldLayout, inputRef, scrollToFirstError } = useScrollToFirstError(FIELD_ORDER);
  const clearError = (field: CredentialField) => setFieldErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous));
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
      clearError('photo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open your photos.');
    }
  };

  const submit = async () => {
    setSent(false);
    const errors = credentialErrors({ hasPhoto: !!uri, title, issuer, expiresOn });
    setSubmitted(true);
    setFieldErrors(errors);
    const problem = credentialProblem({ hasPhoto: !!uri, categoryId: selectedCategory, title, issuer, expiresOn });
    if (problem) {
      // Field errors cover everything but a missing service, which has no field of its own.
      setError(Object.keys(errors).length ? null : problem);
      scrollToFirstError(errors);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const document_path = await api.uploadImage('provider-credentials', uri!);
      const created = await api.createCredential({
        category_id: selectedCategory!,
        credential_type: type,
        title: cleanText(title),
        issuer: cleanText(issuer),
        credential_number: cleanText(number) || undefined,
        expires_on: expiresOn || undefined,
        document_path,
      });
      reset();
      setSubmitted(false);
      setFieldErrors({});
      setSent(true);
      setNewId((created as { id?: string } | undefined)?.id ?? null);
      credentials.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit this credential.');
    } finally {
      setBusy(false);
    }
  };

  const onDateChange = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === 'android') setShowDate(false);
    if (event.type === 'set' && picked) {
      setExpiresOn(formatExpiry(picked));
      clearError('expiry');
    }
  };

  /** Fills the form from a rejected credential so only the fix and a new photo are left. */
  const resubmit = (item: Credential) => {
    setType(item.credential_type);
    setCategory(item.category_id);
    setTitle(item.title);
    setIssuer(item.issuer);
    setNumber(item.credential_number ?? '');
    setExpiresOn(item.expires_on && parseExpiry(item.expires_on) >= new Date() ? item.expires_on : '');
    setUri(null);
    setError(null);
    setSent(false);
    setSubmitted(false);
    setFieldErrors({});
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

        <View onLayout={fieldLayout('photo')} style={styles.fieldBlock}>
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
          {!!fieldErrors.photo && (
            <View style={styles.errorRow}>
              <CircleAlert size={14} color={Colors.dangerText} />
              <Text accessibilityRole="alert" style={styles.errorText}>{fieldErrors.photo}</Text>
            </View>
          )}
        </View>

        <View onLayout={fieldLayout('title')}>
          <TextField ref={inputRef('title')} label="Certificate name" value={title} onChangeText={(t) => { setTitle(t); clearError('title'); }} maxLength={120} editable={!busy} keyboardAppearance={appearance} helper="e.g. Plumbing NC II" error={fieldErrors.title} submitted={submitted} />
        </View>
        <View onLayout={fieldLayout('issuer')}>
          <TextField ref={inputRef('issuer')} label="Issued by" value={issuer} onChangeText={(t) => { setIssuer(t); clearError('issuer'); }} maxLength={120} editable={!busy} keyboardAppearance={appearance} error={fieldErrors.issuer} submitted={submitted} />
        </View>
        <TextField label="Certificate number (optional)" value={number} onChangeText={setNumber} maxLength={60} editable={!busy} keyboardAppearance={appearance} />

        <View onLayout={fieldLayout('expiry')} style={styles.fieldBlock}>
          <Text style={styles.label}>Expiry date (optional)</Text>
          <View style={styles.dateRow}>
            <Tap
              disabled={busy}
              onPress={() => setShowDate(true)}
              style={[styles.dateField, !!fieldErrors.expiry && styles.dateFieldError]}
              accessibilityRole="button"
              accessibilityLabel="Expiry date"
              accessibilityValue={{ text: expiresOn || 'Not set' }}
            >
              <Calendar size={18} color={V6Colors.ink500} />
              <Text style={styles.dateText}>{expiresOn || 'Pick a date'}</Text>
            </Tap>
            {!!expiresOn && (
              <Tap disabled={busy} onPress={() => { setExpiresOn(''); setShowDate(false); }} accessibilityRole="button" accessibilityLabel="Clear expiry date">
                <Text style={styles.link}>Clear</Text>
              </Tap>
            )}
          </View>
          {!!fieldErrors.expiry && (
            <View style={styles.errorRow}>
              <CircleAlert size={14} color={Colors.dangerText} />
              <Text accessibilityRole="alert" style={styles.errorText}>{fieldErrors.expiry}</Text>
            </View>
          )}
          {showDate && (
            <DateTimePicker
              themeVariant={appearance}
              testID="expiry-picker"
              value={parseExpiry(expiresOn)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={new Date()}
              onChange={onDateChange}
            />
          )}
          {showDate && Platform.OS === 'ios' && (
            <Tap onPress={() => setShowDate(false)} accessibilityRole="button" accessibilityLabel="Done picking date" style={styles.linkBtn}>
              <Text style={styles.link}>Done</Text>
            </Tap>
          )}
        </View>

        {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}
        {sent && (
          <View style={styles.sentRow} testID="sent-confirmation">
            <Check size={16} color={Colors.primary} />
            <Text accessibilityLiveRegion="polite" style={styles.sentText}>Sent for review</Text>
          </View>
        )}

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
