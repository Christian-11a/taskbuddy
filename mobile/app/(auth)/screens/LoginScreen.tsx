/**
 * LoginScreen.tsx
 *
 * Sign-in: the logo, "Welcome back", email and password in the shared
 * AuthField, "Forgot password?" under the password, the Sign in button, an
 * "or" divider, Continue with Google (same height and shape as Sign in), and
 * "New here? Create an account" at the bottom.
 *
 * Sign In authenticates against the backend; the account's role determines
 * which experience (homeowner / provider) is shown.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useRef, useState } from 'react';
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
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import GoogleGlyph from '../../../src/components/GoogleGlyph';
import AuthField from '../../../src/components/auth/AuthField';
import { V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useAuthLayout } from '../../../src/hooks/useAuthLayout';
import { EMAIL_MAX, validateEmail } from '../../../src/lib/inputRules';

// ─── Props ────────────────────────────────────────────────────────────────────
interface LoginScreenProps {
  /** Authenticate with the backend. Should reject with an Error on failure. */
  onLogin: (email: string, password: string) => Promise<void>;
  /** Initiate Google OAuth. Should reject with an Error on failure. */
  onGoogleSignIn: () => Promise<void>;
  onSignUp: () => void;
  onForgotPassword?: () => void;
  /**
   * A sign-in failure raised outside this screen's own lifetime — a Google
   * flow that failed after the screen unmounted, or one resumed on launch.
   */
  signInError?: string | null;
  onClearSignInError?: () => void;
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function LoginScreen({
  onLogin,
  onGoogleSignIn,
  onSignUp,
  onForgotPassword,
  signInError,
  onClearSignInError,
}: LoginScreenProps) {
  const { styles, compactStyles, Colors, V6Colors } = useThemedStyles(createThemedStyles);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);
  const layout = useAuthLayout();
  const cs = layout.compact ? compactStyles : null;

  // A Google sign-in can fail after this screen has been unmounted — or resume
  // and fail on the next launch, before it is mounted at all — so that failure
  // is held in AuthContext and shown here rather than being lost.
  const shownError = error ?? signInError ?? null;

  const validateFields = () => {
    const errors: { email?: string; password?: string } = {};
    const emailError = validateEmail(email);
    if (emailError) errors.email = emailError;

    // Presence only: whether the password is right is for the server to say.
    // Spaces alone are no password.
    if (!password.trim()) {
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
      await onLogin(email.trim(), password);
      // On success the root navigator swaps to the authenticated experience.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading || submitting) return;
    onClearSignInError?.();
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
      contentContainerStyle={[
        styles.loginContent,
        { paddingTop: layout.paddingTop, paddingBottom: layout.paddingBottom },
      ]}
      // "handled" lets taps on buttons/links still register while any other
      // tap outside an input bubbles up and dismisses the keyboard (fixes #4).
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      // iOS 17+/RN 0.71+: lets the ScrollView resize its content insets to
      // match the keyboard smoothly, without a manual KeyboardAvoidingView
      // fighting it. This removes both the jump (#1) and the extra empty
      // gap before the keyboard (#3).
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      {/* Logo */}
      <View style={styles.logoSection}>
        <Image source={require('../../../assets/taskbuddy-logo.png')} style={[styles.logoMark, cs?.logoMark]} resizeMode="contain" />
      </View>

      {/* Heading */}
      <View style={[styles.headingSection, cs?.headingSection]}>
        <Text style={styles.welcomeText} accessibilityRole="header">Welcome back</Text>
        <Text style={styles.subtitleText}>Sign in to your TaskBuddy account</Text>
      </View>

      <AuthField
        label="Email"
        placeholder="sample@mail.com"
        testID="input-email"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (fieldErrors.email && validateEmail(value) === null) {
            setFieldErrors((prev) => ({ ...prev, email: undefined }));
          }
        }}
        onBlur={() => setFieldErrors((prev) => ({ ...prev, email: validateEmail(email) ?? undefined }))}
        keyboardType="email-address"
        maxLength={EMAIL_MAX}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={fieldErrors.email}
      />

      <View style={styles.passwordSection}>
        <AuthField
          ref={passwordRef}
          secure
          label="Password"
          placeholder="Password"
          testID="input-password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
          }}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          error={fieldErrors.password}
        />
        <View style={[styles.forgotRow, cs?.forgotRow]}>
          <Tap
            onPress={onForgotPassword}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 0 }}
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Tap>
        </View>
      </View>

      {/* Error */}
      {!!shownError && (
        <Text testID="login-error" style={styles.errorBanner} accessibilityRole="alert">
          {shownError}
        </Text>
      )}

      {/* Sign In */}
      <Tap
        testID="btn-sign-in"
        style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
        activeOpacity={0.85}
        onPress={handleSignIn}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
      >
        {submitting ? (
          <ActivityIndicator color={Colors.onPrimary} />
        ) : (
          <Text style={styles.primaryBtnText}>Sign in</Text>
        )}
      </Tap>

      {/* Divider */}
      <View style={[styles.dividerRow, cs?.dividerRow]}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      {/* Google */}
      <Tap
        testID="btn-google"
        style={[styles.googleBtn, googleLoading && styles.primaryBtnDisabled]}
        activeOpacity={0.85}
        onPress={handleGoogleSignIn}
        disabled={googleLoading || submitting}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
      >
        {googleLoading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <GoogleGlyph size={20} />
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </>
        )}
      </Tap>

      {/* Create account */}
      <View style={[styles.signUpRow, cs?.signUpRow]}>
        <Text style={styles.signUpPrompt}>New here? </Text>
        <Pressable
          onPress={onSignUp}
          testID="btn-signup"
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Create an account"
        >
          <Text style={styles.signUpLink}>Create an account</Text>
        </Pressable>
      </View>
    </ScrollView>
  );

  return (
    // The Android KeyboardAvoidingView keeps the focused field and Sign in above
    // the keyboard; the focus bug this screen once had came from an elevation
    // change on the field wrapper, which AuthField deliberately never sets.
    <View style={[styles.screen, { backgroundColor: V6Colors.surface }]}>
      {Platform.OS === 'android' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="height" keyboardVerticalOffset={0}>
          {scrollContent}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>{scrollContent}</View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// Short screens (small phones, 3-button Android nav): trims vertical space so
// less scrolling is needed; enlarged text can still extend the form.

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    screen: { flex: 1, backgroundColor: V6Colors.surface },

    loginContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
    },

    logoSection: { alignItems: 'center' },
    logoMark: { width: 88, height: 98, alignSelf: 'center' },

    headingSection: { alignItems: 'center', marginTop: 16, marginBottom: 28 },
    welcomeText: {
      fontFamily: 'Inter', fontSize: 26, fontWeight: '800', lineHeight: 32,
      color: V6Colors.ink900, textAlign: 'center',
    },
    subtitleText: {
      fontFamily: 'Inter', fontSize: 15, lineHeight: 20, color: V6Colors.ink500,
      marginTop: 4, textAlign: 'center',
    },

    passwordSection: { gap: 0 },
    forgotRow: { alignItems: 'flex-end', marginTop: 8, marginBottom: 20 },
    forgotText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '700', color: V6Colors.link },

    errorBanner: {
      fontFamily: 'Inter', fontSize: 14, lineHeight: 19, color: V6Colors.dangerText, marginBottom: 12,
    },

    // Sign in and Google share one height, radius and padding (see googleBtn).
    primaryBtn: {
      backgroundColor: Colors.primary, borderRadius: V6Radii.btn,
      paddingVertical: 14, paddingHorizontal: 24, minHeight: 48,
      alignItems: 'center', justifyContent: 'center',
      ...V6Shadows.primaryButton,
    },
    primaryBtnDisabled: { opacity: 0.7 },
    primaryBtnText: {
      fontFamily: 'Inter', fontSize: 17, fontWeight: '700', color: Colors.onPrimary,
    },

    dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 12 },
    dividerLine: { flex: 1, height: 1, backgroundColor: V6Colors.line },
    dividerText: { fontFamily: 'Inter', fontSize: 14, color: V6Colors.ink500 },

    // Google's dark sign-in button: #131314, light text, four-colour G; same
    // shape and height as the primary button above it.
    // The light border only shows in dark mode, where the page is near-black.
    googleBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
      backgroundColor: '#131314', borderRadius: V6Radii.btn,
      paddingVertical: 14, paddingHorizontal: 24, minHeight: 48,
      borderWidth: 1, borderColor: theme.appearance === 'dark' ? '#8E918F' : '#131314',
    },
    googleBtnText: { fontFamily: 'Inter', fontSize: 16, fontWeight: '700', color: '#ffffff' },

    signUpRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
    signUpPrompt: { fontFamily: 'Inter', fontSize: 15, fontWeight: '400', color: V6Colors.ink500 },
    signUpLink: { fontFamily: 'Inter', fontSize: 15, fontWeight: '700', color: V6Colors.link },
  });
  const compactStyles = StyleSheet.create({
    logoMark: { width: 64, height: 72 },
    headingSection: { marginTop: 8, marginBottom: 16 },
    forgotRow: { marginBottom: 12 },
    dividerRow: { marginVertical: 12 },
    signUpRow: { marginTop: 12 },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles, compactStyles };
}
