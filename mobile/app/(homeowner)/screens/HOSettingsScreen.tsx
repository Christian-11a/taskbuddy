/**
 * HOSettingsScreen.tsx
 *
 * Settings for the homeowner, grouped by topic: Appearance (dark mode),
 * Notifications (push), Account (change password, language), then a lone red
 * Delete account row and the app version.
 *
 * Every switch persists for real, through `useSettings` → GET/PATCH /settings.
 * Only Push is offered among the notification switches: the server reads
 * push_enabled when it sends pushes, but nothing reads email_enabled or
 * sms_enabled, so those two switches would promise alerts that are never sent.
 *
 * Dark Mode applies the shared palette and persists through settings.
 *
 * Change Password is shown only for accounts with a password. Language has no
 * i18n backing, so its sheet states English is the only option for now.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import SheetFrame from '../../../src/components/ui/SheetFrame';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Globe,
  Lock,
  Moon,
  Trash2,
} from 'lucide-react-native';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import DeleteAccountModal from '../../../src/components/DeleteAccountModal';
import ChangePasswordModal from '../../../src/components/ChangePasswordModal';
import { useSettings } from '../../../src/hooks/useSettings';
import { useAuth } from '../../../src/context/AuthContext';
import { appVersion } from '../../../src/lib/appVersion';

// The header back button is 38 dp; the extra 5 dp on each side reaches 48.
const BACK_HIT_SLOP = { top: 5, bottom: 5, left: 5, right: 5 } as const;
const LINK_HIT_SLOP = { top: 15, bottom: 15, left: 8, right: 8 } as const;

interface HOSettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
}

export default function HOSettingsScreen({ onBack, onLogout }: HOSettingsScreenProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { flags, setFlag, loading: settingsLoading, error: settingsError, reload: reloadSettings } = useSettings();
  const { profile } = useAuth();
  const version = appVersion();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a colored hero) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap style={styles.backBtn} onPress={onBack} activeOpacity={0.8} hitSlop={BACK_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Back">
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Moon size={18} color={V6Colors.ink700} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Dark mode</Text>
              <Text style={styles.rowHint}>Easier on the eyes at night</Text>
            </View>
            <Switch
              testID="toggle-dark-mode"
              value={flags.dark_mode}
              disabled={settingsLoading}
              onValueChange={(value) => void setFlag('dark_mode', value)}
              accessibilityLabel="Dark mode"
              trackColor={{ false: C.ink200, true: C.cyan600 }}
              thumbColor={C.white}
              ios_backgroundColor={C.ink200}
            />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Bell size={18} color={V6Colors.ink700} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Push notifications</Text>
              <Text style={styles.rowHint}>Proposals, bookings and messages</Text>
            </View>
            <Switch
              testID="toggle-push_enabled"
              value={flags.push_enabled}
              disabled={settingsLoading}
              onValueChange={(v) => void setFlag('push_enabled', v)}
              accessibilityLabel="Push notifications"
              trackColor={{ false: C.ink200, true: C.cyan600 }}
              thumbColor={C.white}
              ios_backgroundColor={C.ink200}
            />
          </View>
        </View>
        {!!settingsError && (
          <View>
            <Text style={styles.settingsError}>{settingsError}</Text>
            <Tap onPress={reloadSettings} activeOpacity={0.8} hitSlop={LINK_HIT_SLOP} accessibilityRole="button" accessibilityLabel="Retry settings">
              <Text style={styles.retryText}>Retry settings</Text>
            </Tap>
          </View>
        )}

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {!!profile?.has_password && (
            <Tap
              style={[styles.row, styles.rowBorder]}
              activeOpacity={0.7}
              onPress={() => setShowPasswordModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Change password"
            >
              <View style={styles.rowIcon}>
                <Lock size={18} color={V6Colors.ink700} />
              </View>
              <Text style={styles.rowLabel}>Change password</Text>
              <ChevronRight size={20} color={V6Colors.ink500} />
            </Tap>
          )}
          <Tap
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => setShowLanguageModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Language, English"
          >
            <View style={styles.rowIcon}>
              <Globe size={18} color={V6Colors.ink700} />
            </View>
            <Text style={styles.rowLabel}>Language</Text>
            <Text style={styles.rowValue}>English</Text>
            <ChevronRight size={20} color={V6Colors.ink500} />
          </Tap>
        </View>

        <View style={styles.card}>
          <Tap
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => setShowDeleteModal(true)}
            testID="settings-delete-account-row"
            accessibilityRole="button"
            accessibilityLabel="Delete account"
          >
            <View style={styles.rowIcon}>
              <Trash2 size={18} color={V6Colors.dangerText} />
            </View>
            <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Delete account</Text>
          </Tap>
        </View>

        {!!version && <Text style={styles.footer}>{`TaskBuddy · version ${version}`}</Text>}
      </ScrollView>

      <ChangePasswordModal visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} />

      <SheetFrame visible={showLanguageModal} onClose={() => setShowLanguageModal(false)} contentStyle={styles.dialog} cardProps={{ accessibilityRole: "alert" }}>
            <Text style={styles.dialogTitle} accessibilityRole="header">Language</Text>
            <View style={styles.langRow}>
              <Text style={styles.langLabel}>English</Text>
              <Text style={styles.langBadge}>Selected</Text>
            </View>
            <Text style={styles.dialogBody}>More languages are coming soon.</Text>
            <Tap
              style={styles.dialogCloseBtn}
              onPress={() => setShowLanguageModal(false)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.dialogCloseText}>Close</Text>
            </Tap>
    </SheetFrame>

      <DeleteAccountModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={onLogout}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.canvas },

    header: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface,
      paddingHorizontal: Spacing.screenH,
      paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: V6Colors.line,
    },
    backBtn: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: C.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },
    headerSpacer: { width: 38 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 28 },

    sectionTitle: {
      color: V6Colors.ink500, fontSize: 13, fontWeight: '700', fontFamily: 'Inter',
      letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8,
    },
    card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: V6Colors.line, overflow: 'hidden', marginBottom: 20 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: V6Colors.line },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    rowIcon: {
      width: 34, height: 34, borderRadius: 10, backgroundColor: V6Colors.wellBg,
      alignItems: 'center', justifyContent: 'center',
    },
    rowText: { flex: 1 },
    rowLabel: { color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
    rowLabelDanger: { color: V6Colors.dangerText },
    rowHint: { color: V6Colors.ink500, fontSize: 13, fontFamily: 'Inter', lineHeight: 18, marginTop: 2 },
    rowValue: { color: V6Colors.ink500, fontSize: 14, fontFamily: 'Inter' },

    settingsError: { color: V6Colors.dangerText, fontSize: 13, fontFamily: 'Inter', marginTop: -12, marginBottom: 18 },
    retryText: { color: Colors.link, fontSize: 14, fontWeight: '600', fontFamily: 'Inter', paddingBottom: 16 },
    footer: { color: V6Colors.ink500, fontSize: 12.5, fontFamily: 'Inter', textAlign: 'center', marginTop: 4 },

    // Language dialog
    overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(6, 61, 77, 0.5)' },
    dialog: { backgroundColor: C.surface, borderRadius: 20, padding: 22 },
    dialogTitle: { color: C.ink900, fontSize: 19, fontWeight: '800', fontFamily: 'Inter', marginBottom: 14 },
    dialogBody: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 19, marginTop: 4, marginBottom: 16 },
    dialogCloseBtn: { backgroundColor: C.cyan700, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    dialogCloseText: { color: C.onPrimary, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },

    langRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: V6Colors.wellBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    langLabel: { color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
    langBadge: { color: Colors.link, fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },

  });
  return { Colors, V6Colors, C, styles };
}
