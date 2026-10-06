/**
 * SPProfileScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #sp-profile screen — a dark
 * navy `.profile-hero.dark` gradient (same gradient as SPHomeScreen's hero,
 * not the teal gradient homeowner profile uses) with a squircle avatar and a
 * back button, a 3-stat row (Jobs Done, Rating, Active — the one place
 * these show; the Feed used to repeat them), and a .navrow-style menu
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

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import { approvedServiceNames } from '../../../src/lib/providerServices';
import { useRetainedScroll } from '../../../src/hooks/useRetainedState';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  Landmark,
  LogOut,
  Pencil,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  Images,
  Wrench,
} from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';

import { SPScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import OwnAvatar from '../../../src/components/OwnAvatar';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';

const MENU_ITEMS: { label: string; icon: typeof Pencil; screen: SPScreen }[] = [
  { label: 'Edit Profile', icon: Pencil, screen: 'Edit Profile' },
  { label: 'Get Verified', icon: ShieldCheck, screen: 'Verification' },
  { label: 'My Portfolio', icon: Images, screen: 'Portfolio' },
  { label: 'My Services', icon: Wrench, screen: 'My Services' },
  { label: 'Payouts', icon: Landmark, screen: 'Payouts' },
  { label: 'Settings', icon: SettingsIcon, screen: 'Settings' },
  { label: 'Help & Support', icon: CircleHelp, screen: 'Help & Support' },
];

interface SPProfileScreenProps {
  onNavigate: (screen: SPScreen) => void;
  onLogout: () => void;
  onBack: () => void;
}

export default function SPProfileScreen({ onNavigate, onLogout, onBack }: SPProfileScreenProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop(4);
  const insets = useSafeAreaInsets();
  // Coming back from Settings/Edit Profile keeps the list where it was.
  const scroll = useRetainedScroll('sp.profile');
  const { profile, providerProfile, refreshProfile } = useAuth();
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  const name = profile?.full_name ?? '';
  const jobsDone = providerProfile?.cached_completed_jobs ?? 0;
  const rating = providerProfile?.cached_avg_rating;
  const ratingLabel = rating != null ? Number(rating).toFixed(1) : '—';
  const category = providerProfile ? approvedServiceNames(providerProfile).join(' · ') : '';
  const isVerified = !!providerProfile?.is_verified;
  // Same as the Feed's banner: an approval lands server-side (admin or Stripe
  // webhook) while this screen may already be showing "Not verified".
  useRefreshOnForeground(() => void refreshProfile(), !isVerified);
  useEffect(() => {
    if (!isVerified) void refreshProfile();
    // Mount only — refreshProfile is stable, and re-running on the isVerified
    // flip would refetch right after the fetch that caused it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Hired, confirmed or under way — same definition My Work's Active tab uses.
  const active = useAsyncData(async () => {
    const jobs = await api.assignedJobs();
    return jobs.filter((j) => ['assigned', 'confirmed', 'in_progress'].includes(j.status)).length;
  }, [], 'sp-profile-active');

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <ScrollView
        {...scroll}
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — matches .profile-hero.dark (same gradient as Feed's hero) */}
        <View style={[styles.hero, { paddingTop: headerTop }, { backgroundColor: C.providerHero }]}>
          <Tap
            style={[styles.backBtn, { top: headerTop }]}
            onPress={onBack}
            activeOpacity={0.8}
            accessibilityLabel="Back to Feed"
          >
            <ArrowLeft size={20} color={C.onPrimary} />
          </Tap>

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
        </View>

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
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{active.data ?? '—'}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
        </View>

        <View style={styles.bodyContent}>
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
          {MENU_ITEMS.filter((item) => !(isVerified && item.screen === 'Verification')).map((item) => (
            <Tap
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
            </Tap>
          ))}
        </View>

        {/* Log Out sits on its own, without a chevron, so it isn't tapped by
            accident while moving down the menu. */}
        <View style={styles.card}>
          <Tap
            style={styles.navrow}
            onPress={() => setConfirmLogoutVisible(true)}
            activeOpacity={0.7}
          >
            <View style={[styles.rowIcon, styles.rowIconDanger]}>
              <LogOut size={19} color={V6Colors.dangerText} />
            </View>
            <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Log Out</Text>
          </Tap>
        </View>
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
      {/* Keeps the status bar on navy once the header scrolls away, so the
          light status icons never sit on the white page. */}
      <View pointerEvents="none" style={[styles.statusStrip, { height: insets.top, backgroundColor: C.providerHero }]} />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },
    statusStrip: { position: 'absolute', top: 0, left: 0, right: 0 },

    hero: {
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 22,
      borderBottomLeftRadius: 26,
      borderBottomRightRadius: 26,
      alignItems: 'center',
      position: 'relative',
    },
    backBtn: {
      position: 'absolute', left: Spacing.screenH,
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
      alignItems: 'center', justifyContent: 'center',
    },

    avatarCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: '#2b4a66', borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)',
      alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden',
    },
    avatarText: { color: '#bae6fd', fontWeight: '800', fontSize: 24, fontFamily: 'Inter' },
    profileName: { color: C.onPrimary, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    profileSubtitle: { color: C.onHeroMuted, fontSize: 14, fontFamily: 'Inter', marginTop: 2 },

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
      flexDirection: 'row', backgroundColor: C.surface, paddingVertical: 15, paddingHorizontal: Spacing.screenH,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    statCard: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
    statDivider: { width: 1, backgroundColor: V6Colors.line },
    statValue: { color: C.ink900, fontSize: 17.5, fontWeight: '800', fontFamily: 'Inter', marginBottom: 2 },
    statLabel: { color: C.ink400, fontSize: 11.5, fontFamily: 'Inter', textAlign: 'center' },

    body: { flex: 1 },
    scrollContent: { paddingBottom: 20 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 18 },

    card: {
      backgroundColor: C.surface, borderRadius: V6Radii.card,
      padding: 8, marginBottom: 16, overflow: 'hidden',
      borderWidth: 1, borderColor: C.line,
      ...V6Shadows.sm,
    },
    cardTitle: { color: C.ink900, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', margin: 12, marginBottom: 4 },

    infoRow: { paddingVertical: 9, paddingHorizontal: 12, gap: 2 },
    infoLabel: { color: C.ink500, fontSize: 13, fontFamily: 'Inter' },
    infoValue: { color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },

    // .navrow
    navrow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12 },
    rowIcon: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: V6Colors.wellBg, alignItems: 'center', justifyContent: 'center',
    },
    rowLabel: { flex: 1, color: C.ink900, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
    rowLabelDanger: { color: V6Colors.dangerText },
    rowIconDanger: { backgroundColor: V6Colors.dangerSurface },
  });
  return { Colors, V6Colors, C, styles };
}
