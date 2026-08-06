/**
 * HOSettingsScreen.tsx
 *
 * Figma Source: "HO - Settings" (id: 46:940)
 *
 * Design:
 * - Teal header "Settings"
 * - Grouped settings sections (Account, Notifications, Privacy, About)
 * - Toggle switches for notification preferences
 * - Logout button
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  FileText,
  KeyRound,
  Link2,
  Lock,
  Package,
  Pencil,
  ShieldAlert,
  ShieldQuestion,
  Star,
  UserRoundX,
} from 'lucide-react-native';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';

interface HOSettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
}

interface SettingToggle {
  key: string;
  label: string;
  desc: string;
  value: boolean;
}

export default function HOSettingsScreen({ onBack, onLogout }: HOSettingsScreenProps) {
  const [pushNotifs, setPushNotifs] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [smsNotifs, setSmsNotifs] = useState(false);
  const [locationSharing, setLocationSharing] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const sections = [
    {
      title: 'Account',
      items: [
        { label: 'Edit Profile', icon: Pencil, action: () => {} },
        { label: 'Change Password', icon: KeyRound, action: () => {} },
        { label: 'Payment Methods', icon: CreditCard, action: () => {} },
        { label: 'Linked Accounts', icon: Link2, action: () => {} },
      ],
    },
    {
      title: 'Privacy & Security',
      items: [
        { label: 'Privacy Policy', icon: Lock, action: () => {} },
        { label: 'Terms of Service', icon: FileText, action: () => {} },
        { label: 'Data & Storage', icon: Package, action: () => {} },
        { label: 'Block List', icon: UserRoundX, action: () => {} },
      ],
    },
    {
      title: 'Support',
      items: [
        { label: 'Help Center', icon: ShieldQuestion, action: () => {} },
        { label: 'Report a Problem', icon: ShieldAlert, action: () => {} },
        { label: 'Rate the App', icon: Star, action: () => {} },
      ],
    },
  ];

  const toggles: SettingToggle[] = [
    { key: 'push', label: 'Push Notifications', desc: 'Job updates, messages & alerts', value: pushNotifs },
    { key: 'email', label: 'Email Notifications', desc: 'Weekly summaries & receipts', value: emailNotifs },
    { key: 'sms', label: 'SMS Alerts', desc: 'Critical updates via SMS', value: smsNotifs },
    { key: 'location', label: 'Location Sharing', desc: 'Share your location with providers', value: locationSharing },
    { key: 'dark', label: 'Dark Mode', desc: 'Switch to dark theme', value: darkMode },
  ];

  const handleToggle = (key: string) => {
    if (key === 'push') setPushNotifs((v) => !v);
    if (key === 'email') setEmailNotifs((v) => !v);
    if (key === 'sms') setSmsNotifs((v) => !v);
    if (key === 'location') setLocationSharing((v) => !v);
    if (key === 'dark') setDarkMode((v) => !v);
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
            <ArrowLeft size={20} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 40 }} />
        </View>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Notification toggles */}
        <Text style={styles.sectionTitle}>Notifications & Privacy</Text>
        <View style={styles.card}>
          {toggles.map((toggle, i) => (
            <View key={toggle.key} style={[styles.toggleRow, i < toggles.length - 1 && styles.toggleRowBorder]}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>{toggle.label}</Text>
                <Text style={styles.toggleDesc}>{toggle.desc}</Text>
              </View>
              <Switch
                value={toggle.value}
                onValueChange={() => handleToggle(toggle.key)}
                trackColor={{ false: 'rgba(144,153,184,0.3)', true: Colors.brandTeal }}
                thumbColor={Colors.white}
                ios_backgroundColor="rgba(144,153,184,0.3)"
              />
            </View>
          ))}
        </View>

        {/* Other settings */}
        {sections.map((section) => (
          <View key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.card}>
              {section.items.map((item, i) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, i < section.items.length - 1 && styles.menuItemBorder]}
                  onPress={item.action}
                  activeOpacity={0.8}
                >
                  <item.icon size={20} color={Colors.brandDark} />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* App version */}
        <Text style={styles.version}>TaskBuddy v1.0.0 · Build 100</Text>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: {
    backgroundColor: Colors.brandDark,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12,
  },
  headerTitle: { color: Colors.white, fontSize: 20, fontWeight: '700', fontFamily: 'Inter' },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: Colors.white, fontSize: 20, fontWeight: '600' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },

  sectionTitle: { color: Colors.brandDark, fontSize: 13, fontWeight: '800', fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 16 },

  card: { backgroundColor: Colors.white, borderRadius: Radii.card, ...Shadows.card, marginBottom: 4 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  toggleRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  toggleInfo: { flex: 1 },
  toggleLabel: { color: Colors.brandDark, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 2 },
  toggleDesc: { color: Colors.slate, fontSize: 12, fontFamily: 'Inter' },

  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  menuIcon: { fontSize: 20, width: 28 },
  menuLabel: { flex: 1, color: Colors.brandDark, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
  menuArrow: { color: Colors.muted, fontSize: 20 },

  version: { color: Colors.muted, fontSize: 12, fontFamily: 'Inter', textAlign: 'center', marginTop: 20, marginBottom: 12 },

  logoutBtn: {
    borderWidth: 1, borderColor: Colors.error, borderRadius: 24, padding: 15,
    alignItems: 'center', marginTop: 8,
  },
  logoutBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoutBtnText: { color: Colors.error, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
});
