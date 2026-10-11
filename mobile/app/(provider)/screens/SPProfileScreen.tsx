/**
 * SPProfileScreen.tsx (Profile tab, provider)
 *
 * Figma "Profile · provider" (79:2904): the same structure as the homeowner
 * profile. The canvas background, a centred avatar with a camera badge (it opens
 * Edit Profile, where the photo is changed), the name, the services with a
 * Verified chip, an Edit profile button, a stats card, then the Your work and
 * Account cards, Settings and Help & support, and Log Out on its own card.
 *
 * It is the Profile tab, which has no back button; the back button appears only
 * when onBack is passed.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { Fragment, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  ChevronRight,
  CircleHelp,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import Tap from '../../../src/components/ui/Tap';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import OwnAvatar from '../../../src/components/OwnAvatar';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useRefreshOnForeground } from '../../../src/hooks/useRefreshOnForeground';
import { useRetainedScroll } from '../../../src/hooks/useRetainedState';
import { SPScreen } from '../../../src/types/navigation';
import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api } from '../../../src/lib/api';
import { initials } from '../../../src/lib/format';
import { approvedServiceNames } from '../../../src/lib/providerServices';

interface SPProfileScreenProps {
  onNavigate: (screen: SPScreen) => void;
  onLogout: () => void;
  /** Omit on the Profile tab, which has no back arrow. */
  onBack?: () => void;
}

/** One row of a menu card. */
interface MenuItem {
  key: string;
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}

export default function SPProfileScreen({ onNavigate, onLogout, onBack }: SPProfileScreenProps) {
  const { V6Colors, Colors, styles } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop(4);
  // Coming back from Settings/Edit Profile keeps the list where it was.
  const scroll = useRetainedScroll('sp.profile');
  const { profile, providerProfile, refreshProfile } = useAuth();
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  const name = profile?.full_name ?? '';
  const jobsDone = providerProfile?.cached_completed_jobs ?? 0;
  const rating = providerProfile?.cached_avg_rating;
  const ratingLabel = rating != null ? Number(rating).toFixed(1) : '—';
  const services = providerProfile ? approvedServiceNames(providerProfile).join(' · ') : '';
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
  // Hired, confirmed or under way — same definition My Work's Booked and Working groups use.
  const active = useAsyncData(async () => {
    const jobs = await api.assignedJobs();
    return jobs.filter((j) => ['assigned', 'confirmed', 'in_progress'].includes(j.status)).length;
  }, [], 'sp-profile-active');

  const phone = profile?.phone?.trim() || '';
  // A geocoded address usually already contains the city; don't repeat it.
  const location =
    (profile?.address && profile?.city && profile.address.includes(profile.city)
      ? profile.address
      : [profile?.city, profile?.address].filter(Boolean).join(', ')) || null;

  const workItems: MenuItem[] = [
    ...(isVerified
      ? []
      : [{ key: 'verify', icon: ShieldCheck, label: 'Get verified', onPress: () => onNavigate('Verification') }]),
    { key: 'services', icon: Wrench, label: 'My services', onPress: () => onNavigate('My Services') },
    { key: 'portfolio', icon: Camera, label: 'Portfolio', onPress: () => onNavigate('Portfolio') },
    { key: 'payouts', icon: Wallet, label: 'Payouts', onPress: () => onNavigate('Payouts') },
  ];
  const helpItems: MenuItem[] = [
    { key: 'settings', icon: Settings, label: 'Settings', onPress: () => onNavigate('Settings') },
    { key: 'help', icon: CircleHelp, label: 'Help & support', onPress: () => onNavigate('Help & Support') },
  ];

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
              accessibilityLabel="Back to Feed"
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
          <View style={styles.metaRow}>
            {!!services && <Text style={styles.services} numberOfLines={2}>{services}</Text>}
            {isVerified ? (
              <View style={[styles.chip, styles.chipOk]}>
                <BadgeCheck size={13} color={V6Colors.successText} />
                <Text style={[styles.chipText, styles.chipOkText]}>Verified</Text>
              </View>
            ) : (
              <View style={[styles.chip, styles.chipWarn]}>
                <ShieldAlert size={13} color={V6Colors.warningText} />
                <Text style={[styles.chipText, styles.chipWarnText]}>Not verified</Text>
              </View>
            )}
          </View>
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
            <Text style={styles.statValue}>{jobsDone}</Text>
            <Text style={styles.statLabel}>Jobs done</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{ratingLabel}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{active.data ?? '—'}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel} accessibilityRole="header">Your work</Text>
          <MenuCard items={workItems} />
        </View>

        <View style={styles.section}>
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

        <MenuCard items={helpItems} spaced />

        {/* Log Out sits on its own, without a chevron, so it isn't tapped by
            accident while moving down the menu. */}
        <View style={[styles.card, styles.cardGap]}>
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

/**
 * A card of tappable rows with a hairline between them. `spaced` leaves room
 * above it, for a card that stands on its own rather than under a label.
 */
function MenuCard({ items, spaced = false }: { items: MenuItem[]; spaced?: boolean }) {
  const { styles } = useThemedStyles(createThemedStyles);
  return (
    <View style={[styles.card, spaced && styles.cardGap]}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && <View style={styles.divider} />}
          <MenuRow icon={item.icon} label={item.label} onPress={item.onPress} />
        </Fragment>
      ))}
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

/** A tappable row of a menu card: an icon tile, the label, and a chevron. */
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
    metaRow: {
      flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center',
      gap: 8, marginTop: 2, paddingHorizontal: 12,
    },
    services: {
      color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 20, textAlign: 'center', flexShrink: 1,
    },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, borderWidth: 1,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    chipText: { fontSize: 12, fontWeight: '700', fontFamily: 'Inter', lineHeight: 16 },
    chipOk: { backgroundColor: C.successSurface, borderColor: C.successBorder },
    chipOkText: { color: C.successText },
    chipWarn: { backgroundColor: C.warningSurface, borderColor: C.warningBorder },
    chipWarnText: { color: C.warningText },
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

    section: { marginTop: 22 },
    sectionLabel: {
      color: C.ink500, fontSize: 12, fontWeight: '700', fontFamily: 'Inter', letterSpacing: 0.6,
      textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4,
    },
    card: {
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line,
      overflow: 'hidden',
    },
    cardGap: { marginTop: 16 },
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
    menuIconDanger: { borderColor: C.dangerBorder, backgroundColor: C.dangerSurface },
    menuLabel: { flex: 1, color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter', lineHeight: 20 },
    dangerText: { color: C.dangerText },
  });
  return { Colors, V6Colors, styles };
}
