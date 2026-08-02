/**
 * SPProfileScreen.tsx
 *
 * Figma Source: "SP - My Profile" (id: 46:1030)
 *
 * Design:
 * - Large teal hero with avatar, name, skill badges, ratings
 * - Stats: Earnings, Jobs, Rating
 * - Profile sections: Skills, Portfolio, Menu
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BadgeCheck, CreditCard, Edit3, LogOut, Mail, MapPin, Phone, Bell, CalendarDays, ShieldCheck, Wallet as WalletIcon, ChevronRight } from 'lucide-react-native';
import { Colors, Radii, Shadows, Sizes, Spacing } from '../../../src/constants/theme';
import { SPScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials, monthYear, peso } from '../../../src/lib/format';

interface SPProfileScreenProps {
  onNavigate: (screen: SPScreen) => void;
  onLogout: () => void;
}

export default function SPProfileScreen({ onNavigate, onLogout }: SPProfileScreenProps) {
  const { profile, providerProfile } = useAuth();
  const wallet = useAsyncData(() => api.wallet(), []);

  const name = profile?.full_name ?? '';
  const rating = providerProfile?.cached_avg_rating;
  const jobsDone = providerProfile?.cached_completed_jobs ?? 0;
  const category = providerProfile?.service_categories?.name;
  const location =
    [profile?.city, profile?.address].filter(Boolean).join(', ') || '—';
  const ratingLabel = rating != null ? Number(rating).toFixed(1) : 'New';

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroTitle}>My Profile</Text>
          <TouchableOpacity style={styles.editBtn} onPress={() => onNavigate('Edit Profile')} activeOpacity={0.8}>
            <View style={styles.editBtnContent}>
              <Edit3 size={14} color={Colors.white} />
              <Text style={styles.editBtnText}>Edit</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}><Text style={styles.avatarText}>JD</Text></View>
            <View style={styles.verifiedBadge}><BadgeCheck size={12} color={Colors.white} /></View>
          </View>
          <View>
            <Text style={styles.providerName}>{name || 'Your Profile'}</Text>
            <Text style={styles.providerTagline}>
              ⭐ {ratingLabel} · {jobsDone} jobs · Service Provider
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {wallet.data ? peso(wallet.data.balance) : '—'}
            </Text>
            <Text style={styles.statLabel}>Balance</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{jobsDone}</Text>
            <Text style={styles.statLabel}>Jobs Done</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{ratingLabel}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        {/* Service category */}
        {!!category && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Service</Text>
            <View style={styles.skillsRow}>
              <View style={styles.skillChip}><Text style={styles.skillChipText}>{category}</Text></View>
            </View>
            {!!providerProfile?.bio && (
              <Text style={styles.bioText}>{providerProfile.bio}</Text>
            )}
          </View>
        )}

        {/* Info */}
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
          {[
            { label: 'Edit Profile', icon: Edit3, screen: 'Edit Profile' as SPScreen },
            { label: 'Get Verified', icon: ShieldCheck, screen: 'Verification' as SPScreen },
            { label: 'Wallet', icon: WalletIcon, screen: 'Wallet' as SPScreen },
            { label: 'Notifications', icon: Bell, screen: 'Notifications' as SPScreen },
            { label: 'Calendar', icon: CalendarDays, screen: 'Calendar' as SPScreen },
          ].map((item, i, arr) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity key={item.label} style={[styles.menuItem, i < arr.length - 1 && styles.menuItemBorder]} onPress={() => onNavigate(item.screen)} activeOpacity={0.8}>
                <View style={styles.menuIconBox}>
                  <Icon size={18} color={Colors.brandTeal} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <ChevronRight size={18} color={Colors.muted} />
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout} activeOpacity={0.85}>
          <View style={styles.logoutContent}>
            <LogOut size={16} color={Colors.error} />
            <Text style={styles.logoutText}>Log Out</Text>
          </View>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  hero: {
    backgroundColor: Colors.brandDark, paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH, paddingBottom: 24,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginBottom: 16 },
  heroTitle: { color: Colors.white, fontSize: 20, fontWeight: '700', fontFamily: 'Inter' },
  editBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  editBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBtnText: { color: Colors.white, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  avatarSection: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  avatarWrap: { position: 'relative' },
  avatarCircle: { width: 64, height: 64, borderRadius: 20, backgroundColor: Colors.brandCyan, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText: { color: Colors.white, fontSize: 22, fontWeight: '800', fontFamily: 'Inter' },
  verifiedBadge: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.white },
  verifiedText: { color: Colors.white, fontSize: 10, fontWeight: '900' },
  providerName: { color: Colors.white, fontSize: 22, fontWeight: '800', fontFamily: 'Inter', marginBottom: 4 },
  providerTagline: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'Inter' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 12, alignItems: 'center' },
  statValue: { color: Colors.white, fontSize: 16, fontWeight: '800', fontFamily: 'Inter', marginBottom: 2 },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Inter' },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },
  card: { backgroundColor: Colors.white, borderRadius: Radii.card, padding: 20, marginBottom: 16, ...Shadows.card },
  cardTitle: { color: Colors.brandDark, fontSize: 15, fontWeight: '800', fontFamily: 'Inter', marginBottom: 14 },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { backgroundColor: Colors.backgroundAlt, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  skillChipText: { color: Colors.brandTeal, fontSize: 13, fontWeight: '600', fontFamily: 'Inter' },
  bioText: { color: Colors.slate, fontSize: 13, fontFamily: 'Inter', lineHeight: 20, marginTop: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  infoLabel: { color: Colors.slate, fontSize: 13, fontFamily: 'Inter' },
  infoValue: { color: Colors.brandDark, fontSize: 13, fontWeight: '600', fontFamily: 'Inter', maxWidth: '55%', textAlign: 'right' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(144,153,184,0.15)' },
  menuIcon: { fontSize: 20, width: 28 },
  menuIconBox: { width: 34, height: 34, borderRadius: 12, backgroundColor: Colors.backgroundAlt, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, color: Colors.brandDark, fontSize: 14, fontWeight: '600', fontFamily: 'Inter' },
  menuArrow: { color: Colors.muted, fontSize: 20 },
  logoutBtn: { borderWidth: 1, borderColor: Colors.error, borderRadius: 24, padding: 15, alignItems: 'center' },
  logoutContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoutText: { color: Colors.error, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
});
