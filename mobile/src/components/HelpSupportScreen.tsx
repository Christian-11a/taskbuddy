/**
 * HelpSupportScreen.tsx
 *
 * Shared between both roles (Profile → Help & Support on both the HO and SP
 * side) since the shell — flat topbar, FAQ list, contact card — is
 * identical; only the FAQ copy differs per role. Not in the mockup (its
 * Help & Support row is a `toast('Opening help center (demo)')` no-op) —
 * built as real static content instead, since a dead menu row is worse than
 * a short FAQ.
 */

import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ArrowLeft, Mail } from 'lucide-react-native';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../constants/theme';

const C = V6Colors;

const SUPPORT_EMAIL = 'support@taskbuddy.ph';

const HO_FAQS = [
  { q: 'How do payments work?', a: 'Add money to your Wallet via Stripe Checkout. Funds are held in escrow once you hire a provider and released to them when you mark the job complete.' },
  { q: 'How do I hire a provider?', a: 'Post a job, review proposals from providers, and tap Hire on the one you choose from the job’s Applications screen.' },
  { q: 'How do I leave a review?', a: 'Once a job is marked complete, open it from My Jobs and tap Leave a Review.' },
  { q: 'How do I report a problem with a job?', a: 'Open the job from My Jobs and use Dispute Filing to describe the issue — an admin will review it.' },
];

const SP_FAQS = [
  { q: 'How do I get verified?', a: 'Go to Profile → Get Verified and submit a government ID photo plus a selfie. An admin reviews it, usually within a few days.' },
  { q: 'How do I submit a proposal?', a: 'Browse open jobs on the Feed tab and tap into one to submit a proposal. You need to be verified before proposals can be submitted.' },
  { q: 'How do I get paid?', a: 'Earnings appear in your Wallet as jobs are completed and approved by the homeowner. Withdrawals are made from the Wallet tab.' },
  { q: 'How do I update my services or bio?', a: 'Go to Profile → Edit Profile to update your bio, category, and service radius.' },
];

interface HelpSupportScreenProps {
  role: 'homeowner' | 'provider';
  onBack: () => void;
}

export default function HelpSupportScreen({ role, onBack }: HelpSupportScreenProps) {
  const faqs = role === 'provider' ? SP_FAQS : HO_FAQS;

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a colored hero) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        <View style={styles.card}>
          {faqs.map((item, i) => (
            <View key={item.q} style={[styles.faqRow, i < faqs.length - 1 && styles.rowBorder]}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Text style={styles.faqA}>{item.a}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Still need help?</Text>
        <TouchableOpacity
          style={styles.contactCard}
          activeOpacity={0.8}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        >
          <View style={styles.contactIcon}>
            <Mail size={19} color={C.cyan700} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.contactTitle}>Email support</Text>
            <Text style={styles.contactEmail}>{SUPPORT_EMAIL}</Text>
          </View>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.ink400, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, fontFamily: 'Inter' },
  card: {
    backgroundColor: C.white, borderRadius: V6Radii.card,
    borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginBottom: 20,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.ink50 },
  faqRow: { paddingHorizontal: 15, paddingVertical: 14 },
  faqQ: { color: C.ink900, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter', marginBottom: 5 },
  faqA: { color: C.ink500, fontSize: 13.5, fontFamily: 'Inter', lineHeight: 19 },

  contactCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white, borderRadius: V6Radii.card,
    borderWidth: 1, borderColor: C.line, padding: 14,
    ...V6Shadows.sm,
  },
  contactIcon: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#f5f8fa', alignItems: 'center', justifyContent: 'center',
  },
  contactTitle: { color: C.ink900, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
  contactEmail: { color: C.cyan700, fontSize: 13.5, fontFamily: 'Inter', marginTop: 2 },
});
