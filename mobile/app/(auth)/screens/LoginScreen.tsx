/**
 * LoginScreen.tsx
 *
 * Figma Source: "Log In / Sign In Screen" (id: 36:431)
 *
 * Design (from Figma):
 *  - bg: #FFFFFF with 4 blurred teal/cyan ellipses for depth
 *  - Logo: TaskBuddy wordmark (League Spartan Bold 32px #063D4D) + logo mark icon
 *  - Tagline: "Hire with confidence, pay with ease." — Darker Grotesque 800 18px #063E4D
 *  - "Welcome!" — Inter Bold 20px #063D4D
 *  - "Sign in to your account" — Inter Medium 14px #9099B8
 *  - Email + Password inputs (white box, radius 8, 40px height)
 *  - "Forgot Password?" link (Inter Bold 14px #096E8B)
 *  - "Sign In" primary button (teal, radius 24, 48px height)
 *  - "or" divider
 *  - "Continue with Google" outline button
 *  - "Don't have an account? Sign Up"
 *
 * Sign In authenticates against the backend; the account's role determines
 * which experience (homeowner / provider) is shown.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { Colors } from '../../../src/constants/theme';

const C = Colors;

// ─── Props ────────────────────────────────────────────────────────────────────
interface LoginScreenProps {
  /** Authenticate with the backend. Should reject with an Error on failure. */
  onLogin: (email: string, password: string) => Promise<void>;
  /** Initiate Google OAuth. Should reject with an Error on failure. */
  onGoogleSignIn: () => Promise<void>;
  onSignUp: () => void;
  onForgotPassword?: () => void;
}

// ─── InputField sub-component ─────────────────────────────────────────────────
interface InputFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address';
  error?: string;
  rightElement?: React.ReactNode;
  testID?: string;
}

function InputField({
  label, placeholder, value, onChangeText,
  secureTextEntry = false, keyboardType = 'default',
  error, rightElement, testID,
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={[
        styles.inputBox,
        focused && styles.inputBoxFocused,
        !!error && styles.inputBoxError,
      ]}>
        <TextInput
          testID={testID}
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
        {rightElement}
      </View>
      {!!error && <Text style={styles.inputError}>{error}</Text>}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function LoginScreen({
  onLogin,
  onGoogleSignIn,
  onSignUp,
  onForgotPassword,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (submitting) return;
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await onLogin(email, password);
      // On success the root navigator swaps to the authenticated experience.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in.');
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

  return (
    <View style={styles.screen}>
      {/* Background blobs */}
      <View style={styles.blobTopLeft} pointerEvents="none" />
      <View style={styles.blobTopRight} pointerEvents="none" />
      <View style={styles.blobBottomLeft} pointerEvents="none" />
      <View style={styles.blobBottomRight} pointerEvents="none" />

      <KeyboardAvoidingView
        style={styles.flex}
        // Resize the available layout space so all of the login content
        // reflows together without translating the form past the screen.
        behavior={Platform.OS === 'ios' ? 'height' : undefined}
      >
        <View
          style={styles.loginContent}
          // Dismiss on any background/form-area tap while allowing child
          // controls (including TextInputs) to handle the same touch.
          onTouchStart={Keyboard.dismiss}
        >
          {/* Logo */}
          <View style={styles.logoSection}>
            {/* Logo mark */}
            <View style={styles.logoMark}>
              <View style={styles.logoRect}>
                <View style={styles.logoLine} />
                <View style={[styles.logoLine, { width: 24 }]} />
                <View style={[styles.logoLine, { width: 20 }]} />
              </View>
              <View style={styles.logoFigure}>
                <View style={styles.logoHead} />
                <View style={styles.logoBody} />
              </View>
            </View>
            <Text style={styles.logoText}>TaskBuddy</Text>
            <Text style={styles.tagline}>Hire with confidence, pay with ease.</Text>
          </View>

          {/* Heading */}
          <View style={styles.headingSection}>
            <Text style={styles.welcomeText}>Welcome!</Text>
            <Text style={styles.subtitleText}>Sign in to your account</Text>
          </View>

          {/* Email */}
          <InputField
            testID="input-email"
            label="Email"
            placeholder="sample@mail.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />

          {/* Password */}
          <View style={styles.passwordSection}>
            <View style={styles.passwordLabelRow}>
              <Text style={styles.inputLabel}>Password</Text>
              <TouchableOpacity onPress={onForgotPassword}>
                <Text style={styles.forgotText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.inputBox, passwordFocused && styles.inputBoxFocused]}>
              <TextInput
                testID="input-password"
                style={[styles.inputText, styles.flex]}
                placeholder="Password"
                placeholderTextColor={C.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((s) => !s)}
                style={styles.eyeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {showPassword ? <EyeOff size={18} color={C.muted} /> : <Eye size={18} color={C.muted} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Error */}
          {!!error && (
            <Text testID="login-error" style={styles.errorBanner}>
              {error}
            </Text>
          )}

          {/* Sign In */}
          <TouchableOpacity
            testID="btn-sign-in"
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleSignIn}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={C.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Sign In</Text>
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
            testID="btn-google"
            style={[styles.googleBtn, googleLoading && styles.primaryBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleGoogleSignIn}
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

          {/* Sign Up */}
          <View style={styles.signUpRow}>
            <Text style={styles.signUpPrompt}>Don't have an account? </Text>
            <Pressable onPress={onSignUp} testID="btn-signup">
              <Text style={styles.signUpLink}>Sign Up</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const { width: W } = Dimensions.get('window');
const BLOB = Math.round(W * 1.1);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.background },

  // Blobs
  blobTopLeft: {
    position: 'absolute', width: BLOB, height: BLOB, borderRadius: BLOB / 2,
    backgroundColor: 'rgba(10,162,203,0.18)', top: -BLOB * 0.6, left: -BLOB * 0.55,
  },
  blobTopRight: {
    position: 'absolute', width: BLOB * 0.7, height: BLOB * 0.7, borderRadius: BLOB * 0.35,
    backgroundColor: 'rgba(9,110,139,0.14)', top: -BLOB * 0.3, right: -BLOB * 0.3,
  },
  blobBottomLeft: {
    position: 'absolute', width: BLOB * 0.7, height: BLOB * 0.7, borderRadius: BLOB * 0.35,
    backgroundColor: 'rgba(9,110,139,0.10)', bottom: -BLOB * 0.3, left: -BLOB * 0.35,
  },
  blobBottomRight: {
    position: 'absolute', width: BLOB, height: BLOB, borderRadius: BLOB / 2,
    backgroundColor: 'rgba(10,162,203,0.12)', bottom: -BLOB * 0.62, right: -BLOB * 0.5,
  },

  // Scroll
  loginContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 24,
  },

  // Logo
  logoSection: { marginBottom: 32, alignItems: 'flex-start' },
  logoMark: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  logoRect: {
    width: 58, height: 70, backgroundColor: C.brandCyan, borderRadius: 8,
    padding: 10, justifyContent: 'space-around',
  },
  logoLine: { height: 4, width: 26, backgroundColor: C.white, borderRadius: 50 },
  logoFigure: { alignItems: 'center', gap: 4 },
  logoHead: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFEECF' },
  logoBody: { width: 26, height: 18, backgroundColor: C.brandTeal },
  logoText: {
    fontFamily: 'League Spartan', fontSize: 32, fontWeight: '700',
    color: C.brandDark, letterSpacing: 0.32, marginBottom: 4,
  },
  tagline: {
    fontFamily: 'Inter', fontSize: 13, fontWeight: '600',
    color: C.brandDark, opacity: 0.7,
  },

  // Heading
  headingSection: { marginBottom: 16 },
  welcomeText: {
    fontFamily: 'Inter', fontSize: 20, fontWeight: '700',
    color: C.brandDark, letterSpacing: 0.2, marginBottom: 4,
  },
  subtitleText: {
    fontFamily: 'Inter', fontSize: 14, fontWeight: '500',
    color: C.muted, letterSpacing: 0.14,
  },

  // Role selector (DEMO)
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  roleChip: {
    flex: 1, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(144,153,184,0.4)',
    backgroundColor: C.white, alignItems: 'center',
  },
  roleChipActive: {
    backgroundColor: C.brandDark, borderColor: C.brandDark,
  },
  roleChipText: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', color: C.muted },
  roleChipTextActive: { color: C.white },

  // Inputs
  inputGroup: { marginBottom: 18 },
  inputLabel: {
    fontFamily: 'Inter', fontSize: 15, fontWeight: '600',
    color: C.brandDark, lineHeight: 21, marginBottom: 8,
  },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.white, borderRadius: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    minHeight: 40, borderWidth: 1,
    borderColor: 'rgba(144,153,184,0.25)',
    shadowColor: '#063D4D', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  inputBoxFocused: { borderColor: C.brandTeal },
  inputBoxError: { borderColor: C.error },
  inputText: {
    flex: 1, fontFamily: 'Inter', fontSize: 16, fontWeight: '400',
    color: C.brandDark, padding: 0, margin: 0,
  },
  inputError: {
    fontFamily: 'Inter', fontSize: 13, color: C.error,
    marginTop: 4, lineHeight: 18,
  },

  // Password
  passwordSection: { marginBottom: 18 },
  passwordLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  forgotText: { fontFamily: 'Inter', fontSize: 13, fontWeight: '700', color: C.brandTeal, textDecorationLine: 'underline' },
  eyeBtn: { paddingLeft: 8 },
  eyeIcon: { fontSize: 16 },

  // Primary button
  primaryBtn: {
    backgroundColor: C.brandTeal, borderRadius: 24,
    paddingVertical: 14, alignItems: 'center', marginBottom: 24, minHeight: 48,
    shadowColor: C.brandTeal, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 5,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    fontFamily: 'Inter', fontSize: 15, fontWeight: '600',
    color: C.white, letterSpacing: 0.3,
  },
  errorBanner: {
    fontFamily: 'Inter', fontSize: 13, color: C.error,
    marginBottom: 12, lineHeight: 18,
  },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.muted, opacity: 0.4 },
  dividerText: { fontFamily: 'Roboto', fontSize: 13, color: C.muted },

  // Google
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(144,153,184,0.5)', borderRadius: 24,
    paddingVertical: 12, paddingHorizontal: 24, marginBottom: 32, gap: 10,
    minHeight: 44, backgroundColor: C.white,
  },
  googleIcon: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#EA4335', alignItems: 'center', justifyContent: 'center',
  },
  googleIconText: { color: C.white, fontSize: 12, fontWeight: '700' },
  googleBtnText: {
    fontFamily: 'Inter', fontSize: 14, fontWeight: '500',
    color: C.googleText, letterSpacing: 0.1,
  },

  // Sign Up
  signUpRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signUpPrompt: { fontFamily: 'Inter', fontSize: 14, fontWeight: '500', color: C.muted },
  signUpLink: { fontFamily: 'Roboto', fontSize: 14, fontWeight: '700', color: C.brandTeal, textDecorationLine: 'underline' },

});
