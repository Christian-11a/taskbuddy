/**
 * SPProfileScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-profile screen — a dark
 * navy `.profile-hero.dark` gradient (same gradient as SPHomeScreen's hero,
 * not the teal gradient homeowner profile uses) with a squircle avatar and a
 * back button, a 2-stat row (Jobs Done, Rating), and a .navrow-style menu
 * list. Not a bottom-nav tab (matches the mockup — reached via Feed's
 * avatar button instead).
 *
 * Deviations:
 * - Dropped the mockup's "On-time" stat — no on-time tracking exists in the
 *   backend, so it only ever showed "—".
 * - Menu trimmed to rows that aren't already reachable elsewhere: Wallet
 *   and Calendar duplicate bottom-nav tabs, and Notifications duplicated
 *   Feed's bell icon — all three removed. Settings and Help & Support added
 *   (real destinations, not in the mockup's SP menu but present on the HO
 *   side and genuinely missing here).
 * - "Switch to Homeowner" (role-swap) isn't implemented — this app doesn't
 *   support a single account holding both roles.
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  LogOut,
  Pencil,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;
import { SPScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import OwnAvatar from '../../../src/components/OwnAvatar';

const MENU_ITEMS: { label: string; icon: typeof Pencil; screen: SPScreen }[] = [
  { label: 'Edit Profile', icon: Pencil, screen: 'Edit Profile' },
  { label: 'Get Verified', icon: ShieldCheck, screen: 'Verification' },
  { label: 'Settings', icon: SettingsIcon, screen: 'Settings' },
  { label: 'Help & Support', icon: CircleHelp, screen: 'Help & Support' },
];

interface SPProfileScreenProps {
  onNavigate: (screen: SPScreen) => void;
  onLogout: () => void;
  onBack: () => void;
}

export default function SPProfileScreen({ onNavigate, onLogout, onBack }: SPProfileScreenProps) {
  const { profile, providerProfile } = useAuth();
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  const name = profile?.full_name ?? '';
  const jobsDone = providerProfile?.cached_completed_jobs ?? 0;
  const rating = providerProfile?.cached_avg_rating;
  const ratingLabel = rating != null ? Number(rating).toFixed(1) : '—';
  const category = providerProfile?.service_categories?.name;
  const isVerified = !!providerProfile?.is_verified;

  return (
    <View style={styles.screen}>
      {/* Hero — matches .profile-hero.dark (same gradient as Feed's hero) */}
      <LinearGradient
        colors={['#111827', '#17283c', '#0c4a6e']}
        locations={[0, 0.75, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.hero}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
          accessibilityLabel="Back to Feed"
        >
          <ArrowLeft size={20} color={C.white} />
        </TouchableOpacity>

        <View style={styles.avatarCircle}>
          <OwnAvatar name={name} textStyle={styles.avatarText} />
        </View>
        <Text style={styles.profileName}>{name || 'Your Profile'}</Text>
        <Text style={styles.profileSubtitle}>{category ? `${category} · Provider profile` : 'Provider profile'}</Text>

        <View style={[styles.verifyPill, isVerified ? styles.verifyPillOn : styles.verifyPillOff]}>
          {isVerified ? (
            <BadgeCheck size={13} color="#4ade80" />
          ) : (
            <ShieldAlert size={13} color="#fbbf24" />
          )}
          <Text style={[styles.verifyPillText, isVerified ? styles.verifyPillTextOn : styles.verifyPillTextOff]}>
            {isVerified ? 'Verified' : 'Not verified'}
          </Text>
        </View>
      </LinearGradient>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{jobsDone}</Text>
          <Text style={styles.statLabel}>Jobs Done</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{ratingLabel}</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Account Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Info</Text>
          {[
            { label: 'Email', value: profile?.email ?? '—' },
            { label: 'Phone', value: profile?.phone ?? '—' },
            { label: 'Location', value: [profile?.city, profile?.address].filter(Boolean).join(', ') || '—' },
          ].map((item) => (
            <View key={item.label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Menu — matches .navrow */}
        <View style={styles.card}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.navrow}
              onPress={() => onNavigate(item.screen)}
              activeOpacity={0.7}
            >
              <View style={styles.rowIcon}>
                <item.icon size={19} color={C.ink700} />
              </View>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <ChevronRight size={20} color={C.ink300} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.navrow}
            onPress={() => setConfirmLogoutVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.rowIcon}>
              <LogOut size={19} color="#ef4444" />
            </View>
            <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Log Out</Text>
            <ChevronRight size={20} color={C.ink300} />
          </TouchableOpacity>
        </View>

        <ConfirmationModal
          visible={confirmLogoutVisible}
          title="Confirm Log Out"
          message="Are you sure you want to log out?"
          confirmLabel="Log Out"
          cancelLabel="Cancel"
          onConfirm={() => {
            setConfirmLogoutVisible(false);
            onLogout();
          }}
          onCancel={() => setConfirmLogoutVisible(false)}
        />

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  hero: {
    paddingTop: Sizes.statusBarHeight + 4,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 22,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    alignItems: 'center',
    position: 'relative',
  },
  backBtn: {
    position: 'absolute', top: Sizes.statusBarHeight + 4, left: Spacing.screenH,
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },

  avatarCircle: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden',
  },
  avatarText: { color: C.white, fontWeight: '800', fontSize: 24, fontFamily: 'Inter' },
  profileName: { color: C.white, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
  profileSubtitle: { color: C.cyan100, fontSize: 14, fontFamily: 'Inter', marginTop: 2 },

  verifyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5,
    marginTop: 10, borderWidth: 1,
  },
  verifyPillOn: { backgroundColor: 'rgba(74,222,128,0.14)', borderColor: 'rgba(74,222,128,0.35)' },
  verifyPillOff: { backgroundColor: 'rgba(251,191,36,0.14)', borderColor: 'rgba(251,191,36,0.35)' },
  verifyPillText: { fontSize: 11.5, fontWeight: '700', fontFamily: 'Inter' },
  verifyPillTextOn: { color: '#4ade80' },
  verifyPillTextOff: { color: '#fbbf24' },

  statsRow: {
    flexDirection: 'row', backgroundColor: C.white, paddingVertical: 15, paddingHorizontal: Spacing.screenH,
    borderBottomWidth: 1, borderBottomColor: '#e7ecf1',
  },
  statCard: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  statDivider: { width: 1, backgroundColor: '#e7ecf1' },
  statValue: { color: C.ink900, fontSize: 17.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 2 },
  statLabel: { color: C.ink400, fontSize: 11.5, fontFamily: 'Inter', textAlign: 'center' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 18, paddingBottom: 20 },

  card: {
    backgroundColor: C.white, borderRadius: V6Radii.card,
    padding: 8, marginBottom: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: C.line,
    ...V6Shadows.sm,
  },
  cardTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', margin: 12, marginBottom: 4 },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 12,
  },
  infoLabel: { color: C.ink500, fontSize: 14.5, fontFamily: 'Inter' },
  infoValue: { color: C.ink900, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter', maxWidth: '60%', textAlign: 'right' },

  // .navrow
  navrow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12 },
  rowIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#f5f8fa', alignItems: 'center', justifyContent: 'center',
  },
  rowLabel: { flex: 1, color: C.ink900, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
  rowLabelDanger: { color: '#ef4444' },
});
