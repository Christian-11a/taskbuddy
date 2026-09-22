/**
 * ForgotPasswordScreen.tsx
 *
 * Two stages against the real endpoints, which were already there and simply
 * never called: `POST /auth/forgot-password` mails a 6-digit code, then
 * `POST /auth/reset-password` exchanges it for a session and sets the new
 * password. It is a *code*, not a link — the earlier copy promised a "reset
 * link", which no part of the backend has ever sent.
 *
 * Because step 2 returns a session, a successful reset ends signed in (via
 * AuthContext.resetPassword) rather than bouncing back to Login to retype a
 * password chosen ten seconds ago.
 *
 * Step 1 always reports success, even for an address with no account: the API
 * answers 200 either way so it cannot be used to discover who has an account.
 * The copy is careful to say "if that address has an account" for the same
 * reason — claiming the mail was sent would leak exactly what the 200 hides.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AlertCircle, ArrowLeft, CheckCircle2, Circle, KeyRound, MailCheck } from 'lucide-react-native';
import PasswordInput from '../../../src/components/PasswordInput';
import { V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { api } from '../../../src/lib/api';
import { useAuthLayout } from '../../../src/hooks/useAuthLayout';

const C = V6Colors;
const RESEND_COOLDOWN_S = 60;
const MIN_PASSWORD = 8;

interface ForgotPasswordScreenProps {
  onBackToLogin: () => void;
}

export default function ForgotPasswordScreen({ onBackToLogin }: ForgotPasswordScreenProps) {
  const layout = useAuthLayout();
  const { resetPassword } = useAuth();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // Resend is rate limited server-side too; the countdown just stops the user
  // from tapping into a 429.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const rules = [
    { label: `At least ${MIN_PASSWORD} characters`, ok: newPassword.length >= MIN_PASSWORD },
    { label: 'Both passwords match', ok: !!confirmPassword && newPassword === confirmPassword },
  ];

  const sendCode = async (resend = false) => {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Enter the email address on your account.');
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setStage('code');
      setCooldown(RESEND_COOLDOWN_S);
      if (resend) setNotice('A new code is on its way.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    setError(null);
    setNotice(null);
    if (code.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    // Mirrors the backend's MinLength(8) on ResetPasswordDto.new_password.
    if (!rules.every((r) => r.ok)) {
      setError(newPassword.length < MIN_PASSWORD
        ? `New password must be at least ${MIN_PASSWORD} characters.`
        : 'Those passwords do not match.');
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    try {
      // On success the app is signed in and App.tsx routes to the dashboard
      // on its own — there is nothing to navigate to from here.
      await resetPassword({ email: email.trim(), token: code, newPassword });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code is invalid or has expired.');
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = stage === 'email' ? 0 : 1;

  const scrollContent = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, { paddingTop: layout.paddingTop, paddingBottom: layout.paddingBottom }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      <View style={styles.topSection}>
        <TouchableOpacity style={styles.backButton} onPress={onBackToLogin} activeOpacity={0.8} accessibilityLabel="Return to sign in">
          <ArrowLeft size={21} color={C.ink700} />
        </TouchableOpacity>
        <View style={styles.steps} accessibilityLabel={`Step ${stepIndex + 1} of 2`}>
          {[0, 1].map((i) => (
            <View key={i} style={[styles.stepBar, i <= stepIndex && styles.stepBarActive]} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.iconWell}>
          {stage === 'email'
            ? <KeyRound size={26} color={C.cyan700} />
            : <MailCheck size={26} color={C.cyan700} />}
        </View>
        <Text style={styles.stepLabel}>Step {stepIndex + 1} of 2</Text>

        {stage === 'email' ? (
          <>
            <Text style={styles.title}>Forgot your password?</Text>
            <Text style={styles.subtitle}>
              Enter the email you signed up with and we'll send you a 6-digit reset code.
            </Text>

            <Text style={styles.inputLabel}>Email</Text>
            <View style={[styles.inputBox, focused === 'email' && styles.inputBoxFocused]}>
              <TextInput
                style={styles.inputText}
                placeholder="sample@mail.com"
                placeholderTextColor={C.ink400}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!busy}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused(null)}
                returnKeyType="send"
                onSubmitEditing={() => void sendCode()}
                enablesReturnKeyAutomatically
              />
            </View>

            {!!error && <ErrorCard text={error} />}

            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
              activeOpacity={0.85}
              onPress={() => void sendCode()}
              disabled={busy}
            >
              {busy
                ? <ActivityIndicator color={C.white} />
                : <Text style={styles.primaryButtonText}>Send reset code</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              If <Text style={styles.subtitleStrong}>{email.trim()}</Text> has an account, a
              6-digit code is on its way. Enter it below with your new password.
            </Text>

            <Text style={styles.inputLabel}>Reset code</Text>
            <View style={[styles.inputBox, focused === 'code' && styles.inputBoxFocused]}>
              <TextInput
                style={[styles.inputText, styles.codeText]}
                placeholder="••••••"
                placeholderTextColor={C.ink300}
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                editable={!busy}
                maxLength={6}
                onFocus={() => setFocused('code')}
                onBlur={() => setFocused(null)}
                returnKeyType="next"
                onSubmitEditing={() => newRef.current?.focus()}
              />
            </View>
            <View style={styles.resendRow}>
              <Text style={styles.resendHint}>Didn't get it?</Text>
              <TouchableOpacity onPress={() => void sendCode(true)} disabled={busy || cooldown > 0} hitSlop={8}>
                <Text style={[styles.resendLink, (busy || cooldown > 0) && styles.resendLinkDisabled]}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>New password</Text>
            <PasswordInput
              ref={newRef}
              containerStyle={[styles.inputBox, focused === 'new' && styles.inputBoxFocused]}
              inputStyle={styles.inputText}
              placeholder="At least 8 characters"
              placeholderTextColor={C.ink400}
              value={newPassword}
              onChangeText={setNewPassword}
              editable={!busy}
              onFocus={() => setFocused('new')}
              onBlur={() => setFocused(null)}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
            />

            <Text style={[styles.inputLabel, styles.inputLabelSpaced]}>Confirm new password</Text>
            <PasswordInput
              ref={confirmRef}
              containerStyle={[styles.inputBox, focused === 'confirm' && styles.inputBoxFocused]}
              inputStyle={styles.inputText}
              placeholder="Re-enter your new password"
              placeholderTextColor={C.ink400}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!busy}
              onFocus={() => setFocused('confirm')}
              onBlur={() => setFocused(null)}
              returnKeyType="done"
              onSubmitEditing={() => void submitReset()}
            />

            <View style={styles.rules}>
              {rules.map((rule) => (
                <View key={rule.label} style={styles.ruleRow}>
                  {rule.ok ? <CheckCircle2 size={15} color="#15803d" /> : <Circle size={15} color={C.ink300} />}
                  <Text style={[styles.ruleText, rule.ok && styles.ruleTextOk]}>{rule.label}</Text>
                </View>
              ))}
            </View>

            {!!notice && <Text style={styles.noticeText}>{notice}</Text>}
            {!!error && <ErrorCard text={error} />}

            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
              activeOpacity={0.85}
              onPress={() => void submitReset()}
              disabled={busy}
            >
              {busy
                ? <ActivityIndicator color={C.white} />
                : <Text style={styles.primaryButtonText}>Reset password</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryLink}
              activeOpacity={0.7}
              onPress={() => { setStage('email'); setError(null); setNotice(null); setCode(''); }}
              disabled={busy}
            >
              <Text style={styles.secondaryLinkText}>Use a different email</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Remembered it? </Text>
        <TouchableOpacity onPress={onBackToLogin} hitSlop={8}>
          <Text style={styles.footerLink}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    // KeyboardAvoidingView on Android resizes the form so the field scrolls
    // above the keyboard instead of being hidden behind it. The earlier
    // keyboard bug here came from an `elevation` change in the focus style,
    // not from this wrapper — see inputBoxFocused below.
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {scrollContent}
      </KeyboardAvoidingView>
    </View>
  );
}

function ErrorCard({ text }: { text: string }) {
  return (
    <View style={styles.errorCard} accessibilityRole="alert">
      <AlertCircle size={17} color="#b91c1c" />
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.canvas },
  scrollContent: { paddingHorizontal: 20 },
  topSection: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  backButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2', alignItems: 'center', justifyContent: 'center' },
  steps: { flex: 1, flexDirection: 'row', gap: 6 },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0' },
  stepBarActive: { backgroundColor: C.cyan700 },
  card: { backgroundColor: C.white, borderRadius: V6Radii.card, padding: 22, borderWidth: 1, borderColor: C.line, ...V6Shadows.sm },
  iconWell: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.cyan50, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stepLabel: { color: C.cyan700, fontFamily: 'Inter', fontSize: 12.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  title: { color: C.ink900, fontSize: 24, fontWeight: '800', fontFamily: 'Inter', marginBottom: 6 },
  subtitle: { color: C.ink500, fontSize: 14.5, fontFamily: 'Inter', marginBottom: 20, lineHeight: 20 },
  subtitleStrong: { color: C.ink900, fontWeight: '700' },
  inputLabel: { color: C.ink900, fontFamily: 'Inter', fontSize: 14.5, fontWeight: '700', marginBottom: 6 },
  inputLabelSpaced: { marginTop: 14 },
  inputBox: { backgroundColor: C.white, borderRadius: V6Radii.input, paddingHorizontal: 14, minHeight: 46, justifyContent: 'center', borderWidth: 1, borderColor: '#dce3e9' },
  // NOTE: deliberately border-colour only. Do NOT add a shadow/elevation to a
  // focus style that wraps a TextInput: on Android, changing `elevation` on an
  // ancestor while it holds focus makes the platform re-create that view, which
  // drops the EditText's focus and dismisses the keyboard the instant it opens.
  // Verified on-device — see LoginScreen's inputBoxFocused for the same fix.
  inputBoxFocused: { borderColor: C.cyan500 },
  inputText: { color: C.ink900, fontFamily: 'Inter', fontSize: 16, padding: 0 },
  codeText: { fontSize: 20, fontWeight: '700', letterSpacing: 8 },
  resendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 16 },
  resendHint: { color: C.ink500, fontFamily: 'Inter', fontSize: 13.5 },
  resendLink: { color: C.cyan700, fontFamily: 'Inter', fontSize: 13.5, fontWeight: '700' },
  resendLinkDisabled: { color: C.ink400 },
  rules: { gap: 6, marginTop: 12, marginBottom: 14 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { color: C.ink500, fontSize: 13, fontFamily: 'Inter' },
  ruleTextOk: { color: '#15803d' },
  primaryButton: { backgroundColor: C.cyan700, borderRadius: V6Radii.btn, minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 16, ...V6Shadows.primaryButton },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: C.white, fontFamily: 'Inter', fontSize: 16.5, fontWeight: '700' },
  secondaryLink: { alignItems: 'center', paddingTop: 14 },
  secondaryLinkText: { color: C.cyan700, fontFamily: 'Inter', fontSize: 14, fontWeight: '700' },
  noticeText: { color: '#15803d', fontFamily: 'Inter', fontSize: 13.5, marginBottom: 4 },
  errorCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 12, padding: 11,
  },
  errorText: { flex: 1, color: '#b91c1c', fontFamily: 'Inter', fontSize: 13.5, lineHeight: 18 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  footerText: { color: C.ink500, fontFamily: 'Inter', fontSize: 14 },
  footerLink: { color: C.cyan700, fontFamily: 'Inter', fontSize: 14, fontWeight: '700' },
});
