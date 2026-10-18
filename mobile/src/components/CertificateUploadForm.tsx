/**
 * CertificateUploadForm.tsx
 *
 * The certificate upload form shared by the Certifications screen and the Get
 * verified flow: type, service, photo, name, issuer, number and expiry date, with
 * a message under each field that needs fixing. The parent owns the scroll view
 * (pass its `useScrollToFirstError` result as `scroll`) and the submit button: it
 * calls `ref.submit()` and reads `onBusyChange`, so the button can live in its
 * bottom bar. A successful submit creates the credential through the existing
 * credentials API and calls `onSubmitted`.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Calendar, Check, CircleAlert, ImagePlus } from 'lucide-react-native';
import Tap from './ui/Tap';
import TextField from './ui/TextField';
import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api, type Credential, type CredentialType } from '../lib/api';
import { requestAppPermission } from '../lib/permissions';
import { cleanText, textLength } from '../lib/textRules';
import { certificateGuidance } from '../lib/verificationStatus';
import type { useScrollToFirstError } from '../hooks/useScrollToFirstError';
import { portfolioServices, PHOTO_MAX_BYTES } from '../../app/(provider)/screens/SPPortfolioScreen';

export const CREDENTIAL_TYPES: { key: CredentialType; label: string; issuer: string }[] = [
  { key: 'tesda_nc', label: 'TESDA NC', issuer: 'TESDA' },
  { key: 'prc_license', label: 'PRC licence', issuer: 'PRC' },
  { key: 'trade_certificate', label: 'Trade certificate', issuer: '' },
  { key: 'other', label: 'Other', issuer: '' },
];

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
export const CERTIFICATE_FIELD_ORDER: readonly CredentialField[] = ['photo', 'title', 'issuer', 'expiry'];

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

export type CertificateScroll = ReturnType<typeof useScrollToFirstError<CredentialField>>;

export interface CertificateUploadFormHandle {
  /** Checks the fields and, when they pass, uploads the photo and creates the credential. */
  submit: () => Promise<void>;
  /** Fills the form from a rejected credential so only the fix and a new photo are left. */
  prefill: (item: Credential) => void;
}

export interface CertificateUploadFormProps {
  scroll: CertificateScroll;
  /** The service the certificate is for. Without `lockService` the provider can still pick another. */
  categoryId?: number | null;
  /** Name for `categoryId` when it is not one of the provider's listed services. */
  serviceName?: string | null;
  /** Show the service as fixed instead of offering a choice. */
  lockService?: boolean;
  /** What to ask for, e.g. from `certificateGuidance`. */
  guidance?: string;
  onSubmitted?: (created: Credential | undefined) => void;
  onBusyChange?: (busy: boolean) => void;
}

const CertificateUploadForm = forwardRef<CertificateUploadFormHandle, CertificateUploadFormProps>(
  function CertificateUploadForm(
    { scroll, categoryId = null, serviceName = null, lockService = false, guidance, onSubmitted, onBusyChange },
    ref,
  ) {
    const { styles, Colors, V6Colors, appearance } = useThemedStyles(createThemedStyles);
    const { providerProfile } = useAuth();
    const listed = portfolioServices(providerProfile);
    const services =
      categoryId && !listed.some((item) => item.id === categoryId)
        ? [...listed, { id: categoryId, name: serviceName ?? 'this service' }]
        : listed;
    const [uri, setUri] = useState<string | null>(null);
    const [type, setType] = useState<CredentialType>('tesda_nc');
    const [category, setCategory] = useState<number | null>(categoryId);
    const [title, setTitle] = useState('');
    const [issuer, setIssuer] = useState('TESDA');
    const [number, setNumber] = useState('');
    const [expiresOn, setExpiresOn] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<CredentialField, string>>>({});
    const [submitted, setSubmitted] = useState(false);
    const [sent, setSent] = useState(false);
    const [showDate, setShowDate] = useState(false);
    const { fieldLayout, containerLayout, inputRef, scrollToFirstError } = scroll;
    const clearError = (field: CredentialField) =>
      setFieldErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous));
    // A new preset (for instance "Upload renewal" on another service) replaces the choice.
    useEffect(() => {
      if (categoryId) setCategory(categoryId);
    }, [categoryId]);
    const selectedCategory = (lockService ? categoryId : null) ?? category ?? categoryId ?? services[0]?.id ?? null;
    const selectedName = services.find((item) => item.id === selectedCategory)?.name ?? serviceName;

    useEffect(() => {
      onBusyChange?.(busy);
    }, [busy, onBusyChange]);

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
        onSubmitted?.(created);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not submit this credential.');
      } finally {
        setBusy(false);
      }
    };

    const prefill = (item: Credential) => {
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
    };

    useImperativeHandle(ref, () => ({ submit, prefill }));

    const onDateChange = (event: DateTimePickerEvent, picked?: Date) => {
      if (Platform.OS === 'android') setShowDate(false);
      if (event.type === 'set' && picked) {
        setExpiresOn(formatExpiry(picked));
        clearError('expiry');
      }
    };

    return (
      <View style={styles.root} onLayout={containerLayout}>
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

        {!lockService && services.length > 1 && (
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
        {(lockService || services.length === 1) && !!selectedName && (
          <Text style={styles.label}>{`Service: ${selectedName}`}</Text>
        )}
        {!!(guidance ?? (selectedName ? certificateGuidance(selectedName) : undefined)) && (
          <Text style={styles.guidance}>{guidance ?? certificateGuidance(selectedName)}</Text>
        )}

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
      </View>
    );
  },
);

export default CertificateUploadForm;

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    root: { gap: 14 },
    guidance: { color: V6Colors.ink700, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
    label: { color: V6Colors.ink700, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
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
