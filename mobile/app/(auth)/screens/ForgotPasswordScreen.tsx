import React, { useState } from 'react';
import {
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
import { Colors } from '../../../src/constants/theme';

interface ForgotPasswordScreenProps {
  onBackToLogin: () => void;
  onResetPassword?: (email: string) => void;
}

export default function ForgotPasswordScreen({ onBackToLogin, onResetPassword }: ForgotPasswordScreenProps) {
  const [email, setEmail] = useState('');
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.headerBg} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topSection}>
            <TouchableOpacity style={styles.backButton} onPress={onBackToLogin} activeOpacity={0.8} accessibilityLabel="Return to sign in">
              <ArrowLeft size={20} color={Colors.white} />
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
                  placeholderTextColor={Colors.muted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                />
              </View>
            </View>

            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.85} onPress={() => onResetPassword?.(email)}>
              <Text style={styles.primaryButtonText}>Send Reset Link</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  headerBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 200, backgroundColor: Colors.brandDark, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  scrollContent: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 40 },
  topSection: { flexDirection: 'row', marginBottom: 20 },
  backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: Colors.white, borderRadius: 30, padding: 24, shadowColor: '#063D4D', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 12 }, shadowRadius: 25, elevation: 6 },
  title: { color: '#1E1E1E', fontSize: 26, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  subtitle: { color: Colors.muted, fontSize: 13, fontFamily: 'Inter', marginBottom: 20, lineHeight: 20 },
  inputGroup: { marginBottom: 18 },
  inputLabel: { color: Colors.brandDark, fontFamily: 'Inter', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  inputBox: { backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(144,153,184,0.3)' },
  inputBoxFocused: { borderColor: Colors.brandTeal, borderWidth: 2 },
  inputText: { color: Colors.brandDark, fontFamily: 'Inter', fontSize: 15, padding: 0 },
  primaryButton: { backgroundColor: Colors.brandTeal, borderRadius: 24, paddingVertical: 15, alignItems: 'center', shadowColor: Colors.brandTeal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 5 },
  primaryButtonText: { color: Colors.white, fontFamily: 'Inter', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
});
