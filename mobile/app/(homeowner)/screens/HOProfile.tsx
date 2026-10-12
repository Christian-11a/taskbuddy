/**
 * HOProfile.tsx (HO - My Profile)
 *
 * Figma "Profile · new" (74:1545): the Profile bottom tab on the canvas. A
 * centred avatar with a camera badge (it opens Edit Profile, where the photo is
 * changed), the name, an Edit profile button, a stats card, the Account card,
 * the Settings and Help rows, and Log Out on its own card.
 *
 * It is the Profile tab, which has no back button; the back button appears only
 * when onBack is passed.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState, type ReactNode } from 'react';
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
  Camera,
  ChevronRight,
  CircleHelp,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { HOScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials } from '../../../src/lib/format';
import OwnAvatar from '../../../src/components/OwnAvatar';

/** The statuses Home counts as "Active jobs"; "Active now" counts the same jobs. */
const ACTIVE_STATUSES: readonly string[] = ['open', 'recommending', 'assigned', 'confirmed', 'in_progress'];

interface ProfileProps {
  onNavigate: (screen: HOScreen) => void;
  onLogout: () => void;
  /** Omit on the Profile tab, which has no back arrow. */
  onBack?: () => void;
}

/** "Sep 2026" */
function shortMonthYear(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function Profile({ onNavigate, onLogout, onBack }: ProfileProps) {
  const { Colors, V6Colors, styles } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop(4);
  // Coming back from Settings/Edit Profile keeps the list where it was.
  const scroll = useRetainedScroll('ho.profile');
  const { profile } = useAuth();
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  // Jobs posted: every job the homeowner has. Active now: the jobs Home counts as active.
  const stats = useAsyncData(async () => {
    const jobs = await api.myJobs();
    return {
      jobsPosted: jobs.length,
      activeNow: jobs.filter((job) => ACTIVE_STATUSES.includes(job.status)).length,
    };
  }, [], 'ho-profile-stats');

  const name = profile?.full_name ?? '';
  // A geocoded address usually already contains the city; don't repeat it.
  const location =
    (profile?.address && profile?.city && profile.address.includes(profile.city)
      ? profile.address
      : [profile?.city, profile?.address].filter(Boolean).join(', ')) || null;
  const memberSince = shortMonthYear(profile?.created_at);
  const subtitle = ['Client', memberSince ? `Member since ${memberSince}` : null]
    .filter(Boolean)
    .join(' · ');
  const phone = profile?.phone?.trim() || '';

  return (
    <View style={styles.screen}>
      <ScrollView
        {...scroll}
        style={styles.body}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.top, { paddingTop: headerTop }]}>
          {onBack && (
            <Tap
              style={[styles.backBtn, { top: headerTop }]}
              onPress={onBack}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Back to Home"
            >
              <ArrowLeft size={20} color={V6Colors.ink900} />
            </Tap>
          )}

          {/* The camera badge opens Edit Profile, where the photo is changed. */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {profile?.avatar_url || !name ? (
                <OwnAvatar name={name} textStyle={styles.avatarText} />
              ) : (
                <Text style={styles.avatarText}>{initials(name)}</Text>
              )}
            </View>
            <Tap
              testID="profile-camera-badge"
              style={styles.cameraBadge}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Change photo"
              accessibilityHint="Opens Edit Profile"
              onPress={() => onNavigate('Edit Profile')}
            >
              <Camera size={14} color={Colors.onPrimary} strokeWidth={2.4} />
            </Tap>
          </View>

          <Text style={styles.name}>{name || 'Your Profile'}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
          <Tap
            style={styles.editButton}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            onPress={() => onNavigate('Edit Profile')}
          >
            <Text style={styles.editText}>Edit profile</Text>
          </Tap>
        </View>

        <View style={styles.statsCard}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{stats.data ? stats.data.jobsPosted : '—'}</Text>
            <Text style={styles.statLabel}>Jobs posted</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{stats.data ? stats.data.activeNow : '—'}</Text>
            <Text style={styles.statLabel}>Active now</Text>
          </View>
        </View>

        <View>
          <Text style={styles.sectionLabel} accessibilityRole="header">Account</Text>
          <View style={styles.card}>
            <InfoRow icon={Mail} label="Email">
              <Text style={styles.infoValue}>{profile?.email ?? '—'}</Text>
            </InfoRow>
            <View style={styles.divider} />
            <InfoRow icon={Phone} label="Phone">
              {phone ? (
                <Text style={styles.infoValue} numberOfLines={1}>{phone}</Text>
              ) : (
                <Tap
                  style={styles.linkTap}
                  hitSlop={{ top: 12, bottom: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel="Add phone number"
                  onPress={() => onNavigate('Edit Profile')}
                >
                  <Text style={styles.linkText}>Add phone number</Text>
                </Tap>
              )}
            </InfoRow>
            <View style={styles.divider} />
            <InfoRow icon={MapPin} label="Location">
              <Text style={styles.infoValue}>{location ?? '—'}</Text>
            </InfoRow>
          </View>
        </View>

        <View style={styles.card}>
          <MenuRow icon={Settings} label="Settings" onPress={() => onNavigate('Settings')} />
          <View style={styles.divider} />
          <MenuRow icon={CircleHelp} label="Help & support" onPress={() => onNavigate('Help & Support')} />
        </View>

        {/* Log Out sits on its own, without a chevron, so it isn't tapped by
            accident while moving down the menu. */}
        <View style={styles.card}>
          <Tap
            style={styles.menuRow}
            onPress={() => setConfirmLogoutVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Log Out"
          >
            <View style={[styles.menuIcon, styles.menuIconDanger]}>
              <LogOut size={18} color={V6Colors.dangerText} />
            </View>
            <Text style={[styles.menuLabel, styles.dangerText]}>Log Out</Text>
          </Tap>
        </View>

        <ConfirmationModal
          visible={confirmLogoutVisible}
          title="Confirm Log Out"
          message="Are you sure you want to log out?"
          confirmLabel="Log Out"
          cancelLabel="Cancel"
          destructive
          icon={LogOut}
          onConfirm={() => {
            setConfirmLogoutVisible(false);
            onLogout();
          }}
          onCancel={() => setConfirmLogoutVisible(false)}
        />

        <View style={styles.bottomGap} />
      </ScrollView>
    </View>
  );
}

/** One line of the Account card: an icon, a small label, and the value (or a link) under it. */
function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  const { V6Colors, styles } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon size={19} color={V6Colors.ink700} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        {children}
      </View>
    </View>
  );
}

/** A tappable row of the menu card: an icon tile, the label, and a chevron. */
function MenuRow({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const { V6Colors, styles } = useThemedStyles(createThemedStyles);
  return (
    <Tap style={styles.menuRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.menuIcon}>
        <Icon size={18} color={V6Colors.ink700} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <ChevronRight size={18} color={V6Colors.ink500} />
    </Tap>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },
    body: { flex: 1 },
    scrollContent: { paddingHorizontal: Spacing.screenH, paddingBottom: 20 },
    bottomGap: { height: 20 },

    top: { alignItems: 'center', paddingBottom: 4 },
    backBtn: {
      position: 'absolute', left: 0, width: 40, height: 40, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.line,
      alignItems: 'center', justifyContent: 'center',
    },

    avatarWrap: { width: 96, height: 96 },
    avatar: {
      width: 96, height: 96, borderRadius: 48, overflow: 'hidden',
      backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: Colors.primaryDeep, fontSize: 34, fontWeight: '700', fontFamily: 'Inter' },
    cameraBadge: {
      position: 'absolute', right: 0, bottom: 2, width: 30, height: 30, borderRadius: 15,
      backgroundColor: Colors.primary, borderWidth: 2, borderColor: C.canvas,
      alignItems: 'center', justifyContent: 'center',
    },
    name: {
      color: C.ink900, fontSize: 20, fontWeight: '700', fontFamily: 'Inter', lineHeight: 26,
      textAlign: 'center', marginTop: 12,
    },
    subtitle: {
      color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 20,
      textAlign: 'center', marginTop: 2, paddingHorizontal: 12,
    },
    editButton: {
      marginTop: 14, minHeight: 40, paddingHorizontal: 18, borderRadius: 999,
      backgroundColor: Colors.primaryTonal, alignItems: 'center', justifyContent: 'center',
    },
    editText: { color: Colors.primaryDeep, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', lineHeight: 18 },

    statsCard: {
      flexDirection: 'row', marginTop: 20, paddingVertical: 14,
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line,
    },
    stat: { flex: 1, alignItems: 'center', paddingHorizontal: 8, gap: 2 },
    statValue: { color: C.ink900, fontSize: 20, fontWeight: '700', fontFamily: 'Inter', lineHeight: 26 },
    statLabel: { color: C.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18, textAlign: 'center' },
    statDivider: { width: 1, marginVertical: 4, backgroundColor: C.line },

    sectionLabel: {
      color: C.ink500, fontSize: 12, fontWeight: '700', fontFamily: 'Inter', letterSpacing: 0.6,
      textTransform: 'uppercase', marginTop: 22, marginBottom: 8, paddingHorizontal: 4,
    },
    card: {
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line,
      overflow: 'hidden', marginTop: 16,
    },
    divider: { height: 1, marginHorizontal: 14, backgroundColor: C.line },

    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
    infoIcon: { width: 20, alignItems: 'center', marginTop: 2 },
    infoCopy: { flex: 1, minWidth: 0, gap: 2 },
    infoLabel: { color: C.ink500, fontSize: 12, fontFamily: 'Inter', lineHeight: 16 },
    infoValue: { color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },
    linkTap: { alignSelf: 'flex-start' },
    linkText: { color: Colors.link, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },

    menuRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      minHeight: 56, paddingVertical: 10, paddingHorizontal: 14,
    },
    menuIcon: {
      width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.line,
      backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    },
    menuIconDanger: { borderColor: V6Colors.dangerBorder, backgroundColor: V6Colors.dangerSurface },
    menuLabel: { flex: 1, color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },
    dangerText: { color: V6Colors.dangerText },
  });
  return { Colors, V6Colors, C, styles };
}
