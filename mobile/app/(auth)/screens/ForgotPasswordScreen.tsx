/**
 * ForgotPasswordScreen.tsx
 *
 * Three steps against the real endpoints, which were already there and simply
 * never called: `POST /auth/forgot-password` mails a 6-digit code, then
 * `POST /auth/reset-password` exchanges it for a session and sets the new
 * password. It is a *code*, not a link — the earlier copy promised a "reset
 * link", which no part of the backend has ever sent.
 *
 * 1. Email: the address the code is sent to.
 * 2. Code: six boxes. "Verify code" only checks that six digits are in; there
 *    is no separate verify call, so the server checks the code itself when the
 *    password is reset.
 * 3. New password: the same two rules as before, shown live.
 *
 * Because step 3 returns a session, a successful reset ends signed in (via
 * AuthContext.resetPassword) rather than bouncing back to Login to retype a
 * password chosen ten seconds ago.
 *
 * Step 1 always reports success, even for an address with no account: the API
 * answers 200 either way so it cannot be used to discover who has an account.
 * The copy is careful to say "if that address has an account" for the same
 * reason — claiming the mail was sent would leak exactly what the 200 hides.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import { AlertCircle, CheckCircle2, Circle, KeyRound, MailCheck } from 'lucide-react-native';
import AuthField from '../../../src/components/auth/AuthField';
import AuthStepHeader from '../../../src/components/auth/AuthStepHeader';
import CodeBoxes from '../../../src/components/auth/CodeBoxes';
import { formatCooldown, maskEmail } from '../../../src/components/auth/resetCode';
import { V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { api } from '../../../src/lib/api';
import { EMAIL_MAX, validateEmail, validateOtpCode, validatePasswordRules } from '../../../src/lib/inputRules';
import { useAuthLayout } from '../../../src/hooks/useAuthLayout';

const RESEND_COOLDOWN_S = 60;
const MIN_PASSWORD = 8;

type Stage = 'email' | 'code' | 'password';
const STAGE_NUMBER: Record<Stage, number> = { email: 1, code: 2, password: 3 };
const STAGE_LABEL: Record<Stage, string> = { email: 'Email', code: 'Code', password: 'Password' };

interface ForgotPasswordScreenProps {
  onBackToLogin: () => void;
}

export default function ForgotPasswordScreen({ onBackToLogin }: ForgotPasswordScreenProps) {
  const { styles, Colors, V6Colors } = useThemedStyles(createThemedStyles);
  const layout = useAuthLayout();
  const { resetPassword } = useAuth();
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const emailRef = useRef<TextInput>(null);
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
    const message = validateEmail(email);
    if (message) {
      setEmailError(message);
      emailRef.current?.focus();
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

  // Only checks that six digits are in. The server judges the code itself when
  // the password is reset, so a wrong code is reported at that point.
  const verifyCode = () => {
    setError(null);
    setNotice(null);
    const codeError = validateOtpCode(code);
    if (codeError) {
      setError(codeError);
      return;
    }
    setStage('password');
  };

  const submitReset = async () => {
    setError(null);
    setNotice(null);
    const codeError = validateOtpCode(code);
    if (codeError) {
      setError(codeError);
      return;
    }
    // Mirrors the backend's MinLength(8) on ResetPasswordDto.new_password.
    const passwordError = validatePasswordRules(newPassword, 'New password');
    if (passwordError) {
      setError(passwordError);
      newRef.current?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Those passwords do not match.');
      confirmRef.current?.focus();
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

  const useDifferentEmail = () => {
    setStage('email');
    setError(null);
    setNotice(null);
    setCode('');
  };

  const back = stage === 'email'
    ? { onPress: onBackToLogin, label: 'Back to sign in' }
    : stage === 'code'
      ? { onPress: useDifferentEmail, label: 'Back to email' }
      : { onPress: () => { setStage('code'); setError(null); setNotice(null); }, label: 'Back to code' };

  const masked = maskEmail(email.trim());
  const cooling = busy || cooldown > 0;

  const stageContent = stage === 'email' ? (
    <>
      <Text style={styles.title} accessibilityRole="header">Forgot your password?</Text>
      <Text style={styles.subtitle}>
        Enter the email you signed up with and we'll send you a 6-digit reset code.
      </Text>

      <AuthField
        ref={emailRef}
        label="Email"
        placeholder="sample@mail.com"
        value={email}
        onChangeText={(value) => { setEmail(value); setEmailError(undefined); }}
        onBlur={() => setEmailError(validateEmail(email) ?? undefined)}
        error={emailError}
        keyboardType="email-address"
        autoComplete="email"
        maxLength={EMAIL_MAX}
        editable={!busy}
        returnKeyType="send"
        onSubmitEditing={() => void sendCode()}
      />

      {!!error && <ErrorCard text={error} />}

      <Tap
        style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
        activeOpacity={0.85}
        onPress={() => void sendCode()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Send reset code"
      >
        {busy
          ? <ActivityIndicator color={Colors.onPrimary} />
          : <Text style={styles.primaryButtonText}>Send reset code</Text>}
      </Tap>
    </>
  ) : stage === 'code' ? (
    <>
      <Text style={styles.title} accessibilityRole="header">Enter the 6-digit code</Text>
      <Text style={styles.subtitle}>
        If <Text style={styles.subtitleStrong}>{masked}</Text> has an account, we sent a 6-digit code.
        It may take a minute.
      </Text>

      <CodeBoxes value={code} onChange={setCode} editable={!busy} autoFocus />

      <View style={styles.resendRow}>
        <Text style={styles.resendHint}>Didn't get it?</Text>
        <Tap
          onPress={() => void sendCode(true)}
          disabled={cooling}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={cooldown > 0 ? `Resend code in ${formatCooldown(cooldown)}` : 'Resend code'}
        >
          <Text style={[styles.resendLink, cooling && styles.resendLinkDisabled]}>
            {cooldown > 0 ? `Resend in ${formatCooldown(cooldown)}` : 'Resend code'}
          </Text>
        </Tap>
      </View>

      {!!notice && <Text style={styles.noticeText}>{notice}</Text>}
      {!!error && <ErrorCard text={error} />}

      <Tap
        style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
        activeOpacity={0.85}
        onPress={verifyCode}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Verify code"
      >
        <Text style={styles.primaryButtonText}>Verify code</Text>
      </Tap>

      <Tap
        style={styles.secondaryLink}
        activeOpacity={0.7}
        onPress={useDifferentEmail}
        disabled={busy}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryLinkText}>Use a different email</Text>
      </Tap>
    </>
  ) : (
    <>
      <Text style={styles.title} accessibilityRole="header">Choose a new password</Text>
      <Text style={styles.subtitle}>Type it twice so we know it is right.</Text>

      <AuthField
        ref={newRef}
        secure
        label="New password"
        placeholder="8–72 characters, letter and number"
        value={newPassword}
        onChangeText={setNewPassword}
        editable={!busy}
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <View style={styles.fieldGap} />
      <AuthField
        ref={confirmRef}
        secure
        label="Confirm new password"
        placeholder="Re-enter your new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!busy}
        returnKeyType="done"
        onSubmitEditing={() => void submitReset()}
      />

      <View style={styles.rules}>
        {rules.map((rule) => (
          <View key={rule.label} style={styles.ruleRow}>
            {rule.ok ? <CheckCircle2 size={15} color={V6Colors.successText} /> : <Circle size={15} color={V6Colors.ink300} />}
            <Text style={[styles.ruleText, rule.ok && styles.ruleTextOk]}>{rule.label}</Text>
          </View>
        ))}
      </View>

      {!!error && <ErrorCard text={error} />}

      <Tap
        style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
        activeOpacity={0.85}
        onPress={() => void submitReset()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Reset password"
      >
        {busy
          ? <ActivityIndicator color={Colors.onPrimary} />
          : <Text style={styles.primaryButtonText}>Reset password</Text>}
      </Tap>
    </>
  );

  const scrollContent = (
    <KeyboardAwareScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, { paddingTop: layout.paddingTop, paddingBottom: layout.paddingBottom }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      <AuthStepHeader
        title="Forgot password"
        onBack={back.onPress}
        backLabel={back.label}
        progress={{ step: STAGE_NUMBER[stage], total: 3, label: STAGE_LABEL[stage] }}
      />

      <View style={styles.card}>
        <View style={styles.iconWell}>
          {stage === 'code'
            ? <MailCheck size={26} color={V6Colors.link} />
            : <KeyRound size={26} color={V6Colors.link} />}
        </View>
        {stageContent}
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>Remembered it? </Text>
        <Tap onPress={onBackToLogin} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to sign in">
          <Text style={styles.footerLink}>Back to sign in</Text>
        </Tap>
      </View>
    </KeyboardAwareScrollView>
  );

  return (
    // KeyboardAvoidingView on Android resizes the form so the field scrolls
    // above the keyboard instead of being hidden behind it. The earlier
    // keyboard bug here came from an `elevation` change in the focus style,
    // not from this wrapper — see AuthField.
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
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.errorCard} accessibilityRole="alert">
      <AlertCircle size={17} color={V6Colors.dangerText} />
      <Text style={styles.errorText} accessibilityLiveRegion="polite">{text}</Text>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: C.canvas },
    scrollContent: { paddingHorizontal: 20 },
    card: {
      backgroundColor: C.surface,
      borderRadius: V6Radii.card,
      padding: 22,
      borderWidth: 1,
      borderColor: C.line,
      ...V6Shadows.sm,
    },
    iconWell: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: C.cyan50,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    title: { color: C.ink900, fontSize: 24, fontWeight: '800', fontFamily: 'Inter', marginBottom: 6 },
    subtitle: { color: C.ink500, fontSize: 14.5, fontFamily: 'Inter', marginBottom: 20, lineHeight: 20 },
    subtitleStrong: { color: C.ink900, fontWeight: '700' },
    fieldGap: { height: 14 },
    resendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, marginBottom: 8 },
    resendHint: { color: C.ink500, fontFamily: 'Inter', fontSize: 14 },
    resendLink: { color: V6Colors.link, fontFamily: 'Inter', fontSize: 14, fontWeight: '700' },
    resendLinkDisabled: { color: C.ink400 },
    rules: { gap: 6, marginTop: 12, marginBottom: 14 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ruleText: { color: C.ink500, fontSize: 13, fontFamily: 'Inter' },
    ruleTextOk: { color: V6Colors.successText },
    primaryButton: {
      backgroundColor: Colors.primary,
      borderRadius: V6Radii.btn,
      minHeight: 48,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
      ...V6Shadows.primaryButton,
    },
    primaryButtonDisabled: { opacity: 0.6 },
    primaryButtonText: { color: Colors.onPrimary, fontFamily: 'Inter', fontSize: 16.5, fontWeight: '700' },
    secondaryLink: { alignItems: 'center', paddingTop: 14, minHeight: 48, justifyContent: 'center' },
    secondaryLinkText: { color: V6Colors.link, fontFamily: 'Inter', fontSize: 14, fontWeight: '700' },
    noticeText: { color: V6Colors.successText, fontFamily: 'Inter', fontSize: 13.5, marginTop: 10 },
    errorCard: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14,
      backgroundColor: V6Colors.dangerSurface, borderWidth: 1, borderColor: V6Colors.dangerBorder, borderRadius: 12, padding: 11,
    },
    errorText: { flex: 1, color: V6Colors.dangerText, fontFamily: 'Inter', fontSize: 13.5, lineHeight: 18 },
    footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
    footerText: { color: C.ink500, fontFamily: 'Inter', fontSize: 14 },
    footerLink: { color: V6Colors.link, fontFamily: 'Inter', fontSize: 14, fontWeight: '700' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
