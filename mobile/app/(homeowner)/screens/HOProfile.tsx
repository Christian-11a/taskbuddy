/**
 * Profile.tsx (HO - My Profile)
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-profile screen — teal
 * gradient hero (same gradient as Home) with a squircle avatar and a back
 * button, a 2-stat row, and a .navrow-style menu list. Not a bottom-nav tab
 * (matches the mockup — reached via Home's avatar button instead).
 *
 * Deviation: dropped "Payment Methods" (there's no stored-card backend yet,
 * and it previously just pointed at Wallet, duplicating the bottom tab) and
 * "Notifications" (duplicated Home's bell icon). Added "Help & Support".
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useState } from 'react';
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
  ChevronRight,
  CircleHelp,
  LogOut,
  Pencil,
  Settings,
} from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { HOScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { monthYear, peso } from '../../../src/lib/format';
import OwnAvatar from '../../../src/components/OwnAvatar';

const MENU_ITEMS: { label: string; icon: typeof Pencil; screen: HOScreen | null }[] = [
  { label: 'Edit Profile', icon: Pencil, screen: 'Edit Profile' },
  { label: 'Settings', icon: Settings, screen: 'Settings' },
  { label: 'Help & Support', icon: CircleHelp, screen: 'Help & Support' },
];

interface ProfileProps {
  onNavigate: (screen: HOScreen) => void;
  onLogout: () => void;
  onBack: () => void;
}

export default function Profile({ onNavigate, onLogout, onBack }: ProfileProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop(4);
  const insets = useSafeAreaInsets();
  // Coming back from Settings/Edit Profile keeps the list where it was.
  const scroll = useRetainedScroll('ho.profile');
  const { profile } = useAuth();
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  // Live stats: jobs posted (own jobs) + wallet balance.
  const stats = useAsyncData(async () => {
    const [jobs, wallet] = await Promise.all([api.myJobs(), api.wallet()]);
    return { jobsPosted: jobs.length, balance: wallet.balance };
  }, [], 'ho-profile-stats');

  const name = profile?.full_name ?? '';
  const location =
    [profile?.city, profile?.address].filter(Boolean).join(', ') || null;
  const memberSince = monthYear(profile?.created_at) || null;
  const subtitle = [memberSince ? `Member since ${memberSince}` : null, location]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <ScrollView
        {...scroll}
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — matches .profile-hero (same gradient as Home) */}
        <View style={[styles.hero, { paddingTop: headerTop }, { backgroundColor: C.hero }]}>
          <Tap
            style={[styles.backBtn, { top: headerTop }]}
            onPress={onBack}
            activeOpacity={0.8}
            accessibilityLabel="Back to Home"
          >
            <ArrowLeft size={20} color={C.onPrimary} />
          </Tap>

          <View style={styles.avatarCircle}>
            <OwnAvatar name={name} textStyle={styles.avatarText} />
          </View>
          <Text style={styles.profileName}>{name || 'Your Profile'}</Text>
          {!!subtitle && <Text style={styles.profileSubtitle}>{subtitle}</Text>}
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats.data ? stats.data.jobsPosted : '—'}
            </Text>
            <Text style={styles.statLabel}>Jobs Posted</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats.data ? peso(stats.data.balance) : '—'}
            </Text>
            <Text style={styles.statLabel}>Balance</Text>
          </View>
        </View>

        <View style={styles.bodyContent}>
        {/* Account Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Info</Text>
          {[
            { label: 'Email', value: profile?.email ?? '—' },
            { label: 'Phone', value: profile?.phone ?? '—' },
            { label: 'Location', value: location ?? '—' },
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
            <Tap
              key={item.label}
              style={styles.navrow}
              onPress={() => onNavigate(item.screen!)}
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
      {/* Keeps the status bar on the header colour once the header scrolls
          away, so the light status icons never sit on the white page. */}
      <View pointerEvents="none" style={[styles.statusStrip, { height: insets.top, backgroundColor: C.hero }]} />
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
      paddingBottom: 26,
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
      backgroundColor: C.primaryTonalStrong, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)',
      alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden',
    },
    avatarText: { color: C.primaryDeep, fontWeight: '800', fontSize: 24, fontFamily: 'Inter' },
    profileName: { color: C.onPrimary, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    profileSubtitle: { color: C.onHeroMuted, fontSize: 14, fontFamily: 'Inter', marginTop: 2 },

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
