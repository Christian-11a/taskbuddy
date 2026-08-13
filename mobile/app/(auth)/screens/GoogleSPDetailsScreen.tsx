/**
 * GoogleSPDetailsScreen.tsx
 *
 * Second step for new Google OAuth users who chose "Service Provider".
 * Collects the required fields that Google sign-in cannot provide:
 *   - Skill category
 *   - Terms & Conditions acceptance
 *   - Privacy Policy acceptance
 *   - Data Collection consent
 *   - RA 10173 biometric/govt-ID consent
 *
 * On submit calls completeGoogleProfile({ role: 'provider', ... }).
 * After success the gate in App.tsx clears (google_signup_pending = false)
 * and the SP verification gate takes over (is_verified = false).
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft, Check, ChevronDown } from 'lucide-react-native';
import { V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';
import TermsAndConditions from './TermsAndConditions';

const C = {
  ...V6Colors,
  bg: V6Colors.canvas,
  dark: V6Colors.ink900,
  slate: V6Colors.ink500,
  muted: V6Colors.ink400,
  mutedBorder: '#dce3e9',
  brandDark: V6Colors.cyan900,
  brandTeal: V6Colors.cyan700,
  brandRed: '#ef4444',
} as const;

const SKILL_CATEGORIES = [
  { id: 1, name: 'Plumbing' },
  { id: 2, name: 'Cleaning' },
  { id: 3, name: 'Handyman' },
  { id: 4, name: 'Manicure' },
  { id: 5, name: 'Pedicure' },
] as const;

interface GoogleSPDetailsScreenProps {
  onBack: () => void;
  onComplete: (input: {
    categoryId: number;
    consentedTerms: boolean;
    consentedPrivacy: boolean;
    consentedDataCollection: boolean;
    consentedBiometric: boolean;
  }) => Promise<void>;
}

// ─── Consent checkbox helper ──────────────────────────────────────────────────

interface ConsentCheckboxProps {
  checked: boolean;
  onPress: () => void;
  label: React.ReactNode;
  error?: string;
  testID?: string;
}

function ConsentCheckbox({ checked, onPress, label, error, testID }: ConsentCheckboxProps) {
  return (
    <View style={styles.consentItem}>
      <View style={styles.consentRow}>
        <TouchableOpacity
          testID={testID}
          style={[styles.checkbox, checked && styles.checkboxChecked]}
          onPress={onPress}
          activeOpacity={0.7}
        >
          {checked ? <Check size={14} color={C.white} /> : null}
        </TouchableOpacity>
        <Text style={styles.consentText}>{label}</Text>
      </View>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type TermsMode = 'terms' | 'privacy' | null;

type FieldErrors = {
  category?: string;
  terms?: string;
  privacy?: string;
  dataCollection?: string;
  biometric?: string;
};

export default function GoogleSPDetailsScreen({
  onBack,
  onComplete,
}: GoogleSPDetailsScreenProps) {
  const [termsMode, setTermsMode] = useState<TermsMode>(null);

  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [dataCollectionAccepted, setDataCollectionAccepted] = useState(false);
  const [biometricAccepted, setBiometricAccepted] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  if (termsMode !== null) {
    return (
      <TermsAndConditions
        mode={termsMode}
        onBack={() => setTermsMode(null)}
        onAccept={() => {
          if (termsMode === 'terms') setTermsAccepted(true);
          else if (termsMode === 'privacy') setPrivacyAccepted(true);
          setTermsMode(null);
        }}
      />
    );
  }

  const clearError = <K extends keyof FieldErrors>(key: K) =>
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!categoryId)             errors.category       = 'Please select your skill category.';
    if (!termsAccepted)          errors.terms          = 'Please accept the Terms & Conditions.';
    if (!privacyAccepted)        errors.privacy        = 'Please accept the Privacy Policy.';
    if (!dataCollectionAccepted) errors.dataCollection = 'Please accept the Data Collection consent.';
    if (!biometricAccepted)      errors.biometric      = 'Please accept the RA 10173 biometric consent.';
    return errors;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setError(null);
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await onComplete({
        categoryId: categoryId!,
        consentedTerms: termsAccepted,
        consentedPrivacy: privacyAccepted,
        consentedDataCollection: dataCollectionAccepted,
        consentedBiometric: biometricAccepted,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your details. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategory = SKILL_CATEGORIES.find((c) => c.id === categoryId);

  return (
    <View style={styles.screen}>
      <View style={styles.headerBg} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <View style={styles.topRow}>
            <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
              <ArrowLeft size={22} color={C.white} />
            </TouchableOpacity>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.title}>Complete your profile</Text>
            <Text style={styles.subtitle}>
              A few more details before you start as a Service Provider.
            </Text>

            {/* Skill category */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Skill Category<Text style={styles.asterisk}> *</Text></Text>
              <TouchableOpacity
                style={[
                  styles.picker,
                  fieldErrors.category ? styles.pickerError : undefined,
                ]}
                onPress={() => setCategoryOpen((o) => !o)}
                activeOpacity={0.8}
              >
                <Text style={selectedCategory ? styles.pickerValue : styles.pickerPlaceholder}>
                  {selectedCategory ? selectedCategory.name : 'Select your skill…'}
                </Text>
                <ChevronDown
                  size={18}
                  color={C.muted}
                  style={{ transform: [{ rotate: categoryOpen ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>
              {categoryOpen && (
                <View style={styles.dropdown}>
                  {SKILL_CATEGORIES.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.dropdownOption,
                        cat.id === categoryId && styles.dropdownOptionActive,
                      ]}
                      onPress={() => {
                        setCategoryId(cat.id);
                        setCategoryOpen(false);
                        clearError('category');
                      }}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          cat.id === categoryId && styles.dropdownOptionTextActive,
                        ]}
                      >
                        {cat.name}
                      </Text>
                      {cat.id === categoryId && <Check size={15} color={C.brandTeal} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {!!fieldErrors.category && (
                <Text style={styles.fieldError}>{fieldErrors.category}</Text>
              )}
            </View>

            {/* Consents */}
            <View style={styles.consentSection}>
              <Text style={styles.consentSectionTitle}>Consents & Agreements</Text>

              <ConsentCheckbox
                testID="chk-gsp-terms"
                checked={termsAccepted}
                onPress={() => {
                  if (!termsAccepted) setTermsMode('terms');
                  else setTermsAccepted(false);
                }}
                label={
                  <Text style={styles.consentText}>
                    I have read and agree to the{' '}
                    <Text style={styles.link} onPress={() => setTermsMode('terms')}>
                      Terms & Conditions
                    </Text>
                    <Text style={styles.asterisk}>*</Text>
                  </Text>
                }
                error={fieldErrors.terms}
              />

              <ConsentCheckbox
                testID="chk-gsp-privacy"
                checked={privacyAccepted}
                onPress={() => {
                  if (!privacyAccepted) setTermsMode('privacy');
                  else setPrivacyAccepted(false);
                }}
                label={
                  <Text style={styles.consentText}>
                    I have read and agree to the{' '}
                    <Text style={styles.link} onPress={() => setTermsMode('privacy')}>
                      Privacy Policy
                    </Text>
                    <Text style={styles.asterisk}>*</Text>
                  </Text>
                }
                error={fieldErrors.privacy}
              />

              <ConsentCheckbox
                testID="chk-gsp-data"
                checked={dataCollectionAccepted}
                onPress={() => setDataCollectionAccepted((v) => !v)}
                label={
                  <Text style={styles.consentText}>
                    I consent to the collection and use of my personal data to
                    provide and improve TaskBuddy services.
                    <Text style={styles.asterisk}>*</Text>
                  </Text>
                }
                error={fieldErrors.dataCollection}
              />

              <ConsentCheckbox
                testID="chk-gsp-biometric"
                checked={biometricAccepted}
                onPress={() => setBiometricAccepted((v) => !v)}
                label={
                  <Text style={styles.consentText}>
                    I consent to the processing of my government-issued ID and
                    biometric data for identity verification, in accordance with
                    the{' '}
                    <Text style={styles.link}>Data Privacy Act of 2012 (RA 10173)</Text>.
                    <Text style={styles.asterisk}>*</Text>
                  </Text>
                }
                error={fieldErrors.biometric}
              />

              <Text style={styles.requiredNote}>
                <Text style={styles.asterisk}>*</Text> Required to continue
              </Text>
            </View>

            {!!error && <Text style={styles.errorBanner}>{error}</Text>}

            <TouchableOpacity
              style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Complete Registration</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.bg },

  headerBg: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 200,
    backgroundColor: C.brandDark,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },

  scrollContent: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 40 },

  topRow: { flexDirection: 'row', marginBottom: 20 },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },

  card: {
    backgroundColor: C.white,
    borderRadius: V6Radii.card,
    padding: 24,
    shadowColor: '#063D4D',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 25,
    elevation: 6,
  },

  title: { color: C.dark, fontSize: 29, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  subtitle: { color: C.slate, fontSize: 15.5, fontFamily: 'Inter', marginBottom: 20, lineHeight: 20 },

  fieldGroup: { marginBottom: 20 },
  fieldLabel: { fontFamily: 'Inter', fontSize: 15.5, fontWeight: '600', color: C.brandDark, marginBottom: 6 },
  asterisk: { color: C.brandRed, fontWeight: '700' },

  picker: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: C.mutedBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerError: { borderColor: C.brandRed },
  pickerValue: { fontFamily: 'Inter', fontSize: 18.5, color: '#0F172A' },
  pickerPlaceholder: { fontFamily: 'Inter', fontSize: 18.5, color: C.muted },

  dropdown: {
    marginTop: 4, borderRadius: 12, borderWidth: 1,
    borderColor: C.mutedBorder, backgroundColor: C.white, overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  dropdownOptionActive: { backgroundColor: 'rgba(9,110,139,0.06)' },
  dropdownOptionText: { fontFamily: 'Inter', fontSize: 16.5, color: C.dark },
  dropdownOptionTextActive: { color: C.brandTeal, fontWeight: '700' },

  fieldError: {
    fontFamily: 'Inter', fontSize: 14.5,
    color: C.brandRed,
    marginTop: 5, marginLeft: 2, lineHeight: 17,
  },

  consentSection: {
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
    paddingTop: 16, marginBottom: 8,
  },
  consentSectionTitle: {
    fontFamily: 'Inter', fontSize: 14.5, fontWeight: '700',
    color: C.brandDark, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 12,
  },
  consentItem: { marginBottom: 12 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: C.mutedBorder, backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: C.brandTeal, borderColor: C.brandTeal },
  consentText: { flex: 1, color: C.slate, fontSize: 15.5, fontFamily: 'Inter', lineHeight: 20 },
  link: { color: C.brandTeal, fontWeight: '700', textDecorationLine: 'underline' },
  requiredNote: { color: C.muted, fontSize: 13.5, fontFamily: 'Inter', marginTop: 4 },

  errorBanner: {
    color: C.brandRed,
    fontFamily: 'Inter', fontSize: 15.5,
    marginBottom: 12, lineHeight: 18,
  },

  primaryBtn: {
    backgroundColor: C.brandTeal, borderRadius: V6Radii.btn, paddingVertical: 15,
    alignItems: 'center', marginTop: 8,
    ...V6Shadows.primaryButton,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    color: C.white, fontFamily: 'Inter',
    fontSize: 18.5, fontWeight: '600', letterSpacing: 0.3,
  },
});
