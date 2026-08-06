/**
 * Profile.tsx (HO - My Profile)
 *
 * Figma Source: "HO - My Profile" (id: 46:904)
 *
 * Design:
 * - Large teal hero header with avatar, name, role badge, settings button
 * - Stats row: Jobs Posted, Balance, Avg Rating
 * - Account info card
 * - Navigation options list (Edit Profile, Payment, Notifications, Settings, Logout)
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CreditCard,
  LogOut,
  Bell,
  ChevronRight,
  Pencil,
  Settings,
  Wallet as WalletIcon,
} from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';
import { HOScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials, monthYear, peso } from '../../../src/lib/format';

const MENU_ITEMS: { label: string; icon: typeof Pencil; subtitle: string; screen: HOScreen | null }[] = [
  { label: 'Edit Profile', icon: Pencil, subtitle: 'Update your personal info', screen: 'Edit Profile' },
  { label: 'Payment Methods', icon: CreditCard, subtitle: 'Manage cards & billing', screen: 'Wallet' },
  { label: 'Notifications', icon: Bell, subtitle: 'Alerts & preferences', screen: 'Notifications' },
  { label: 'App Settings', icon: Settings, subtitle: 'Preferences & display', screen: 'Settings' },
];

interface ProfileProps {
  onNavigate: (screen: HOScreen) => void;
  onLogout: () => void;
}

export default function Profile({ onNavigate, onLogout }: ProfileProps) {
  const { profile } = useAuth();
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  // Live stats: jobs posted (own jobs) + wallet balance.
  const stats = useAsyncData(async () => {
    const [jobs, wallet] = await Promise.all([api.myJobs(), api.wallet()]);
    return { jobsPosted: jobs.length, balance: wallet.balance };
  }, []);

  const name = profile?.full_name ?? '';
  const location =
    [profile?.city, profile?.address].filter(Boolean).join(', ') || '—';

  return (
    <View style={styles.screen}>
      {/* Hero Header */}
      <View style={styles.hero}>
        {/* Top row */}
        <View style={styles.heroTopRow}>
          <Text style={styles.heroTitle}>My Profile</Text>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => onNavigate('Settings')}
            activeOpacity={0.8}
          >
            <Settings size={18} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initials(name)}</Text>
          </View>
          <View style={styles.avatarInfo}>
            <Text style={styles.profileName}>{name || 'Your Profile'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>Homeowner</Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats.data ? stats.data.jobsPosted : '—'}
            </Text>
            <Text style={styles.statLabel}>Jobs Posted</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats.data ? peso(stats.data.balance) : '—'}
            </Text>
            <Text style={styles.statLabel}>Balance</Text>
          </View>
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
            { label: 'Location', value: location },
            { label: 'Member Since', value: monthYear(profile?.created_at) || '—' },
          ].map((item) => (
            <View key={item.label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* Menu */}
        <View style={styles.card}>
          {MENU_ITEMS.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, i < MENU_ITEMS.length - 1 && styles.menuItemBorder]}
              onPress={() => onNavigate(item.screen!)}
              activeOpacity={0.8}
            >
              <View style={styles.menuIcon}>
                <item.icon size={20} color={Colors.brandDark} />
              </View>
              <View style={styles.menuTextGroup}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              <ChevronRight size={20} color={Colors.muted} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => setConfirmLogoutVisible(true)}
          activeOpacity={0.85}
        >
          <View style={styles.logoutBtnContent}>
            <LogOut size={16} color={Colors.error} />
            <Text style={styles.logoutBtnText}>Log Out</Text>
          </View>
        </TouchableOpacity>

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
  screen: { flex: 1, backgroundColor: Colors.background },

  hero: {
    backgroundColor: Colors.brandDark,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 12, marginBottom: 20,
  },
  heroTitle: { color: Colors.white, fontSize: 22, fontWeight: '800', fontFamily: 'Inter' },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  settingsBtnIcon: { fontSize: 18 },

  avatarSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 16 },
  avatarCircle: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarText: { color: Colors.white, fontWeight: '800', fontSize: 22, fontFamily: 'Inter' },
  avatarInfo: { flex: 1 },
  profileName: { color: Colors.white, fontSize: 22, fontWeight: '800', fontFamily: 'Inter', marginBottom: 6 },
  roleBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
  },
  roleBadgeText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600', fontFamily: 'Inter' },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16, padding: 14, alignItems: 'center',
  },
  statValue: { color: Colors.white, fontSize: 18, fontWeight: '800', fontFamily: 'Inter', marginBottom: 4 },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Inter', textAlign: 'center' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },

  card: {
    backgroundColor: Colors.white, borderRadius: Radii.card,
    padding: 20, marginBottom: 16, ...Shadows.card,
  },
  cardTitle: { color: Colors.brandDark, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 16 },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)',
  },
  infoLabel: { color: Colors.slate, fontSize: 13, fontFamily: 'Inter' },
  infoValue: { color: Colors.brandDark, fontSize: 13, fontWeight: '600', fontFamily: 'Inter', maxWidth: '55%', textAlign: 'right' },

  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  menuIcon: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: Colors.backgroundAlt, alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  menuIconText: { fontSize: 20 },
  menuTextGroup: { flex: 1 },
  menuLabel: { color: Colors.brandDark, fontSize: 15, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
  menuLabelLogout: { color: Colors.error },
  menuSubtitle: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },
  menuArrow: { color: Colors.muted, fontSize: 20 },
  logoutBtn: {
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoutBtnText: { color: Colors.error, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
});
