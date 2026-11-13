/**
 * ClearanceUploadForm.tsx
 *
 * NBI or police clearance upload, shared by the clearance screen. Same
 * field-error style as the certificate form. A clearance always expires:
 * there is no "no expiry" choice. The parent owns the scroll view and the
 * submit button, and calls `ref.submit()`.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Calendar, Check, CircleAlert, ImagePlus } from 'lucide-react-native';
import Tap from './ui/Tap';
import TextField from './ui/TextField';
import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import { api, type Clearance, type ClearanceType } from '../lib/api';
import { requestAppPermission } from '../lib/permissions';
import { cleanText, textUnits } from '../lib/textRules';
import type { useScrollToFirstError } from '../hooks/useScrollToFirstError';
import { PHOTO_MAX_BYTES } from '../../app/(provider)/screens/SPPortfolioScreen';
import { formatExpiry, isValidExpiry } from './CertificateUploadForm';

export const CLEARANCE_TYPES: { key: ClearanceType; label: string }[] = [
  { key: 'nbi', label: 'NBI' },
  { key: 'police', label: 'Police' },
];

export function clearanceTypeLabel(type: ClearanceType): string {
  return type === 'nbi' ? 'NBI clearance' : 'Police clearance';
}

export type ClearanceField = 'photo' | 'number' | 'issued' | 'expiry';
export const CLEARANCE_FIELD_ORDER: readonly ClearanceField[] = ['photo', 'number', 'issued', 'expiry'];

const NUMBER_LENGTH = 'Enter the clearance number (2–60 characters).';
const EXPIRY_REQUIRED = 'Pick the expiry date.';

/** Per-field messages, shown under each field after Submit. */
export function clearanceErrors(input: {
  hasPhoto: boolean;
  number: string;
  issuedOn: string;
  expiresOn: string;
}): Partial<Record<ClearanceField, string>> {
  const errors: Partial<Record<ClearanceField, string>> = {};
  if (!input.hasPhoto) errors.photo = 'Add a clear photo of the clearance.';
  const length = textUnits(input.number);
  if (length < 2) errors.number = NUMBER_LENGTH;
  else if (length > 60) errors.number = 'Clearance number must be 60 characters or fewer.';
  if (input.issuedOn && !isValidExpiry(input.issuedOn)) errors.issued = 'Enter the issue date as YYYY-MM-DD.';
  if (!input.expiresOn) errors.expiry = EXPIRY_REQUIRED;
  else if (!isValidExpiry(input.expiresOn)) errors.expiry = 'Enter the expiry date as YYYY-MM-DD.';
  if (
    !errors.issued && !errors.expiry
    && input.issuedOn && input.expiresOn
    && input.issuedOn > input.expiresOn
  ) {
    errors.issued = 'The issue date is after the expiry date';
  }
  return errors;
}

/** The first thing missing before a clearance can be submitted, or null. */
export function clearanceProblem(input: {
  hasPhoto: boolean;
  number: string;
  issuedOn: string;
  expiresOn: string;
}): string | null {
  const errors = clearanceErrors(input);
  for (const field of CLEARANCE_FIELD_ORDER) {
    if (errors[field]) return errors[field];
  }
  return null;
}

function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
}

export type ClearanceScroll = ReturnType<typeof useScrollToFirstError<ClearanceField>>;

export interface ClearanceUploadFormHandle {
  submit: () => Promise<void>;
  /** Fills type and number. The photo and dates stay empty for a new upload. */
  prefill: (item: Pick<Clearance, 'clearance_type' | 'clearance_number'>) => void;
}

export interface ClearanceUploadFormProps {
  scroll: ClearanceScroll;
  onSubmitted?: (created: Clearance | undefined) => void;
  onBusyChange?: (busy: boolean) => void;
}

const ClearanceUploadForm = forwardRef<ClearanceUploadFormHandle, ClearanceUploadFormProps>(
  function ClearanceUploadForm({ scroll, onSubmitted, onBusyChange }, ref) {
    const { styles, Colors, V6Colors, appearance } = useThemedStyles(createThemedStyles);
    const [uri, setUri] = useState<string | null>(null);
    const [type, setType] = useState<ClearanceType>('nbi');
    const [number, setNumber] = useState('');
    const [issuedOn, setIssuedOn] = useState('');
    const [expiresOn, setExpiresOn] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<ClearanceField, string>>>({});
    const [submitted, setSubmitted] = useState(false);
    const [sent, setSent] = useState(false);
    const [showIssued, setShowIssued] = useState(false);
    const [showExpiry, setShowExpiry] = useState(false);
    const { fieldLayout, containerLayout, inputRef, scrollToFirstError } = scroll;
    const clearError = (field: ClearanceField) =>
      setFieldErrors((previous) => (previous[field] ? { ...previous, [field]: undefined } : previous));

    useEffect(() => {
      onBusyChange?.(busy);
    }, [busy, onBusyChange]);

    const reset = () => {
      setUri(null);
      setNumber('');
      setIssuedOn('');
      setExpiresOn('');
    };

    const choose = async () => {
      setError(null);
      try {
        if (!(await requestAppPermission('gallery'))) {
          setError('Photo library access is required to add a clearance photo.');
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
      const errors = clearanceErrors({ hasPhoto: !!uri, number, issuedOn, expiresOn });
      setSubmitted(true);
      setFieldErrors(errors);
      if (clearanceProblem({ hasPhoto: !!uri, number, issuedOn, expiresOn })) {
        setError(null);
        scrollToFirstError(errors);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const document_path = await api.uploadImage('provider-credentials', uri!);
        const issued = cleanText(issuedOn);
        const created = await api.createClearance({
          clearance_type: type,
          clearance_number: cleanText(number),
          expires_on: expiresOn,
          document_path,
          ...(issued ? { issued_on: issued } : {}),
        });
        reset();
        setSubmitted(false);
        setFieldErrors({});
        setSent(true);
        onSubmitted?.(created);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not submit this clearance.');
      } finally {
        setBusy(false);
      }
    };

    const prefill = (item: Pick<Clearance, 'clearance_type' | 'clearance_number'>) => {
      setType(item.clearance_type);
      setNumber(item.clearance_number);
      setIssuedOn('');
      setExpiresOn('');
      setUri(null);
      setError(null);
      setSent(false);
      setSubmitted(false);
      setFieldErrors({});
      setShowIssued(false);
      setShowExpiry(false);
    };

    useImperativeHandle(ref, () => ({ submit, prefill }));

    const onIssued = (event: DateTimePickerEvent, picked?: Date) => {
      if (Platform.OS === 'android') setShowIssued(false);
      if (event.type === 'set' && picked) {
        setIssuedOn(formatExpiry(picked));
        clearError('issued');
      }
    };
    const onExpiry = (event: DateTimePickerEvent, picked?: Date) => {
      if (Platform.OS === 'android') setShowExpiry(false);
      if (event.type === 'set' && picked) {
        setExpiresOn(formatExpiry(picked));
        clearError('expiry');
      }
    };

    return (
      <View style={styles.root} onLayout={containerLayout}>
        <Text style={styles.label}>Type</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {CLEARANCE_TYPES.map((item) => {
            const selected = type === item.key;
            return (
              <Tap
                key={item.key}
                disabled={busy}
                accessibilityRole="radio"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => setType(item.key)}
                style={[styles.chip, selected && styles.chipOn]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{item.label}</Text>
              </Tap>
            );
          })}
        </View>

        <View onLayout={fieldLayout('photo')} style={styles.fieldBlock}>
          {uri ? (
            <Tap disabled={busy} onPress={() => void choose()} accessibilityRole="button" accessibilityLabel="Change clearance photo">
              <Image source={{ uri }} style={styles.preview} resizeMode="contain" accessible accessibilityLabel="Selected clearance photo" />
            </Tap>
          ) : (
            <Tap disabled={busy} onPress={() => void choose()} style={styles.pickTile} accessibilityRole="button" accessibilityLabel="Add clearance photo">
              <ImagePlus size={28} color={Colors.link} />
              <Text style={styles.pickText}>Add clearance photo</Text>
            </Tap>
          )}
          {!!fieldErrors.photo && (
            <View style={styles.errorRow}>
              <CircleAlert size={14} color={Colors.dangerText} />
              <Text accessibilityRole="alert" style={styles.errorText}>{fieldErrors.photo}</Text>
            </View>
          )}
        </View>

        <View onLayout={fieldLayout('number')}>
          <TextField
            ref={inputRef('number')}
            label="Clearance number"
            value={number}
            onChangeText={(value) => { setNumber(value); clearError('number'); }}
            maxLength={60}
            editable={!busy}
            keyboardAppearance={appearance}
            error={fieldErrors.number}
            submitted={submitted}
          />
        </View>

        <View onLayout={fieldLayout('issued')} style={styles.fieldBlock}>
          <Text style={styles.label}>Issued on (optional)</Text>
          <View style={styles.dateRow}>
            <Tap
              disabled={busy}
              onPress={() => { setShowExpiry(false); setShowIssued(true); }}
              style={[styles.dateField, !!fieldErrors.issued && styles.dateFieldError]}
              accessibilityRole="button"
              accessibilityLabel="Issued on"
              accessibilityValue={{ text: issuedOn || 'Not set' }}
            >
              <Calendar size={18} color={V6Colors.ink500} />
              <Text style={styles.dateText}>{issuedOn || 'Pick a date'}</Text>
            </Tap>
            {!!issuedOn && (
              <Tap disabled={busy} onPress={() => { setIssuedOn(''); setShowIssued(false); }} accessibilityRole="button" accessibilityLabel="Clear issue date">
                <Text style={styles.link}>Clear</Text>
              </Tap>
            )}
          </View>
          {showIssued && (
            <DateTimePicker
              themeVariant={appearance}
              testID="issued-picker"
              value={parseDate(issuedOn)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onIssued}
            />
          )}
          {!!fieldErrors.issued && (
            <View style={styles.errorRow}>
              <CircleAlert size={14} color={Colors.dangerText} />
              <Text accessibilityRole="alert" style={styles.errorText}>{fieldErrors.issued}</Text>
            </View>
          )}
        </View>

        <View onLayout={fieldLayout('expiry')} style={styles.fieldBlock}>
          <Text style={styles.label}>Expiry date</Text>
          <View style={styles.dateRow}>
            <Tap
              disabled={busy}
              onPress={() => { setShowIssued(false); setShowExpiry(true); }}
              style={[styles.dateField, !!fieldErrors.expiry && styles.dateFieldError]}
              accessibilityRole="button"
              accessibilityLabel="Expiry date"
              accessibilityValue={{ text: expiresOn || 'Not set' }}
            >
              <Calendar size={18} color={V6Colors.ink500} />
              <Text style={styles.dateText}>{expiresOn || 'Pick a date'}</Text>
            </Tap>
            {!!expiresOn && (
              <Tap disabled={busy} onPress={() => { setExpiresOn(''); setShowExpiry(false); }} accessibilityRole="button" accessibilityLabel="Clear expiry date">
                <Text style={styles.link}>Clear</Text>
              </Tap>
            )}
          </View>
          {showExpiry && (
            <DateTimePicker
              themeVariant={appearance}
              testID="expiry-picker"
              value={parseDate(expiresOn)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onExpiry}
            />
          )}
          {!!fieldErrors.expiry && (
            <View style={styles.errorRow}>
              <CircleAlert size={14} color={Colors.dangerText} />
              <Text accessibilityRole="alert" style={styles.errorText}>{fieldErrors.expiry}</Text>
            </View>
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

export default ClearanceUploadForm;

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    root: { gap: 14 },
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
    sentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sentText: { color: Colors.primary, fontSize: 14, fontWeight: '700', lineHeight: 20, fontFamily: 'Inter' },
    errorText: { color: Colors.dangerText, fontSize: 14, lineHeight: 20, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
