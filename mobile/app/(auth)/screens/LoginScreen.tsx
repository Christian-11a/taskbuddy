/**
 * LoginScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #login screen (background
 * gradient #cdeef7 -> white, cyan wordmark, cyan-700 primary button).
 *
 * Sign In authenticates against the backend; the account's role determines
 * which experience (homeowner / provider) is shown.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, EyeOff } from 'lucide-react-native';
import { V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;

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
  hasError?: boolean;
  rightElement?: React.ReactNode;
  testID?: string;
}

function InputField({
  label, placeholder, value, onChangeText,
  secureTextEntry = false, keyboardType = 'default',
  error, rightElement, testID,
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);

  // NOTE: previously there was a `keyboardDidShow` listener here that called
  // `inputRef.current.focus()` again once the keyboard finished animating in.
  // That forced a *second* focus/measure pass on top of the one RN already
  // does automatically, which is what produced the "jump to the top, then
  // slide back down" animation on iOS. Removed — RN handles this on its own.

  return (
    <View style={styles.inputGroup}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={[
        styles.inputBox,
        focused && styles.inputBoxFocused,
        !!error && styles.inputBoxError,
      ]}>
        <TextInput
          testID={testID}
          style={styles.inputText}
          placeholder={placeholder}
          placeholderTextColor={C.ink400}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={Keyboard.dismiss}
          enablesReturnKeyAutomatically
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
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFields = () => {
    const errors: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);

    if (!trimmedEmail) {
      errors.email = 'Please enter your email address.';
    } else if (!validEmail) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      errors.password = 'Please enter your password.';
    }

    return errors;
  };

  const handleSignIn = async () => {
    if (submitting) return;
    setError(null);

    const errors = validateFields();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
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

  const scrollContent = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.loginContent}
      // "handled" lets taps on buttons/links still register while any other
      // tap outside an input bubbles up and dismisses the keyboard (fixes #4).
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
      showsVerticalScrollIndicator={false}
      // iOS 17+/RN 0.71+: lets the ScrollView resize its content insets to
      // match the keyboard smoothly, without a manual KeyboardAvoidingView
      // fighting it. This removes both the jump (#1) and the extra empty
      // gap before the keyboard (#3).
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      {/* Logo */}
      <View style={styles.logoSection}>
        <Image source={require('../../../assets/taskbuddy-logo.png')} style={styles.logoMark} resizeMode="contain" />
        <Text style={styles.logoText}>TaskBuddy</Text>
        <Text style={styles.tagline}>Hire with confidence, pay with ease.</Text>
      </View>

      {/* Heading */}
      <View style={styles.headingSection}>
        <Text style={styles.welcomeText}>Welcome!</Text>
        <Text style={styles.subtitleText}>Sign in to your account</Text>
      </View>

      <InputField
        label="Email"
        placeholder="sample@mail.com"
        testID="input-email"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (fieldErrors.email) {
            const trimmed = value.trim();
            const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
            if (trimmed && validEmail) {
              setFieldErrors((prev) => ({ ...prev, email: undefined }));
            }
          }
        }}
        keyboardType="email-address"
        error={fieldErrors.email}
      />

      <View style={styles.passwordSection}>
        <View style={styles.passwordLabelRow}>
          <Text style={styles.inputLabel}>Password</Text>
          <TouchableOpacity onPress={onForgotPassword}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        <InputField
          label=""
          placeholder="Password"
          testID="input-password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          secureTextEntry={!showPassword}
          error={fieldErrors.password}
          rightElement={
            <TouchableOpacity
              onPress={() => setShowPassword((s) => !s)}
              style={styles.eyeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {showPassword ? <EyeOff size={20} color={C.ink400} /> : <Eye size={20} color={C.ink400} />}
            </TouchableOpacity>
          }
        />
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
          <ActivityIndicator color={C.cyan700} />
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
    </ScrollView>
  );

  return (
    // LinearGradient is the actual container here (not an absolute-fill
    // overlay sibling with pointerEvents="none") specifically so touches
    // reach the inputs below it unambiguously — a decorative overlay sibling
    // has caused touch-passthrough issues on some Android/library versions
    // even with pointerEvents set, and this sidesteps that class of bug
    // entirely: children of a normal View-like container always receive
    // touches, no workaround needed.
    <LinearGradient
      colors={['#cdeef7', '#ffffff']}
      locations={[0, 0.55]}
      style={styles.screen}
    >
      {/* Keyboard handling: the ScrollView's keyboardShouldPersistTaps +
          keyboardDismissMode handle taps/dismissal; KeyboardAvoidingView on
          Android resizes the form so the focused field/Sign In button scrolls
          above the keyboard instead of being hidden behind it (matches this
          screen's original working pattern — behavior="height" on Android).

          The focus/keyboard bug that plagued this screen was NOT caused by
          this wrapper — it was `inputBoxFocused` adding an Android
          `elevation` on focus. See the note on that style below. */}
      {Platform.OS === 'android' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="height" keyboardVerticalOffset={0}>
          {scrollContent}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>{scrollContent}</View>
      )}
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: C.white },

  // Scroll
  loginContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingTop: 96,
    paddingBottom: 40,
  },

  // Logo — matches .logo-mark (46x52)
  logoSection: { marginBottom: 12, alignItems: 'center' },
  logoMark: { width: 104, height: 117, alignSelf: 'center' },
  logoText: {
    fontFamily: 'Inter', fontSize: 31.5, fontWeight: '800',
    color: C.cyan900, textAlign: 'center', marginTop: 12, marginBottom: 2,
  },
  tagline: {
    fontFamily: 'Inter', fontSize: 18.5, fontWeight: '800',
    color: C.cyan900, textAlign: 'center',
  },

  // Heading
  headingSection: { marginTop: 28, marginBottom: 6 },
  welcomeText: {
    fontFamily: 'Inter', fontSize: 23, fontWeight: '800', color: C.ink900,
  },
  subtitleText: {
    fontFamily: 'Inter', fontSize: 15.5, fontWeight: '400', color: C.ink400, marginTop: 2,
  },

  // Inputs — matches .field input (v3 cascaded-final)
  inputGroup: { marginBottom: 16 },
  inputLabel: {
    fontFamily: 'Inter', fontSize: 15.5, fontWeight: '700', color: C.ink900, marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.white, borderRadius: V6Radii.input,
    paddingHorizontal: 14, minHeight: 46, borderWidth: 1,
    borderColor: '#dce3e9',
  },
  // Border-colour ONLY — never add a shadow/elevation here.
  //
  // The mockup's focus ring is `box-shadow:0 0 0 3px rgba(6,182,212,.12)`, and
  // porting that as `...V6Shadows.sm` (which carries `elevation: 1`) broke text
  // entry app-wide on Android: changing `elevation` on the View that *wraps* a
  // focused TextInput makes Android re-create that view, so the EditText loses
  // focus and the keyboard closes the instant it opens. Symptom was focus
  // visibly jumping between fields and the keyboard flashing shut.
  //
  // Verified on-device (Pixel emulator, Expo Go): with elevation, tapping Email
  // left focused=false / mInputShown=false / mServedView=null; without it,
  // focused=true / mInputShown=true and typing lands in the right field.
  inputBoxFocused: {
    borderColor: C.cyan500,
  },
  inputBoxError: { borderColor: '#fecaca' },
  inputText: {
    flex: 1, fontFamily: 'Inter', fontSize: 16.5, fontWeight: '400',
    color: C.ink900, padding: 0, margin: 0,
  },
  inputError: {
    fontFamily: 'Inter', fontSize: 14.5, color: '#b91c1c', marginTop: 4,
  },

  // Password
  passwordSection: {},
  passwordLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  forgotText: { fontFamily: 'Inter', fontSize: 15.5, fontWeight: '700', color: C.cyan800 },
  eyeBtn: { paddingLeft: 8 },

  // Primary button — matches .btn-primary (solid cyan700, v3 cascaded-final)
  primaryBtn: {
    backgroundColor: C.cyan700, borderRadius: V6Radii.btn,
    paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 20, minHeight: 46,
    ...V6Shadows.primaryButton,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    fontFamily: 'Inter', fontSize: 18.5, fontWeight: '700', color: C.white,
  },
  errorBanner: {
    fontFamily: 'Inter', fontSize: 15.5, color: '#b91c1c', marginBottom: 12, lineHeight: 18,
  },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.ink100 },
  dividerText: { fontFamily: 'Inter', fontSize: 15.5, color: C.ink300 },

  // Google — matches .btn-outline
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#dce3e9', borderRadius: V6Radii.btn,
    paddingVertical: 12, paddingHorizontal: 24, marginBottom: 28, gap: 10,
    minHeight: 46, backgroundColor: C.white,
  },
  googleIcon: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#EA4335', alignItems: 'center', justifyContent: 'center',
  },
  googleIconText: { color: C.white, fontSize: 14.5, fontWeight: '700' },
  googleBtnText: {
    fontFamily: 'Inter', fontSize: 16.5, fontWeight: '600', color: C.ink700,
  },

  // Sign Up
  signUpRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  signUpPrompt: { fontFamily: 'Inter', fontSize: 15.5, fontWeight: '400', color: C.ink400 },
  signUpLink: { fontFamily: 'Inter', fontSize: 15.5, fontWeight: '700', color: C.cyan800 },
});
