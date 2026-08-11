import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { Colors } from '../../../src/constants/theme';

const C = {
  ...Colors,
  bg: '#F8FAFC',
  dark: '#1E1E1E',
  slate: '#757575',
  mutedBorder: 'rgba(144,153,184,0.3)',
} as const;

interface TermsAndConditionsProps {
  onBack: () => void;
  onAccept: () => void;
  /**
   * Which document to display.
   * - 'terms'   → Terms & Conditions (default)
   * - 'privacy' → Privacy Policy
   */
  mode?: 'terms' | 'privacy';
}

const TERMS_CONTENT = {
  title: 'Terms & Conditions',
  sections: [
    {
      heading: 'TaskBuddy Terms of Use',
      body: 'By creating an account, you agree to use TaskBuddy responsibly, provide accurate account details, and respect the community guidelines for both homeowners and service providers.',
    },
    {
      heading: 'Platform Facilitator',
      body: 'You understand that payments, bookings, and service arrangements are managed through the platform and that TaskBuddy acts as a facilitator between users.',
    },
    {
      heading: 'Data & Notifications',
      body: 'Your data will be used to improve the experience, support account security, and deliver relevant notifications. You may contact support at any time for questions about your account or activity.',
    },
    {
      heading: 'Policy Updates',
      body: 'Continued use of the app indicates your acceptance of future platform updates and policy changes communicated through the app.',
    },
  ],
  acceptLabel: 'I agree to the Terms & Conditions',
};

const PRIVACY_CONTENT = {
  title: 'Privacy Policy',
  sections: [
    {
      heading: 'What We Collect',
      body: 'We collect the personal information you provide when creating an account (name, email, phone) and information generated through your use of the platform (job history, messages, location when sharing is enabled).',
    },
    {
      heading: 'How We Use Your Data',
      body: 'Your data is used to match homeowners with service providers, process payments, deliver notifications, and improve the TaskBuddy platform. We do not sell your personal information to third parties.',
    },
    {
      heading: 'Data Storage & Security',
      body: 'Data is stored securely using industry-standard encryption. Service provider identity documents are stored in a private, access-controlled bucket and are only visible to TaskBuddy administrators.',
    },
    {
      heading: 'Your Rights (RA 10173)',
      body: 'Under the Data Privacy Act of 2012, you have the right to access, correct, and request deletion of your personal data. Contact our Data Protection Officer at privacy@taskbuddy.ph.',
    },
    {
      heading: 'Retention',
      body: 'Account data is retained for the duration of your account and for up to 2 years after account closure for compliance purposes. Identity verification documents are deleted after the review is complete.',
    },
  ],
  acceptLabel: 'I agree to the Privacy Policy',
};

export default function TermsAndConditions({
  onBack,
  onAccept,
  mode = 'terms',
}: TermsAndConditionsProps) {
  const content = mode === 'privacy' ? PRIVACY_CONTENT : TERMS_CONTENT;

  return (
    <View style={styles.screen}>
      <View style={styles.headerBg} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topSection}>
            <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
              <ArrowLeft size={20} color={C.white} />
            </TouchableOpacity>
            <Text style={styles.title}>{content.title}</Text>
          </View>

          <View style={styles.card}>
            {content.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.heading}</Text>
                <Text style={styles.bodyText}>{section.body}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              onAccept();
              onBack();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>{content.acceptLabel}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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

  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: C.white, fontSize: 20, fontWeight: '700', fontFamily: 'Inter', flex: 1 },

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

  section: { marginBottom: 16 },
  sectionTitle: {
    color: C.dark,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Inter',
    marginBottom: 6,
  },
  bodyText: {
    color: C.slate,
    fontSize: 14,
    fontFamily: 'Inter',
    lineHeight: 22,
  },

  primaryBtn: {
    backgroundColor: C.brandTeal,
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: C.brandTeal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  primaryBtnText: {
    color: C.white,
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
