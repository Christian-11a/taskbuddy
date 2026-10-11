/**
 * HelpSupportScreen.tsx
 *
 * Shared between both roles (Profile → Help & Support on both the HO and SP
 * side) since the shell — search, tour, questions, contact — is identical; only
 * the questions differ per role.
 *
 * Search filters the questions as you type. One question is open at a time.
 * The replay card runs the welcome walkthrough (intro cards, then the spotlight
 * tour) when the caller passes onReplayTour. Contact support opens a mail to the
 * support address.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import KeyboardAwareScrollView, { useRevealOnFocus } from './ui/KeyboardAwareScrollView';
import Tap from './ui/Tap';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Mail,
  PlayCircle,
  Search,
} from 'lucide-react-native';
import { Sizes, Spacing, V6Radii } from '../constants/theme';
import { filterHelpEntries } from '../lib/helpSearch';
import { SEARCH_MAX_LENGTH } from '../lib/textRules';

const SUPPORT_EMAIL = 'support@taskbuddy.ph';

/**
 * Required attribution. Addresses are geocoded through Geoapify (on the
 * backend), whose free plan requires a visible link to Geoapify, and whose data
 * is OpenStreetMap's (ODbL), which requires crediting its contributors.
 * See backend/BACKEND_SCHEMA.md §31.
 */
const ATTRIBUTIONS = [
  { label: 'Powered by Geoapify', url: 'https://www.geoapify.com/' },
  { label: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
];

const HO_FAQS = [
  { q: 'How do payments work?', a: 'Add money to your Wallet via Stripe Checkout. Funds are held in escrow once you hire a provider and released after the three-day completion warranty ends, unless a complaint is open.' },
  { q: 'How do I hire a provider?', a: 'Post a job, review proposals from providers, and tap Hire on the one you choose from the job’s Applications screen.' },
  { q: 'How do I leave a review?', a: 'Once a job is marked complete, open it from My Jobs and tap Leave Review.' },
  { q: 'How do I report a problem with a job?', a: 'Open the job and tap Report a problem. On a booked or in-progress job it is under the ⋮ menu, or it becomes a link once the provider has finished every task. A completed job can be reported during its three-day warranty. An admin will review it.' },
];

const SP_FAQS = [
  { q: 'How do I get verified?', a: 'Go to Profile → Get Verified and submit a government ID photo plus a selfie. An admin reviews it, usually within a few days.' },
  { q: 'How do I submit a proposal?', a: 'Browse open jobs on the Feed tab and tap into one to submit a proposal. You need to be verified before proposals can be submitted.' },
  { q: 'How do I get paid?', a: 'Earnings appear in your Wallet after the three-day completion warranty ends, unless a complaint is open. Withdrawals are made from the Wallet tab.' },
  { q: 'How do I change the services I offer?', a: 'Go to Profile → My services and send the admins a request to change or add a service. Only one request can be open at a time.' },
  { q: 'How do I update my bio or service radius?', a: 'Go to Profile → Edit profile to update your bio and service radius.' },
];

interface HelpSupportScreenProps {
  role: 'homeowner' | 'provider';
  onBack: () => void;
  /** Replays the welcome walkthrough. The row is hidden when this is not passed. */
  onReplayTour?: () => void;
}

export default function HelpSupportScreen({ role, onBack, onReplayTour }: HelpSupportScreenProps) {
  const { C, styles, V6Colors, Colors } = useThemedStyles(createThemedStyles);
  const faqs = role === 'provider' ? SP_FAQS : HO_FAQS;
  const [search, setSearch] = useState('');
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const matches = filterHelpEntries(faqs, search);
  const query = search.trim();

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a colored hero) */}
      <View style={styles.header}>
        <Tap style={styles.backBtn} onPress={onBack} activeOpacity={0.8} hitSlop={BACK_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Help & Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAwareScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <HelpSearchBox value={search} onChangeText={setSearch} />

        {onReplayTour && (
          <Tap
            style={styles.tourCard}
            activeOpacity={0.85}
            scale
            onPress={onReplayTour}
            accessibilityRole="button"
            accessibilityLabel="Replay the welcome tour. A short welcome, then a quick look around the app"
          >
            <PlayCircle size={24} color={Colors.onPrimary} />
            <View style={styles.tourText}>
              <Text style={styles.tourTitle}>Replay the welcome tour</Text>
              <Text style={styles.tourBody}>A short welcome, then a quick look around the app</Text>
            </View>
            <ChevronRight size={20} color={Colors.onPrimary} />
          </Tap>
        )}

        <Text style={styles.sectionTitle} accessibilityRole="header">Common questions</Text>
        {matches.length === 0 ? (
          <Text style={styles.noMatch}>{`No questions match “${query}”.`}</Text>
        ) : (
          <View style={styles.card}>
            {matches.map((item, i) => {
              const open = openQuestion === item.q;
              return (
                <View key={item.q} style={i < matches.length - 1 && styles.rowBorder}>
                  <Tap
                    style={styles.questionRow}
                    activeOpacity={0.7}
                    onPress={() => setOpenQuestion(open ? null : item.q)}
                    accessibilityRole="button"
                    accessibilityLabel={item.q}
                    accessibilityState={{ expanded: open }}
                  >
                    <Text style={styles.questionText}>{item.q}</Text>
                    {open ? <ChevronUp size={20} color={V6Colors.ink500} /> : <ChevronDown size={20} color={V6Colors.ink500} />}
                  </Tap>
                  {open && <Text style={styles.answer}>{item.a}</Text>}
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.sectionTitle} accessibilityRole="header">Still need help?</Text>
        <Tap
          style={styles.contactRow}
          activeOpacity={0.8}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          accessibilityRole="button"
          accessibilityLabel="Contact support"
        >
          <View style={styles.contactIcon}>
            <Mail size={19} color={Colors.link} />
          </View>
          <View style={styles.contactText}>
            <Text style={styles.contactTitle}>Contact support</Text>
            <Text style={styles.contactEmail}>{SUPPORT_EMAIL}</Text>
          </View>
          <ChevronRight size={20} color={V6Colors.ink500} />
        </Tap>

        <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Address data</Text>
        <View style={styles.card}>
          <Text style={styles.attributionIntro}>
            Addresses are located using these services.
          </Text>
          {ATTRIBUTIONS.map((item) => (
            <Tap
              key={item.url}
              style={styles.attributionRow}
              activeOpacity={0.8}
              accessibilityRole="link"
              onPress={() => Linking.openURL(item.url)}
            >
              <Text style={styles.attributionLink}>{item.label}</Text>
              <ExternalLink size={15} color={Colors.link} />
            </Tap>
          ))}
        </View>

        <View style={{ height: 20 }} />
      </KeyboardAwareScrollView>
    </View>
  );
}

// The header back button is 38 dp; the extra 5 dp on each side reaches 48.
const BACK_HIT_SLOP = { top: 5, bottom: 5, left: 5, right: 5 } as const;

/**
 * The search box. It renders inside the KeyboardAwareScrollView, and the reveal hook
 * reads that view from context, so the hook is called here, not in the screen.
 */
function HelpSearchBox({ value, onChangeText }: { value: string; onChangeText: (text: string) => void }) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const inputRef = useRef<TextInput>(null);
  const revealField = useRevealOnFocus(inputRef);
  return (
    <View style={styles.searchBox}>
      <Search size={18} color={V6Colors.ink500} />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        onFocus={revealField}
        placeholder="Search help"
        placeholderTextColor={V6Colors.ink500}
        accessibilityLabel="Search help"
        maxLength={SEARCH_MAX_LENGTH}
        autoCorrect={false}
        returnKeyType="search"
        style={styles.searchInput}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface,
      paddingTop: Sizes.statusBarHeight,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    headerSpacer: { width: 38 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 16, paddingBottom: 20 },

    searchBox: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: V6Colors.line,
      paddingHorizontal: 14, minHeight: 48, marginBottom: 16,
    },
    searchInput: { flex: 1, fontFamily: 'Inter', fontSize: 15, color: C.ink900, paddingVertical: 12 },

    tourCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: Colors.primary, borderRadius: V6Radii.card, padding: 16, marginBottom: 20,
    },
    tourText: { flex: 1 },
    tourTitle: { color: Colors.onPrimary, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    tourBody: { color: Colors.onPrimary, fontSize: 13, fontFamily: 'Inter', marginTop: 2, opacity: 0.85 },

    sectionTitle: {
      color: V6Colors.ink500, fontSize: 13, fontWeight: '700', fontFamily: 'Inter',
      letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
    },
    sectionSpacing: { marginTop: 12 },
    card: {
      backgroundColor: C.surface, borderRadius: V6Radii.card,
      borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginBottom: 16,
    },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: V6Colors.line },
    questionRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      paddingHorizontal: 16, paddingVertical: 14, minHeight: 48,
    },
    questionText: { flex: 1, color: C.ink900, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    answer: {
      color: V6Colors.ink700, fontSize: 13.5, fontFamily: 'Inter', lineHeight: 19,
      paddingHorizontal: 16, paddingBottom: 14,
    },
    noMatch: { color: V6Colors.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 20, marginBottom: 16 },

    contactRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface, borderRadius: V6Radii.card,
      borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 16,
    },
    contactIcon: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: V6Colors.wellBg, alignItems: 'center', justifyContent: 'center',
    },
    contactText: { flex: 1 },
    contactTitle: { color: C.ink900, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    contactEmail: { color: Colors.link, fontSize: 13.5, fontFamily: 'Inter', marginTop: 2 },

    attributionIntro: { color: V6Colors.ink500, fontSize: 13.5, fontFamily: 'Inter', paddingHorizontal: 15, paddingTop: 14, paddingBottom: 4 },
    attributionRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 15, paddingVertical: 12,
    },
    attributionLink: { color: Colors.link, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, C, styles };
}
