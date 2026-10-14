import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import ViewSwitch from '../../../src/components/ui/ViewSwitch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { V6Radii, V6Shadows } from '../../../src/constants/theme';

type Doc = 'terms' | 'privacy';

interface TermsAndConditionsProps {
  visible: boolean;
  /** Close. Whatever was already accepted stays accepted. */
  onBack: () => void;
  /** Called with the document whose "I agree" was tapped. */
  onAccept: (doc: Doc) => void;
  /** The tab the pop-up opens on. Default 'terms'. */
  mode?: Doc;
  /** Documents accepted so far. Their tabs show a check mark, and the pop-up closes once both are accepted. */
  accepted?: Record<Doc, boolean>;
}

/** A document counts as read when its text is within this many dp of the end, or fits the viewport. */
const END_SLOP = 24;
const NOT_ACCEPTED: Record<Doc, boolean> = { terms: false, privacy: false };

const TERMS_CONTENT = {
  title: 'Terms & Conditions',
  sections: [
    {
      heading: 'TaskBuddy Terms of Use',
      body: 'By creating an account, you agree to use TaskBuddy responsibly, provide accurate account details, and respect the community guidelines for both clients and service providers.',
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
      body: 'Your data is used to match clients with service providers, process payments, deliver notifications, and improve the TaskBuddy platform. We do not sell your personal information to third parties.',
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
 * Terms and Privacy in one pop-up over the form that linked to it, with a tab for each document, so the
 * user reads it without leaving (and losing their place in) sign-up. "I agree" is enabled once that tab's
 * text has been scrolled to the end. Accepting one document moves on to the other until both are accepted.
 */
export default function TermsAndConditions({
  visible,
  onBack,
  onAccept,
  mode = 'terms',
  accepted = NOT_ACCEPTED,
}: TermsAndConditionsProps) {
  const { C, styles } = useThemedStyles(createThemedStyles);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Doc>(mode);
  // Documents whose text has been read to the end. An accepted document counts as read too.
  const [read, setRead] = useState<Record<Doc, boolean>>(NOT_ACCEPTED);
  // Measurements of the tab on screen. Reset with each tab, so the previous tab's text never counts.
  const measured = useRef({ layout: 0, content: 0 });
  const content = tab === 'privacy' ? PRIVACY_CONTENT : TERMS_CONTENT;
  const isRead = read[tab] || accepted[tab];

  const showTab = (doc: Doc) => {
    measured.current = { layout: 0, content: 0 };
    setTab(doc);
  };

  // Each time the pop-up opens, it starts on the document it was asked for.
  useEffect(() => {
    if (visible) showTab(mode);
  }, [visible, mode]);

  const settle = (doc: Doc, offset: number, layout: number, contentHeight: number) => {
    if (layout <= 0 || contentHeight <= 0) return;
    if (offset + layout < contentHeight - END_SLOP) return;
    setRead((r) => (r[doc] ? r : { ...r, [doc]: true }));
  };

  const agree = () => {
    onAccept(tab);
    const other: Doc = tab === 'terms' ? 'privacy' : 'terms';
    // Both accepted once this one is: close. Otherwise carry on to the other document.
    if (accepted[other]) {
      onBack();
      return;
    }
    showTab(other);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onBack} statusBarTranslucent>
      <View style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onBack} accessible={false} />
        <View
          style={[styles.dialog, { height: Math.max(0, height - insets.top - insets.bottom - 24) }]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View style={styles.tabs}>
              <ViewSwitch<Doc>
                options={[
                  { key: 'terms', label: accepted.terms ? 'Terms ✓' : 'Terms' },
                  { key: 'privacy', label: accepted.privacy ? 'Privacy ✓' : 'Privacy' },
                ]}
                value={tab}
                onChange={showTab}
              />
            </View>
            <Tap
              onPress={onBack}
              style={styles.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color={C.slate} />
            </Tap>
          </View>

          <ScrollView
            key={tab}
            testID="terms-body"
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator
            scrollEventThrottle={100}
            onLayout={(e) => {
              measured.current.layout = e.nativeEvent.layout.height;
              settle(tab, 0, measured.current.layout, measured.current.content);
            }}
            onContentSizeChange={(_width, contentHeight) => {
              measured.current.content = contentHeight;
              settle(tab, 0, measured.current.layout, contentHeight);
            }}
            onScroll={(e) => {
              const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
              settle(tab, contentOffset.y, layoutMeasurement.height, contentSize.height);
            }}
            // Screen readers can mark the text as read without scrolling to its end.
            accessibilityActions={isRead ? undefined : [{ name: 'markAsRead', label: 'Mark as read' }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'markAsRead') setRead((r) => ({ ...r, [tab]: true }));
            }}
          >
            {content.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">{section.heading}</Text>
                <Text style={styles.bodyText}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          {!isRead && <Text style={styles.hint}>Scroll to the end to continue</Text>}
          <Tap
            style={[styles.primaryBtn, !isRead && styles.primaryBtnOff]}
            onPress={agree}
            disabled={!isRead}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ disabled: !isRead }}
          >
            <Text style={[styles.primaryBtnText, !isRead && styles.primaryBtnTextOff]}>{content.acceptLabel}</Text>
          </Tap>
        </View>
      </View>
    </Modal>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = {
    ...V6Colors,
    bg: V6Colors.canvas,
    dark: V6Colors.ink900,
    slate: V6Colors.ink500,
    brandDark: V6Colors.cyan900,
    brandTeal: V6Colors.cyan700,
  } as const;
  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      padding: 20,
      backgroundColor: 'rgba(6, 61, 77, 0.5)',
    },
    dialog: {
      backgroundColor: C.surface,
      borderRadius: V6Radii.card,
      paddingTop: 20,
      paddingHorizontal: 20,
      paddingBottom: 18,
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
    },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
    tabs: { flex: 1, alignItems: 'flex-start' },
    closeBtn: { padding: 2 },

    body: { flex: 1, minHeight: 0 },
    bodyContent: { paddingBottom: 6 },
    section: { marginBottom: 14 },
    sectionTitle: { color: C.dark, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter', marginBottom: 4 },
    bodyText: { color: C.slate, fontSize: 14.5, fontFamily: 'Inter', lineHeight: 20 },

    hint: { color: C.slate, fontSize: 12.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 10 },
    primaryBtn: {
      backgroundColor: C.brandTeal,
      borderRadius: V6Radii.btn,
      paddingVertical: 12,
      paddingHorizontal: 12,
      alignItems: 'center',
      marginTop: 8,
      ...V6Shadows.primaryButton,
    },
    primaryBtnOff: { backgroundColor: V6Colors.line, elevation: 0, shadowOpacity: 0 },
    primaryBtnText: { color: C.onPrimary, fontFamily: 'Inter', fontSize: 15, fontWeight: '700', textAlign: 'center' },
    primaryBtnTextOff: { color: C.slate },
  });
  return { Colors, V6Colors, C, styles };
}
