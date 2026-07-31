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
 * - "Sign Up" primary button (teal, radius 24)
 * - "or" divider
 * - "Continue with Google" outline button
 * - Dot progress indicators (step 1 of 4)
 */

import React, { useState } from 'react';
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
import { ArrowLeft, Check, MailCheck } from 'lucide-react-native';
import { Colors } from '../../../src/constants/theme';
import TermsAndConditions from './TermsAndConditions';
import type { MobileRole } from '../../../src/lib/api';

const C = {
  ...Colors,
  bg: '#F8FAFC',
  dark: '#1E1E1E',
  slate: '#757575',
  mutedBorder: 'rgba(144,153,184,0.3)',
} as const;

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
  }) => Promise<{ needsEmailConfirmation: boolean }>;
  onLogin: () => void;
}

interface RegisterScreenContentProps extends RegisterScreenProps {
  onViewTerms: () => void;
  termsAccepted: boolean;
  onToggleTermsAccepted: () => void;
  name: string;
  onNameChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  role: MobileRole;
  onRoleChange: (value: MobileRole) => void;
}

interface InputProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
}

function FormInput({ label, placeholder, value, onChangeText, secureTextEntry, keyboardType }: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[styles.inputBox, focused && styles.inputBoxFocused]}>
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
    </View>
  );
}

function RegisterScreenContent({
  onRegister,
  onLogin,
  onViewTerms,
  termsAccepted,
  onToggleTermsAccepted,
  name,
  onNameChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  role,
  onRoleChange,
}: RegisterScreenContentProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSignUp = async () => {
    if (submitting) return;
    setError(null);

    if (!name.trim()) return setError('Please enter your full name.');
    if (!email.trim()) return setError('Please enter your email address.');
    if (password.length < 8)
      return setError('Password must be at least 8 characters.');
    if (password !== confirmPassword)
      return setError('Passwords do not match.');
    if (!termsAccepted)
      return setError('Please accept the Terms and Conditions to continue.');

    setSubmitting(true);
    try {
      const { needsEmailConfirmation } = await onRegister({
        email,
        password,
        fullName: name,
        role,
      });
      // When confirmation is off, the parent switches to the authenticated
      // experience automatically; otherwise we show the "check your email" state.
      if (needsEmailConfirmation) setConfirmationSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create account.');
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <View style={styles.screen}>
      {/* Dark teal header bg */}
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
          // iOS does not dismiss the keyboard when an unfocused area of a
          // ScrollView is tapped by default. Dismissing at the scroll view
          // level preserves every form control's own press behavior.
          onTouchStart={Platform.OS === 'ios' ? Keyboard.dismiss : undefined}
        >
          {/* Top section with back + logo placeholder */}
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
                  onPress={() => onRoleChange(r)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.roleBtnText, role === r && styles.roleBtnTextActive]}>
                    {r === 'homeowner' ? 'Homeowner' : 'Service Provider'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FormInput
              label="Full Name"
              placeholder="Alex Chen"
              value={name}
              onChangeText={onNameChange}
            />
            <FormInput
              label="Email Address"
              placeholder="alex@example.com"
              value={email}
              onChangeText={onEmailChange}
              keyboardType="email-address"
            />
            <FormInput
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={onPasswordChange}
              secureTextEntry
            />
            <FormInput
              label="Confirm Password"
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={onConfirmPasswordChange}
              secureTextEntry
            />

            <View style={styles.termsRow}>
              <TouchableOpacity
                style={[styles.checkbox, termsAccepted && styles.checkboxChecked, !termsAccepted && styles.checkboxDisabled]}
                onPress={onToggleTermsAccepted}
                activeOpacity={0.8}
                disabled={!termsAccepted}
              >
                {termsAccepted ? <Check size={14} color={C.white} /> : null}
              </TouchableOpacity>
              <Text style={styles.termsText}>
                I have read and agree with the{' '}
                <Text style={styles.termsLink} onPress={onViewTerms}>
                  Terms and Conditions
                </Text>
                .<Text style={styles.requiredAsterisk}>*</Text>
              </Text>
            </View>

            {/* Error */}
            {!!error && (
              <Text testID="register-error" style={styles.errorBanner}>
                {error}
              </Text>
            )}

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
            <TouchableOpacity style={styles.googleBtn} onPress={handleSignUp} activeOpacity={0.85}>
              <View style={styles.googleIcon}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Continue with Google</Text>
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

export default function RegisterScreen({ onRegister, onLogin }: RegisterScreenProps) {
  const [showTerms, setShowTerms] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<MobileRole>('homeowner');

  if (showTerms) {
    return (
      <TermsAndConditions
        onBack={() => setShowTerms(false)}
        onAccept={() => setTermsAccepted(true)}
      />
    );
  }

  return (
    <RegisterScreenContent
      onRegister={onRegister}
      onLogin={onLogin}
      onViewTerms={() => setShowTerms(true)}
      termsAccepted={termsAccepted}
      onToggleTermsAccepted={() => setTermsAccepted((value) => !value)}
      name={name}
      onNameChange={setName}
      email={email}
      onEmailChange={setEmail}
      password={password}
      onPasswordChange={setPassword}
      confirmPassword={confirmPassword}
      onConfirmPasswordChange={setConfirmPassword}
      role={role}
      onRoleChange={setRole}
    />
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
  backIcon: { color: C.white, fontSize: 20, fontWeight: '700' },

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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    marginTop: 4,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.mutedBorder,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: C.brandTeal,
    borderColor: C.brandTeal,
  },
  checkboxDisabled: {
    opacity: 1,
    backgroundColor: '#CBD5E1',
    borderColor: '#64748B',
  },
  checkboxMark: {
    color: C.white,
    fontSize: 13,
    fontWeight: '700',
  },
  termsText: {
    flex: 1,
    color: C.slate,
    fontSize: 13,
    fontFamily: 'Inter',
    lineHeight: 20,
  },
  termsLink: {
    color: C.brandTeal,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  requiredHint: {
    color: C.muted,
    fontSize: 12,
    fontFamily: 'Inter',
    marginBottom: 16,
    marginLeft: 32,
  },
  inputBox: {
    backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    borderWidth: 1, borderColor: C.mutedBorder,
  },
  inputBoxFocused: { borderColor: C.brandTeal },
  inputText: { fontFamily: 'Inter', fontSize: 15, color: '#0F172A', padding: 0 },

  primaryBtn: {
    backgroundColor: C.brandTeal, borderRadius: 24, paddingVertical: 15,
    alignItems: 'center', marginTop: 4, marginBottom: 18,
    shadowColor: C.brandTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 5,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: C.white, fontFamily: 'Inter', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },

  errorBanner: {
    fontFamily: 'Inter', fontSize: 13, color: C.brandRed,
    marginBottom: 12, lineHeight: 18,
  },

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

  requiredAsterisk: { color: C.brandRed, fontWeight: '700' },
});
