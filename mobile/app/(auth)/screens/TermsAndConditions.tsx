import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';
import { V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = {
  ...V6Colors,
  bg: V6Colors.canvas,
  dark: V6Colors.ink900,
  slate: V6Colors.ink500,
  brandDark: V6Colors.cyan900,
  brandTeal: V6Colors.cyan700,
} as const;

interface TermsAndConditionsProps {
  visible: boolean;
  /** Close without accepting. */
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

/**
 * Terms / Privacy shown as a popup over the form that linked to it, so the
 * user reads it without leaving (and losing their place in) sign-up.
 */
export default function TermsAndConditions({
  visible,
  onBack,
  onAccept,
  mode = 'terms',
}: TermsAndConditionsProps) {
  const content = mode === 'privacy' ? PRIVACY_CONTENT : TERMS_CONTENT;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onBack} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onBack} accessible={false}>
        <Pressable
          style={styles.dialog}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">{content.title}</Text>
            <TouchableOpacity
              onPress={onBack}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color={C.slate} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator>
            {content.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.heading}</Text>
                <Text style={styles.bodyText}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              onAccept();
              onBack();
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>{content.acceptLabel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(6, 61, 77, 0.5)',
  },
  dialog: {
    backgroundColor: C.white,
    borderRadius: V6Radii.card,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 18,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  title: { color: C.brandDark, fontSize: 19, fontWeight: '800', fontFamily: 'Inter', flex: 1 },
  closeBtn: { padding: 2 },

  body: { flexGrow: 0 },
  bodyContent: { paddingBottom: 6 },
  section: { marginBottom: 14 },
  sectionTitle: { color: C.dark, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
  bodyText: { color: C.slate, fontSize: 14.5, fontFamily: 'Inter', lineHeight: 20 },

  primaryBtn: {
    backgroundColor: C.brandTeal,
    borderRadius: V6Radii.btn,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginTop: 12,
    ...V6Shadows.primaryButton,
  },
  primaryBtnText: { color: C.white, fontFamily: 'Inter', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
