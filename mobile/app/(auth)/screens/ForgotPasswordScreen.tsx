import React, { useState } from 'react';
import {
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

const C = V6Colors;

interface ForgotPasswordScreenProps {
  onBackToLogin: () => void;
  onResetPassword?: (email: string) => void;
}

export default function ForgotPasswordScreen({ onBackToLogin, onResetPassword }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);

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
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>Enter your email and we'll send a reset link to your inbox.</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={[styles.inputBox, focused && styles.inputBoxFocused]}>
                <TextInput
                  style={styles.inputText}
                  placeholder="sample@mail.com"
                  placeholderTextColor={C.ink400}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onSubmitEditing={Keyboard.dismiss}
                  enablesReturnKeyAutomatically
                />
              </View>
            </View>

            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={() => onResetPassword?.(email)}>
              <Text style={styles.primaryButtonText}>Send Reset Link</Text>
            </TouchableOpacity>
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
  primaryButtonText: { color: C.white, fontFamily: 'Inter', fontSize: 18.5, fontWeight: '700' },
});
