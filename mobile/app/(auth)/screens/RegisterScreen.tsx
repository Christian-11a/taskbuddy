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
 * - Provider: above + Skill category picker
 * - "Sign Up" primary button (teal, radius 24)
 * - "or" divider
 * - "Continue with Google" outline button
 *
 * TC-AUTH-001B: T&C checkbox is mandatory and blocks submit.
 * Privacy Policy and Data Collection consents are also mandatory.
 * Identity-document processing is explained in the verification flow.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import { AlertCircle, ArrowLeft, Check, ChevronDown, MailCheck } from 'lucide-react-native';
import { V6Radii, V6Shadows } from '../../../src/constants/theme';
import TermsAndConditions from './TermsAndConditions';
import { ApiError, api } from '../../../src/lib/api';
import type { MobileRole } from '../../../src/lib/api';
import { useAuth } from '../../../src/context/AuthContext';
import PasswordInput from '../../../src/components/PasswordInput';
import { useAuthLayout } from '../../../src/hooks/useAuthLayout';

/** Supabase issues 6-digit signup codes. */
const OTP_LENGTH = 6;

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
  onLayout?: (event: LayoutChangeEvent) => void;
  /** Shows a red asterisk. Only on fields the Create Account button actually checks. */
  required?: boolean;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  error?: string;
  /**
   * Test hook only — inert, same as ConsentCheckbox's. Needed because the two
   * password fields share the placeholder `••••••••`, and a secure field stops
   * exposing its value to accessibility once filled: the number of elements
   * matching that placeholder changes mid-flow, so positional selectors land on
   * the wrong field and both entries end up in the first one.
   */
  testID?: string;
}

function FormInput({
  label, required, placeholder, value, onChangeText,
  secureTextEntry, keyboardType, error, testID, onLayout,
}: InputProps) {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const [focused, setFocused] = useState(false);
  return (
    <View onLayout={onLayout} style={styles.inputGroup}>
      <Text style={styles.inputLabel}>
        {label}
        {required && <Text style={styles.requiredAsterisk}> *</Text>}
      </Text>
      {secureTextEntry ? (
        <PasswordInput
          containerStyle={[styles.inputBox, focused && styles.inputBoxFocused, error ? styles.inputBoxError : undefined]}
          inputStyle={styles.inputText}
          testID={testID}
          placeholder={placeholder}
          placeholderTextColor={C.muted}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={Keyboard.dismiss}
          enablesReturnKeyAutomatically
        />
      ) : (
        <View style={[styles.inputBox, focused && styles.inputBoxFocused, error ? styles.inputBoxError : undefined]}>
          <TextInput keyboardAppearance={appearance}
            style={styles.inputText}
            testID={testID}
            placeholder={placeholder}
            placeholderTextColor={C.muted}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={Keyboard.dismiss}
            enablesReturnKeyAutomatically
          />
        </View>
      )}
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
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.consentItem}>
      <View style={styles.consentRow}>
        <Tap
          testID={testID}
          style={[styles.checkbox, checked && styles.checkboxChecked]}
          onPress={onPress}
          activeOpacity={0.7}
        >
          {checked ? <Check size={14} color={C.onPrimary} /> : null}
        </Tap>
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
};

export default function RegisterScreen({ onRegister, onLogin, onGoogleSignIn }: RegisterScreenProps) {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const layout = useAuthLayout();
  const scrollRef = useRef<ScrollView>(null);
  const cardTop = useRef(0);
  const fieldPositions = useRef<Record<string, number>>({});
  const locateField = (field: string) => (event: LayoutChangeEvent) => {
    fieldPositions.current[field] = event.nativeEvent.layout.y;
  };
  const { width, fontScale } = useWindowDimensions();
  const { verifyEmailOtp } = useAuth();
  // Entrance transition — matches the mockup's `.screen{animation:fadeIn .22s ease}`
  // (fade in + slide up 6px). Runs once on mount, when this screen first opens.
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [entrance]);
  const entranceStyle = {
    opacity: entrance,
    transform: [{
      translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }),
    }],
  };

  // Which terms/policy modal to show
  const [termsMode, setTermsMode] = useState<TermsMode>(null);
  const [emailTaken, setEmailTaken] = useState(false);

  // Consent flags
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [dataCollectionAccepted, setDataCollectionAccepted] = useState(false);

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

  // Email verification. Registering already triggers Supabase's confirm-signup
  // mail, so this step reads the code the user has rather than sending a
  // second one; `resendCode` is the only path that mails another.
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);

  const canVerify = otp.length === OTP_LENGTH && !verifying;

  const verifyCode = async () => {
    if (!canVerify) return;
    setVerifying(true);
    setOtpError(null);
    setResendNote(null);
    try {
      // Signs the user straight in — App.tsx switches to the authed tree off
      // the context change, so there is nothing to navigate to here.
      await verifyEmailOtp({ email: email.trim(), token: otp });
    } catch (e) {
      setOtpError(
        e instanceof Error ? e.message : 'That code did not work. Try again.',
      );
    } finally {
      setVerifying(false);
    }
  };

  const resendCode = async () => {
    setResending(true);
    setOtpError(null);
    try {
      await api.sendEmailOtp(email.trim());
      // Deliberately not "we sent it" — the endpoint always reports success,
      // so claiming delivery would be asserting more than we know.
      setResendNote(`If ${email.trim()} needs confirming, a new code is on its way.`);
    } catch (e) {
      setOtpError(e instanceof Error ? e.message : 'Could not resend the code.');
    } finally {
      setResending(false);
    }
  };

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
      setCategoryOpen(false);
    }
  }, [role]);

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

    return errors;
  };

  const clearError = <K extends keyof FieldErrors>(key: K) =>
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSignUp = async () => {
    if (submitting) return;
    setError(null);
    setEmailTaken(false);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const first = Object.keys(errors)[0];
      const field = ['terms', 'privacy', 'dataCollection'].includes(first) ? 'consents' : first;
      scrollRef.current?.scrollTo({ y: cardTop.current + (fieldPositions.current[field] ?? 0), animated: true });
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
      });
      if (needsEmailConfirmation) setConfirmationSent(true);
    } catch (e) {
      if (e instanceof ApiError && (e.details as { code?: string } | undefined)?.code === 'EMAIL_TAKEN') {
        // Point at the field that caused it and offer the obvious way out.
        setFieldErrors({ email: 'This email is already registered.' });
        setEmailTaken(true);
        return;
      }
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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.screen}>
        <View
          style={[
            styles.confirmWrap,
            { paddingTop: layout.paddingTop, paddingBottom: layout.paddingBottom },
          ]}
        >
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <MailCheck size={35} color={V6Colors.link} />
            </View>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.confirmText}>
              We sent a 6-digit code to{' '}
              <Text style={styles.confirmEmail}>{email.trim()}</Text>. Enter it
              below to finish creating your account.
            </Text>

            <TextInput keyboardAppearance={appearance}
              style={styles.otpInput}
              value={otp}
              onChangeText={(text) => {
                setOtp(text.replace(/\D/g, '').slice(0, OTP_LENGTH));
                setOtpError(null);
              }}
              keyboardType="number-pad"
              placeholder="000000"
              placeholderTextColor={C.slate}
              maxLength={OTP_LENGTH}
              editable={!verifying}
              accessibilityLabel="Verification code"
              autoFocus
            />

            {!!otpError && <Text style={styles.otpError}>{otpError}</Text>}
            {!!resendNote && <Text style={styles.otpNote}>{resendNote}</Text>}

            <Tap
              style={[styles.primaryBtn, !canVerify && styles.primaryBtnDisabled]}
              onPress={verifyCode}
              disabled={!canVerify}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {verifying ? (
                <ActivityIndicator color={C.onPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Verify Email</Text>
              )}
            </Tap>

            <Tap
              onPress={resendCode}
              disabled={resending || verifying}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={styles.otpLink}>
                {resending ? 'Sending…' : "Didn't get it? Resend code"}
              </Text>
            </Tap>

            <Tap onPress={onLogin} activeOpacity={0.7} accessibilityRole="button">
              <Text style={styles.otpLinkMuted}>Go to Sign In</Text>
            </Tap>
          </View>
        </View>
      </View>
      </TouchableWithoutFeedback>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const scrollContent = (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, { paddingTop: layout.paddingTop, paddingBottom: layout.paddingBottom }]}
      showsVerticalScrollIndicator={false}
      // "handled" lets taps on buttons/links/inputs still register while any
      // other tap outside an input bubbles up and dismisses the keyboard.
      // (Replaces the old onTouchStart={Keyboard.dismiss} on this ScrollView,
      // which fired on every touch — including tapping directly into an
      // input — and raced against the input's own focus, so the keyboard
      // sometimes never opened. Same fix as LoginScreen's.)
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      <TermsAndConditions
        visible={termsMode !== null}
        mode={termsMode ?? 'terms'}
        onBack={() => setTermsMode(null)}
        onAccept={() => {
          if (termsMode === 'terms') setTermsAccepted(true);
          else if (termsMode === 'privacy') setPrivacyAccepted(true);
        }}
      />
          {/* Top section */}
          <View style={styles.topSection}>
            <Tap style={styles.backBtn} onPress={onLogin} activeOpacity={0.8}>
              <ArrowLeft size={21} color={C.ink700} />
            </Tap>
          </View>

          {/* Form card */}
          <View onLayout={(event) => { cardTop.current = event.nativeEvent.layout.y; }} style={[styles.card, { padding: width < 380 ? 16 : 24 }]}>
            <Text style={styles.title}>Create account</Text>
            <Text style={styles.subtitle}>Let's get started!</Text>

            {/* Role toggle */}
            <View style={[styles.roleRow, fontScale > 1.2 && { flexDirection: 'column' }]}>
              {(['homeowner', 'provider'] as const).map((r) => (
                <Tap
                  key={r}
                  style={[styles.roleBtn, role === r && styles.roleBtnActive]}
                  onPress={() => setRole(r)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.roleBtnText, role === r && styles.roleBtnTextActive]}>
                    {r === 'homeowner' ? 'Client' : 'Service Provider'}
                  </Text>
                </Tap>
              ))}
            </View>

            {/* Shared fields */}
            <FormInput
              label="Full Name"
              required
              placeholder="Alex Chen"
              testID="input-name"
              value={name}
              onChangeText={(v) => { setName(v); clearError('name'); }}
              onLayout={locateField('name')}
              error={fieldErrors.name}
            />
            <FormInput
              label="Email Address"
              required
              placeholder="alex@example.com"
              testID="input-email"
              value={email}
              onChangeText={(v) => { setEmail(v); clearError('email'); setEmailTaken(false); }}
              keyboardType="email-address"
              onLayout={locateField('email')}
              error={fieldErrors.email}
            />
            <FormInput
              label="Password"
              required
              placeholder="••••••••"
              testID="input-password"
              value={password}
              onChangeText={(v) => { setPassword(v); clearError('password'); }}
              secureTextEntry
              onLayout={locateField('password')}
              error={fieldErrors.password}
            />
            <FormInput
              label="Confirm Password"
              required
              placeholder="••••••••"
              testID="input-confirm-password"
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); clearError('confirmPassword'); }}
              secureTextEntry
              onLayout={locateField('confirmPassword')}
              error={fieldErrors.confirmPassword}
            />

            {/* SP-only: skill category */}
            {role === 'provider' && (
              <View onLayout={locateField('category')} style={styles.inputGroup}>
                <Text style={styles.inputLabel}>
                  Skill Category
                  <Text style={styles.requiredAsterisk}> *</Text>
                </Text>
                <Tap
                  style={[
                    styles.inputBox,
                    styles.categoryPicker,
                    fieldErrors.category ? styles.inputBoxError : undefined,
                  ]}
                  onPress={() => setCategoryOpen((open) => !open)}
                  activeOpacity={0.8}
                >
                  <Text style={selectedCategory ? styles.inputText : styles.categoryPlaceholder}>
                    {selectedCategory ? selectedCategory.name : 'Select your skill…'}
                  </Text>
                  <ChevronDown
                    size={18}
                    color={C.muted}
                    style={{ transform: [{ rotate: categoryOpen ? '180deg' : '0deg' }] }}
                  />
                </Tap>
                {categoryOpen && (
                  <View style={styles.categoryDropdown}>
                    {categories.map((cat) => (
                      <Tap
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
                        {cat.id === categoryId && <Check size={15} color={V6Colors.link} />}
                      </Tap>
                    ))}
                  </View>
                )}
                {!!fieldErrors.category && (
                  <Text style={styles.inputErrorText}>{fieldErrors.category}</Text>
                )}
              </View>
            )}

            {/* ── Consent section ────────────────────────────────────────── */}
            <View onLayout={locateField('consents')} style={styles.consentSection}>
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

              <Text style={styles.requiredHint}>
                <Text style={styles.requiredAsterisk}>*</Text> Required to create your account
              </Text>
            </View>

            {/* Global error banner */}
            {emailTaken && (
              <View style={styles.errorCard} accessibilityRole="alert">
                <AlertCircle size={18} color={C.brandRed} />
                <View style={styles.errorCardBody}>
                  <Text style={styles.errorCardTitle}>Email already in use</Text>
                  <Text style={styles.errorCardText}>
                    An account with {email.trim()} already exists.{' '}
                    <Text style={styles.errorCardLink} onPress={onLogin}>Log in instead</Text>
                  </Text>
                </View>
              </View>
            )}
            {!!error && (
              <View style={styles.errorCard} accessibilityRole="alert">
                <AlertCircle size={18} color={C.brandRed} />
                <Text style={[styles.errorCardText, styles.errorCardBody]}>{error}</Text>
              </View>
            )}

            {/* Sign Up */}
            <Tap
              style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
              onPress={handleSignUp}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={C.onPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>Sign Up</Text>
              )}
            </Tap>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google */}
            <Tap
              style={[styles.googleBtn, googleLoading && styles.primaryBtnDisabled]}
              onPress={handleGoogleSignIn}
              activeOpacity={0.85}
              disabled={googleLoading || submitting}
            >
              {googleLoading ? (
                <ActivityIndicator color={V6Colors.link} />
              ) : (
                <>
                  <View style={styles.googleIcon}>
                    <Text style={styles.googleIconText}>G</Text>
                  </View>
                  <Text style={styles.googleBtnText}>Continue with Google</Text>
                </>
              )}
            </Tap>
          </View>

          {/* Sign In link */}
          <View style={styles.signInRow}>
            <Text style={styles.signInPrompt}>Already have an account? </Text>
            <Pressable onPress={onLogin}>
              <Text style={styles.signInLink}>Sign In</Text>
            </Pressable>
          </View>
    </ScrollView>
  );

  return (
    // Keyboard handling: the ScrollView's keyboardShouldPersistTaps +
    // keyboardDismissMode handle taps/dismissal; KeyboardAvoidingView on
    // Android resizes this long form so the focused field scrolls above the
    // keyboard instead of being hidden behind it (matches this screen's
    // original working pattern — behavior="height" on Android).
    //
    // Note for future edits: do NOT add a shadow/elevation to `inputBoxFocused`
    // (or any style toggled while a TextInput inside it has focus). On Android
    // an elevation change re-creates the wrapping view and drops the EditText's
    // focus, which closes the keyboard the moment it opens. That was the cause
    // of the "keyboard flashes and focus jumps between fields" bug here.
    <Animated.View style={[styles.screen, entranceStyle]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {scrollContent}
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = {
    ...V6Colors,
    bg: V6Colors.canvas,
    dark: V6Colors.ink900,
    slate: V6Colors.ink500,
    muted: V6Colors.ink400,
    mutedBorder: '#dce3e9',
    brandDark: V6Colors.cyan900,
    brandTeal: V6Colors.cyan700,
    brandRed: V6Colors.dangerText,
  } as const;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: C.bg },

    scrollContent: { width: '100%', maxWidth: 600, alignSelf: 'center', paddingTop: 56, paddingHorizontal: 16, paddingBottom: 40 },

    topSection: { marginBottom: 20, flexDirection: 'row' },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },

    card: {
      backgroundColor: C.surface,
      borderRadius: V6Radii.card,
      padding: 24,
      shadowColor: '#0f172a',
      shadowOpacity: 0.06,
      shadowOffset: { width: 0, height: 12 },
      shadowRadius: 25,
      elevation: 6,
      marginBottom: 20,
    },

    title: { color: C.dark, fontSize: 31.5, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
    subtitle: { color: C.slate, fontSize: 15.5, fontFamily: 'Inter', marginBottom: 20 },

    roleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    roleBtn: {
      flex: 1, paddingVertical: 12, borderRadius: V6Radii.btn,
      borderWidth: 1, borderColor: V6Colors.fieldBorder,
      alignItems: 'center', backgroundColor: C.surface,
    },
    roleBtnActive: { backgroundColor: V6Colors.hero, borderColor: C.ink900 },
    roleBtnText: { fontFamily: 'Inter', fontSize: 15.5, fontWeight: '600', color: C.muted },
    roleBtnTextActive: { color: C.onPrimary },

    inputGroup: { marginBottom: 16 },
    inputLabel: { fontFamily: 'Inter', fontSize: 15.5, fontWeight: '600', color: V6Colors.ink900, marginBottom: 6 },
    inputBox: {
      backgroundColor: V6Colors.wellBg, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
      borderWidth: 1, borderColor: C.mutedBorder,
    },
    inputBoxFocused: { borderColor: C.brandTeal },
    inputBoxError: { borderColor: C.brandRed },
    inputText: { fontFamily: 'Inter', fontSize: 18.5, color: V6Colors.ink900, padding: 0 },
    inputErrorText: {
      fontFamily: 'Inter', fontSize: 14.5, color: C.brandRed,
      marginTop: 5, marginLeft: 2, lineHeight: 17,
    },

    // Category picker
    categoryPicker: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    categoryPlaceholder: { fontFamily: 'Inter', fontSize: 18.5, color: C.muted, padding: 0 },
    categoryDropdown: {
      marginTop: 8,
      borderRadius: 12, borderWidth: 1, borderColor: C.mutedBorder,
      backgroundColor: C.surface, overflow: 'hidden',
    },
    categoryOption: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 13,
      borderBottomWidth: 1, borderBottomColor: V6Colors.canvas,
    },
    categoryOptionActive: { backgroundColor: 'rgba(9,110,139,0.06)' },
    categoryOptionText: { fontFamily: 'Inter', fontSize: 16.5, color: C.dark },
    categoryOptionTextActive: { color: V6Colors.link, fontWeight: '700' },

    // Consent section
    consentSection: {
      marginTop: 4,
      marginBottom: 8,
      borderTopWidth: 1,
      borderTopColor: V6Colors.canvas,
      paddingTop: 16,
      gap: 2,
    },
    consentSectionTitle: {
      fontFamily: 'Inter',
      fontSize: 14.5,
      fontWeight: '700',
      color: V6Colors.ink900,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    consentItem: { marginBottom: 10 },
    consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
      borderColor: C.mutedBorder, backgroundColor: C.surface,
      alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
    },
    checkboxChecked: { backgroundColor: C.brandTeal, borderColor: C.brandTeal },
    termsText: { flex: 1, color: C.slate, fontSize: 15.5, fontFamily: 'Inter', lineHeight: 20 },
    termsLink: { color: V6Colors.link, fontWeight: '700', textDecorationLine: 'underline' },
    requiredAsterisk: { color: C.brandRed, fontWeight: '700' },
    requiredHint: {
      color: C.muted, fontSize: 13.5, fontFamily: 'Inter', marginTop: 4, lineHeight: 16,
    },

    errorCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      backgroundColor: V6Colors.dangerSurface, borderWidth: 1, borderColor: V6Colors.dangerBorder,
      borderRadius: 12, padding: 12, marginBottom: 14,
    },
    errorCardBody: { flex: 1 },
    errorCardTitle: { fontFamily: 'Inter', fontSize: 14.5, fontWeight: '700', color: V6Colors.dangerText, marginBottom: 2 },
    errorCardText: { fontFamily: 'Inter', fontSize: 14, color: V6Colors.dangerText, lineHeight: 19 },
    errorCardLink: { fontWeight: '700', textDecorationLine: 'underline', color: V6Colors.dangerText },

    primaryBtn: {
      backgroundColor: C.brandTeal, borderRadius: V6Radii.btn, paddingVertical: 15,
      alignItems: 'center', marginTop: 4, marginBottom: 18,
      ...V6Shadows.primaryButton,
    },
    primaryBtnDisabled: { opacity: 0.7 },
    primaryBtnText: { color: C.onPrimary, fontFamily: 'Inter', fontSize: 18.5, fontWeight: '700', letterSpacing: 0.1 },

    // Email-confirmation success state
    confirmWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
    confirmCard: {
      backgroundColor: C.surface, borderRadius: V6Radii.card, padding: 28, alignItems: 'center',
      shadowColor: '#0f172a', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 12 },
      shadowRadius: 25, elevation: 6,
    },
    confirmIcon: {
      width: 64, height: 64, borderRadius: 32, marginBottom: 16,
      backgroundColor: 'rgba(9,110,139,0.10)', alignItems: 'center', justifyContent: 'center',
    },
    confirmText: {
      fontFamily: 'Inter', fontSize: 16.5, color: C.slate, textAlign: 'center',
      lineHeight: 21, marginTop: 8, marginBottom: 24,
    },
    confirmEmail: { color: V6Colors.ink900, fontWeight: '700' },
    otpInput: {
      alignSelf: 'stretch',
      borderWidth: 1,
      borderColor: C.line,
      borderRadius: V6Radii.btn,
      paddingVertical: 14,
      marginTop: 18,
      marginBottom: 4,
      fontSize: 30,
      fontWeight: '800',
      fontFamily: 'Inter',
      color: V6Colors.ink900,
      textAlign: 'center',
      letterSpacing: 8,
    },
    otpError: { color: V6Colors.dangerText, fontSize: 14, fontFamily: 'Inter', textAlign: 'center', marginTop: 8 },
    otpNote: { color: C.slate, fontSize: 13.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 8, lineHeight: 18 },
    otpLink: {
      color: V6Colors.link, fontSize: 15, fontWeight: '700', fontFamily: 'Inter',
      textAlign: 'center', marginTop: 16,
    },
    otpLinkMuted: {
      color: C.slate, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter',
      textAlign: 'center', marginTop: 12,
    },

    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    dividerLine: { flex: 1, height: 1, backgroundColor: V6Colors.ink100 },
    dividerText: { color: '#B3B3B3', fontSize: 15.5, fontFamily: 'Roboto' },

    googleBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: V6Colors.fieldBorder,
      borderRadius: V6Radii.btn, paddingVertical: 13, gap: 10, marginBottom: 20,
      backgroundColor: C.surface,
    },
    googleIcon: {
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: '#EA4335', alignItems: 'center', justifyContent: 'center',
    },
    googleIconText: { color: C.onPrimary, fontSize: 14.5, fontWeight: '700' },
    googleBtnText: { fontFamily: 'Inter', fontSize: 16.5, fontWeight: '500', color: V6Colors.ink500 },

    signInRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
    signInPrompt: { fontFamily: 'Inter', fontSize: 16.5, color: C.muted },
    signInLink: { fontFamily: 'Roboto', fontSize: 16.5, fontWeight: '700', color: V6Colors.link },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
