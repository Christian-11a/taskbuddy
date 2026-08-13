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
  ChevronRight,
  CircleHelp,
  LogOut,
  Pencil,
  Settings,
} from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;
import { HOScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials, monthYear, peso } from '../../../src/lib/format';

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
      {/* Hero — matches .profile-hero (same gradient as Home) */}
      <LinearGradient
        colors={['#078eaa', '#0b7288']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.hero}
      >
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.8}
          accessibilityLabel="Back to Home"
        >
          <ArrowLeft size={20} color={C.white} />
        </TouchableOpacity>

        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials(name)}</Text>
        </View>
        <Text style={styles.profileName}>{name || 'Your Profile'}</Text>
        {!!subtitle && <Text style={styles.profileSubtitle}>{subtitle}</Text>}
      </LinearGradient>

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
            <TouchableOpacity
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
    paddingBottom: 26,
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
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  avatarText: { color: C.white, fontWeight: '800', fontSize: 24, fontFamily: 'Inter' },
  profileName: { color: C.white, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
  profileSubtitle: { color: C.cyan100, fontSize: 14, fontFamily: 'Inter', marginTop: 2 },

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
