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

import React, { useState } from 'react';
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
import { ArrowLeft } from 'lucide-react-native';
import { V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useAuth } from '../../../src/context/AuthContext';
import { api } from '../../../src/lib/api';

const C = V6Colors;

interface ForgotPasswordScreenProps {
  onBackToLogin: () => void;
}

export default function ForgotPasswordScreen({ onBackToLogin }: ForgotPasswordScreenProps) {
  const { resetPassword } = useAuth();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Enter the email address on your account.');
      return;
    }
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setStage('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    setError(null);
    if (!code.trim()) {
      setError('Enter the code from your email.');
      return;
    }
    // Mirrors the backend's MinLength(8) on ResetPasswordDto.new_password.
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Those passwords do not match.');
      return;
    }
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

  const scrollContent = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
          <View style={styles.topSection}>
            <TouchableOpacity style={styles.backButton} onPress={onBackToLogin} activeOpacity={0.8} accessibilityLabel="Return to sign in">
              <ArrowLeft size={21} color={C.ink700} />
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            {stage === 'email' ? (
              <>
                <Text style={styles.title}>Forgot Password?</Text>
                <Text style={styles.subtitle}>
                  Enter your email and we'll send a 6-digit reset code to your inbox.
                </Text>

                <View style={styles.inputGroup}>
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
                      editable={!busy}
                      onFocus={() => setFocused('email')}
                      onBlur={() => setFocused(null)}
                      onSubmitEditing={Keyboard.dismiss}
                      enablesReturnKeyAutomatically
                    />
                  </View>
                </View>

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
                  activeOpacity={0.85}
                  onPress={() => void sendCode()}
                  disabled={busy}
                >
                  {busy
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={styles.primaryButtonText}>Send Reset Code</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.title}>Check your email</Text>
                <Text style={styles.subtitle}>
                  If {email.trim()} has an account, a 6-digit code is on its way. Enter it
                  below with your new password.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Reset code</Text>
                  <View style={[styles.inputBox, focused === 'code' && styles.inputBoxFocused]}>
                    <TextInput
                      style={styles.inputText}
                      placeholder="123456"
                      placeholderTextColor={C.ink400}
                      value={code}
                      onChangeText={setCode}
                      keyboardType="number-pad"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!busy}
                      maxLength={6}
                      onFocus={() => setFocused('code')}
                      onBlur={() => setFocused(null)}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>New password</Text>
                  <View style={[styles.inputBox, focused === 'new' && styles.inputBoxFocused]}>
                    <TextInput
                      style={styles.inputText}
                      placeholder="At least 8 characters"
                      placeholderTextColor={C.ink400}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      editable={!busy}
                      onFocus={() => setFocused('new')}
                      onBlur={() => setFocused(null)}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm new password</Text>
                  <View style={[styles.inputBox, focused === 'confirm' && styles.inputBoxFocused]}>
                    <TextInput
                      style={styles.inputText}
                      placeholder="Re-enter your new password"
                      placeholderTextColor={C.ink400}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      editable={!busy}
                      onFocus={() => setFocused('confirm')}
                      onBlur={() => setFocused(null)}
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>
                </View>

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
                  activeOpacity={0.85}
                  onPress={() => void submitReset()}
                  disabled={busy}
                >
                  {busy
                    ? <ActivityIndicator color={C.white} />
                    : <Text style={styles.primaryButtonText}>Reset Password</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryLink}
                  activeOpacity={0.7}
                  onPress={() => { setStage('email'); setError(null); }}
                  disabled={busy}
                >
                  <Text style={styles.secondaryLinkText}>Use a different email</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
    </ScrollView>
  );

  return (
    // KeyboardAvoidingView on Android resizes the form so the field scrolls
    // above the keyboard instead of being hidden behind it (matches this
    // screen's original working pattern). The earlier keyboard bug here came
    // from an `elevation` change in the focus style, not from this wrapper —
    // see inputBoxFocused below.
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.canvas },
  scrollContent: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 40 },
  topSection: { flexDirection: 'row', marginBottom: 20 },
  backButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: C.white, borderRadius: V6Radii.card, padding: 24, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 12 }, shadowRadius: 25, elevation: 6 },
  title: { color: C.ink900, fontSize: 31.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 4 },
  subtitle: { color: C.ink500, fontSize: 15.5, fontFamily: 'Inter', marginBottom: 20, lineHeight: 20 },
  inputGroup: { marginBottom: 18 },
  inputLabel: { color: C.ink900, fontFamily: 'Inter', fontSize: 15.5, fontWeight: '700', marginBottom: 6 },
  inputBox: { backgroundColor: C.white, borderRadius: V6Radii.input, paddingHorizontal: 14, minHeight: 46, justifyContent: 'center', borderWidth: 1, borderColor: '#dce3e9' },
  // NOTE: deliberately border-colour only. Do NOT add a shadow/elevation to a
  // focus style that wraps a TextInput: on Android, changing `elevation` on an
  // ancestor while it holds focus makes the platform re-create that view, which
  // drops the EditText's focus and dismisses the keyboard the instant it opens.
  // Verified on-device — see LoginScreen's inputBoxFocused for the same fix.
  inputBoxFocused: { borderColor: C.cyan500 },
  inputText: { color: C.ink900, fontFamily: 'Inter', fontSize: 16.5, padding: 0 },
  primaryButton: { backgroundColor: C.cyan700, borderRadius: V6Radii.btn, paddingVertical: 15, alignItems: 'center', ...V6Shadows.primaryButton },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: { color: C.white, fontFamily: 'Inter', fontSize: 18.5, fontWeight: '700' },
  secondaryLink: { alignItems: 'center', paddingVertical: 14 },
  secondaryLinkText: { color: C.cyan700, fontFamily: 'Inter', fontSize: 14.5, fontWeight: '700' },
  errorText: { color: '#ef4444', fontFamily: 'Inter', fontSize: 14, marginBottom: 12 },
});
