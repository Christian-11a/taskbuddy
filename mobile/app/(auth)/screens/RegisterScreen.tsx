/**
 * RegisterScreen.tsx
 *
 * Figma Source: "Sign Up (Create Account) Screen" (id: 80:572)
 *
 * Design:
 * - bg: #F7F7F7 with dark teal vector shapes at top
 * - "Create account" — Roboto 700 30px #1E1E1E
 * - "Let's get started!" — Roboto 400 13px #757575
 * - Name, Email, Password, Confirm Password inputs
 * - Role selector: Homeowner / Service Provider
 * - Homeowner: T&C + Privacy Policy + Data Collection consent checkboxes
 * - Provider: above + RA 10173 biometric consent + Skill category picker
 * - "Sign Up" primary button (teal, radius 24)
 * - "or" divider
 * - "Continue with Google" outline button
 *
 * TC-AUTH-001B: T&C checkbox is mandatory and blocks submit.
 * Privacy Policy and Data Collection consents are also mandatory.
 * RA 10173 biometric consent is mandatory for Service Providers only.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft, Check, ChevronDown, MailCheck } from 'lucide-react-native';
import { Colors } from '../../../src/constants/theme';
import TermsAndConditions from './TermsAndConditions';
import { api } from '../../../src/lib/api';
import type { MobileRole } from '../../../src/lib/api';

const C = {
  ...Colors,
  bg: '#F8FAFC',
  dark: '#1E1E1E',
  slate: '#757575',
  mutedBorder: 'rgba(144,153,184,0.3)',
} as const;

const SKILL_CATEGORIES = [
  { id: 1, name: 'Plumbing' },
  { id: 2, name: 'Cleaning' },
  { id: 3, name: 'Handyman' },
  { id: 4, name: 'Manicure' },
  { id: 5, name: 'Pedicure' },
] as const;

interface RegisterScreenProps {
  /**
   * Create the account against the backend. Rejects with an Error on failure.
   * Resolves with whether the user must confirm their email before signing in.
   */
  onRegister: (input: {
    email: string;
    password: string;
    fullName: string;
    role: MobileRole;
    categoryId?: number;
    consentedTerms: boolean;
    consentedPrivacy: boolean;
    consentedDataCollection: boolean;
    consentedBiometric?: boolean;
  }) => Promise<{ needsEmailConfirmation: boolean }>;
  /** Initiate Google OAuth. Should reject with an Error on failure. */
  onGoogleSignIn: () => Promise<void>;
  onLogin: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface InputProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  error?: string;
}

function FormInput({
  label, placeholder, value, onChangeText,
  secureTextEntry, keyboardType, error,
}: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputBox, focused && styles.inputBoxFocused, error ? styles.inputBoxError : undefined]}>
        <TextInput
          style={styles.inputText}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </View>
      {!!error && <Text style={styles.inputErrorText}>{error}</Text>}
    </View>
  );
}

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
          {checked ? <Check size={13} color={C.white} /> : null}
        </TouchableOpacity>
        <Text style={styles.termsText}>{label}</Text>
      </View>
      {!!error && <Text style={styles.inputErrorText}>{error}</Text>}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

type TermsMode = 'terms' | 'privacy' | null;

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  category?: string;
  terms?: string;
  privacy?: string;
  dataCollection?: string;
  biometric?: string;
};

export default function RegisterScreen({ onRegister, onLogin, onGoogleSignIn }: RegisterScreenProps) {
  // Which terms/policy modal to show
  const [termsMode, setTermsMode] = useState<TermsMode>(null);

  // Consent flags
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [dataCollectionAccepted, setDataCollectionAccepted] = useState(false);
  const [biometricAccepted, setBiometricAccepted] = useState(false);

  // Core fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<MobileRole>('homeowner');

  // SP-only: category
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);

  // Form state
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  // Fetch real categories from backend (falls back to static list on error)
  const [categories, setCategories] = useState(SKILL_CATEGORIES as readonly { id: number; name: string }[]);
  useEffect(() => {
    // Categories endpoint requires auth — use static list at signup.
    // (The static list mirrors the backend seed data from migration 0004.)
  }, []);

  // Reset SP fields when role changes
  useEffect(() => {
    if (role === 'homeowner') {
      setCategoryId(null);
      setBiometricAccepted(false);
    }
  }, [role]);

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

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name.trim()) errors.name = 'Please enter your full name.';
    if (!email.trim()) {
      errors.email = 'Please enter your email address.';
    } else if (!emailPattern.test(email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }
    if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';

    if (role === 'provider' && !categoryId) {
      errors.category = 'Please select your skill category.';
    }

    if (!termsAccepted)         errors.terms          = 'Please accept the Terms & Conditions to continue.';
    if (!privacyAccepted)       errors.privacy        = 'Please accept the Privacy Policy to continue.';
    if (!dataCollectionAccepted) errors.dataCollection = 'Please accept the Data Collection consent to continue.';
    if (role === 'provider' && !biometricAccepted) {
      errors.biometric = 'Please accept the biometric data processing consent to continue.';
    }

    return errors;
  };

  const clearError = <K extends keyof FieldErrors>(key: K) =>
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSignUp = async () => {
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
      const { needsEmailConfirmation } = await onRegister({
        email,
        password,
        fullName: name,
        role,
        categoryId: role === 'provider' ? (categoryId ?? undefined) : undefined,
        consentedTerms: termsAccepted,
        consentedPrivacy: privacyAccepted,
        consentedDataCollection: dataCollectionAccepted,
        consentedBiometric: role === 'provider' ? biometricAccepted : undefined,
      });
      if (needsEmailConfirmation) setConfirmationSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || submitting) return;
    setError(null);
    setGoogleLoading(true);
    try {
      await onGoogleSignIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── Email confirmation sent state ──────────────────────────────────────────

  if (confirmationSent) {
    return (
      <View style={styles.screen}>
        <View style={styles.headerBg} />
        <View style={styles.confirmWrap}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <MailCheck size={32} color={C.brandTeal} />
            </View>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.confirmText}>
              We sent a confirmation link to{' '}
              <Text style={styles.confirmEmail}>{email.trim()}</Text>. Confirm
              your address, then sign in to start using TaskBuddy.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={onLogin}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Go to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  const selectedCategory = categories.find((c) => c.id === categoryId);

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
          onTouchStart={Platform.OS === 'ios' ? Keyboard.dismiss : undefined}
        >
          {/* Top section */}
          <View style={styles.topSection}>
            <TouchableOpacity style={styles.backBtn} onPress={onLogin} activeOpacity={0.8}>
              <ArrowLeft size={20} color={C.white} />
            </TouchableOpacity>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Let's get started!</Text>

            {/* Role toggle */}
            <View style={styles.roleRow}>
              {(['homeowner', 'provider'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleBtn, role === r && styles.roleBtnActive]}
                  onPress={() => setRole(r)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.roleBtnText, role === r && styles.roleBtnTextActive]}>
                    {r === 'homeowner' ? 'Homeowner' : 'Service Provider'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Shared fields */}
            <FormInput
              label="Full Name"
              placeholder="Alex Chen"
              value={name}
              onChangeText={(v) => { setName(v); clearError('name'); }}
              error={fieldErrors.name}
            />
            <FormInput
              label="Email Address"
              placeholder="alex@example.com"
              value={email}
              onChangeText={(v) => { setEmail(v); clearError('email'); }}
              keyboardType="email-address"
              error={fieldErrors.email}
            />
            <FormInput
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={(v) => { setPassword(v); clearError('password'); }}
              secureTextEntry
              error={fieldErrors.password}
            />
            <FormInput
              label="Confirm Password"
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); clearError('confirmPassword'); }}
              secureTextEntry
              error={fieldErrors.confirmPassword}
            />

            {/* SP-only: skill category */}
            {role === 'provider' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Skill Category</Text>
                <TouchableOpacity
                  style={[
                    styles.inputBox,
                    styles.categoryPicker,
                    fieldErrors.category ? styles.inputBoxError : undefined,
                  ]}
                  onPress={() => setCategoryOpen((o) => !o)}
                  activeOpacity={0.8}
                >
                  <Text style={selectedCategory ? styles.inputText : styles.categoryPlaceholder}>
                    {selectedCategory ? selectedCategory.name : 'Select your skill…'}
                  </Text>
                  <ChevronDown
                    size={16}
                    color={C.muted}
                    style={{ transform: [{ rotate: categoryOpen ? '180deg' : '0deg' }] }}
                  />
                </TouchableOpacity>
                {categoryOpen && (
                  <View style={styles.categoryDropdown}>
                    {categories.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          styles.categoryOption,
                          cat.id === categoryId && styles.categoryOptionActive,
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
                            styles.categoryOptionText,
                            cat.id === categoryId && styles.categoryOptionTextActive,
                          ]}
                        >
                          {cat.name}
                        </Text>
                        {cat.id === categoryId && <Check size={14} color={C.brandTeal} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {!!fieldErrors.category && (
                  <Text style={styles.inputErrorText}>{fieldErrors.category}</Text>
                )}
              </View>
            )}

            {/* ── Consent section ────────────────────────────────────────── */}
            <View style={styles.consentSection}>
              <Text style={styles.consentSectionTitle}>Consents & Agreements</Text>

              {/* T&C */}
              <ConsentCheckbox
                testID="chk-terms"
                checked={termsAccepted}
                onPress={() => {
                  if (!termsAccepted) setTermsMode('terms');
                  else setTermsAccepted(false);
                }}
                label={
                  <Text style={styles.termsText}>
                    I have read and agree to the{' '}
                    <Text style={styles.termsLink} onPress={() => setTermsMode('terms')}>
                      Terms & Conditions
                    </Text>
                    <Text style={styles.requiredAsterisk}>*</Text>
                  </Text>
                }
                error={fieldErrors.terms}
              />

              {/* Privacy Policy */}
              <ConsentCheckbox
                testID="chk-privacy"
                checked={privacyAccepted}
                onPress={() => {
                  if (!privacyAccepted) setTermsMode('privacy');
                  else setPrivacyAccepted(false);
                }}
                label={
                  <Text style={styles.termsText}>
                    I have read and agree to the{' '}
                    <Text style={styles.termsLink} onPress={() => setTermsMode('privacy')}>
                      Privacy Policy
                    </Text>
                    <Text style={styles.requiredAsterisk}>*</Text>
                  </Text>
                }
                error={fieldErrors.privacy}
              />

              {/* Data Collection */}
              <ConsentCheckbox
                testID="chk-data-collection"
                checked={dataCollectionAccepted}
                onPress={() => setDataCollectionAccepted((v) => !v)}
                label={
                  <Text style={styles.termsText}>
                    I consent to the collection and use of my personal data to
                    provide and improve TaskBuddy services.
                    <Text style={styles.requiredAsterisk}>*</Text>
                  </Text>
                }
                error={fieldErrors.dataCollection}
              />

              {/* RA 10173 Biometric consent — SP only */}
              {role === 'provider' && (
                <ConsentCheckbox
                  testID="chk-biometric"
                  checked={biometricAccepted}
                  onPress={() => setBiometricAccepted((v) => !v)}
                  label={
                    <Text style={styles.termsText}>
                      I consent to the processing of my government-issued ID and
                      biometric data for identity verification purposes, in
                      accordance with the{' '}
                      <Text style={styles.termsLink}>
                        Data Privacy Act of 2012 (RA 10173)
                      </Text>
                      .<Text style={styles.requiredAsterisk}>*</Text>
                    </Text>
                  }
                  error={fieldErrors.biometric}
                />
              )}

              <Text style={styles.requiredHint}>
                <Text style={styles.requiredAsterisk}>*</Text> Required to create your account
              </Text>
            </View>

            {/* Global error banner */}
            {!!error && <Text style={styles.errorBanner}>{error}</Text>}

            {/* Sign Up */}
            <TouchableOpacity
              style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
              onPress={handleSignUp}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={C.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity
              style={[styles.googleBtn, googleLoading && styles.primaryBtnDisabled]}
              onPress={handleGoogleSignIn}
              activeOpacity={0.85}
              disabled={googleLoading || submitting}
            >
              {googleLoading ? (
                <ActivityIndicator color={C.brandTeal} />
              ) : (
                <>
                  <View style={styles.googleIcon}>
                    <Text style={styles.googleIconText}>G</Text>
                  </View>
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Progress dots */}
            <View style={styles.dotsRow}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.dot, i === 0 && styles.dotActive]} />
              ))}
            </View>
          </View>

          {/* Sign In link */}
          <View style={styles.signInRow}>
            <Text style={styles.signInPrompt}>Already have an account? </Text>
            <Pressable onPress={onLogin}>
              <Text style={styles.signInLink}>Sign In</Text>
            </Pressable>
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
    top: 0,
    left: 0,
    right: 0,
    height: 200,
    backgroundColor: C.brandDark,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },

  scrollContent: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 40 },

  topSection: { marginBottom: 20, flexDirection: 'row' },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },

  card: {
    backgroundColor: C.white,
    borderRadius: 30,
    padding: 24,
    shadowColor: '#063D4D',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 25,
    elevation: 6,
    marginBottom: 20,
  },

  title: { color: C.dark, fontSize: 26, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  subtitle: { color: C.slate, fontSize: 13, fontFamily: 'Inter', marginBottom: 20 },

  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  roleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(144,153,184,0.3)',
    alignItems: 'center', backgroundColor: C.white,
  },
  roleBtnActive: { backgroundColor: C.brandDark, borderColor: C.brandDark },
  roleBtnText: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', color: C.muted },
  roleBtnTextActive: { color: C.white },

  inputGroup: { marginBottom: 16 },
  inputLabel: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', color: C.brandDark, marginBottom: 6 },
  inputBox: {
    backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: C.mutedBorder,
  },
  inputBoxFocused: { borderColor: C.brandTeal },
  inputBoxError: { borderColor: C.brandRed },
  inputText: { fontFamily: 'Inter', fontSize: 15, color: '#0F172A', padding: 0 },
  inputErrorText: {
    fontFamily: 'Inter', fontSize: 12, color: C.brandRed,
    marginTop: 5, marginLeft: 2, lineHeight: 17,
  },

  // Category picker
  categoryPicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  categoryPlaceholder: { fontFamily: 'Inter', fontSize: 15, color: C.muted, padding: 0 },
  categoryDropdown: {
    marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: C.mutedBorder,
    backgroundColor: C.white, overflow: 'hidden',
  },
  categoryOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  categoryOptionActive: { backgroundColor: 'rgba(9,110,139,0.06)' },
  categoryOptionText: { fontFamily: 'Inter', fontSize: 14, color: C.dark },
  categoryOptionTextActive: { color: C.brandTeal, fontWeight: '700' },

  // Consent section
  consentSection: {
    marginTop: 4,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 16,
    gap: 2,
  },
  consentSectionTitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: '700',
    color: C.brandDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  consentItem: { marginBottom: 10 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    borderColor: C.mutedBorder, backgroundColor: C.white,
    alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: C.brandTeal, borderColor: C.brandTeal },
  termsText: { flex: 1, color: C.slate, fontSize: 13, fontFamily: 'Inter', lineHeight: 20 },
  termsLink: { color: C.brandTeal, fontWeight: '700', textDecorationLine: 'underline' },
  requiredAsterisk: { color: C.brandRed, fontWeight: '700' },
  requiredHint: {
    color: C.muted, fontSize: 11, fontFamily: 'Inter', marginTop: 4, lineHeight: 16,
  },

  errorBanner: {
    fontFamily: 'Inter', fontSize: 13, color: C.brandRed,
    marginBottom: 12, lineHeight: 18,
  },

  primaryBtn: {
    backgroundColor: C.brandTeal, borderRadius: 24, paddingVertical: 15,
    alignItems: 'center', marginTop: 4, marginBottom: 18,
    shadowColor: C.brandTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 5,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: C.white, fontFamily: 'Inter', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },

  // Email-confirmation success state
  confirmWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  confirmCard: {
    backgroundColor: C.white, borderRadius: 30, padding: 28, alignItems: 'center',
    shadowColor: '#063D4D', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 12 },
    shadowRadius: 25, elevation: 6,
  },
  confirmIcon: {
    width: 64, height: 64, borderRadius: 32, marginBottom: 16,
    backgroundColor: 'rgba(9,110,139,0.10)', alignItems: 'center', justifyContent: 'center',
  },
  confirmText: {
    fontFamily: 'Inter', fontSize: 14, color: C.slate, textAlign: 'center',
    lineHeight: 21, marginTop: 8, marginBottom: 24,
  },
  confirmEmail: { color: C.brandDark, fontWeight: '700' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { color: '#B3B3B3', fontSize: 13, fontFamily: 'Roboto' },

  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(144,153,184,0.4)',
    borderRadius: 24, paddingVertical: 13, gap: 10, marginBottom: 20,
    backgroundColor: C.white,
  },
  googleIcon: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#EA4335', alignItems: 'center', justifyContent: 'center',
  },
  googleIconText: { color: C.white, fontSize: 12, fontWeight: '700' },
  googleBtnText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '500', color: '#757575' },

  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D9D9D9' },
  dotActive: { backgroundColor: C.brandDark, width: 24, borderRadius: 4 },

  signInRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  signInPrompt: { fontFamily: 'Inter', fontSize: 14, color: C.muted },
  signInLink: { fontFamily: 'Roboto', fontSize: 14, fontWeight: '700', color: C.brandTeal },
});
