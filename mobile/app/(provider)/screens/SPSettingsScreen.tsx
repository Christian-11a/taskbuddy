/**
 * SPSettingsScreen.tsx
 *
 * Mirrors HOSettingsScreen.tsx's structure exactly — flat white .topbar, an
 * Appearance card (Dark Mode), a Notifications toggle card (3 native
 * switches) and an Account .navrow card (Log Out lives on Profile) — since the mockup never gave providers a Settings screen at all (only
 * homeowners had #ho-settings) and there's no reason the two should differ.
 *
 * All five switches persist through `useSettings` → GET/PATCH /settings.
 * Dark Mode applies the shared palette and persists through settings.
 *
 * Change Password is shown only for accounts with a password. Language has no
 * i18n backing, so its modal states English is the only option for now.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
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
import { api } from '../../../src/lib/api';

interface SPSettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
}

export default function SPSettingsScreen({ onBack, onLogout }: SPSettingsScreenProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { flags, setFlag, loading: settingsLoading, error: settingsError, reload: reloadSettings } = useSettings();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const toggles = [
    { key: 'push_enabled' as const, label: 'Push Notifications' },
    { key: 'email_enabled' as const, label: 'Email Updates' },
    { key: 'sms_enabled' as const, label: 'SMS Alerts' },
  ];

  const { profile } = useAuth();
  const accountItems = [
    ...(profile?.has_password ? [{ label: 'Change Password', icon: Lock, onPress: () => setShowPasswordModal(true) }] : []),
    { label: 'Language', icon: Globe, onPress: () => setShowLanguageModal(true) },
  ];

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a colored hero) */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelRow}>
              <Moon size={17} color={C.ink700} />
              <Text style={styles.toggleLabel}>Dark Mode</Text>
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
          <Text style={styles.rowNote}>
            Applies to all screens and is saved to your account.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          {toggles.map((toggle, i) => (
            <View key={toggle.key} style={[styles.toggleRow, i < toggles.length - 1 && styles.rowBorder]}>
              <Text style={styles.toggleLabel}>{toggle.label}</Text>
              <Switch
                testID={`toggle-${toggle.key}`}
                value={flags[toggle.key]}
                onValueChange={(v) => void setFlag(toggle.key, v)}
                disabled={settingsLoading}
                trackColor={{ false: C.ink200, true: C.cyan600 }}
                thumbColor={C.white}
                ios_backgroundColor={C.ink200}
              />
            </View>
          ))}
        </View>
        {!!settingsError && <View>
          <Text style={styles.settingsError}>{settingsError}</Text>
          <TouchableOpacity onPress={reloadSettings} accessibilityLabel="Retry settings">
            <Text style={{color: V6Colors.link, paddingBottom: 16}}>Retry settings</Text>
          </TouchableOpacity>
        </View>}

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {accountItems.map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.navrow, i < accountItems.length - 1 && styles.rowBorder]}
              activeOpacity={0.7}
              onPress={item.onPress}
            >
              <View style={styles.rowIcon}>
                <item.icon size={17} color={C.ink700} />
              </View>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <ChevronRight size={20} color={C.ink300} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.navrow} activeOpacity={0.7} onPress={() => setShowDeleteModal(true)}>
            <View style={styles.rowIcon}>
              <Trash2 size={17} color={V6Colors.dangerText} />
            </View>
            <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Delete Account</Text>
            <ChevronRight size={20} color={C.ink300} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      <ChangePasswordModal visible={showPasswordModal} onClose={() => setShowPasswordModal(false)} />

      <Modal visible={showLanguageModal} transparent animationType="fade" onRequestClose={() => setShowLanguageModal(false)}>
        <Pressable style={styles.overlay} onPress={() => setShowLanguageModal(false)} accessible={false}>
          <Pressable
            style={styles.dialog}
            onPress={(e) => e.stopPropagation()}
            accessibilityViewIsModal
            accessibilityRole="alert"
          >
            <Text style={styles.dialogTitle} accessibilityRole="header">Language</Text>
            <View style={styles.langRow}>
              <Text style={styles.langLabel}>English</Text>
              <Text style={styles.langBadge}>Selected</Text>
            </View>
            <Text style={styles.dialogBody}>More languages are coming soon.</Text>
            <TouchableOpacity
              style={styles.dialogCloseBtn}
              onPress={() => setShowLanguageModal(false)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.dialogCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },

    sectionTitle: { fontSize: 13, fontWeight: '700', color: C.ink400, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, fontFamily: 'Inter' },
    card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginBottom: 20 },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: C.ink50 },

    toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
    toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    toggleLabel: { fontSize: 14.5, color: C.ink900, fontWeight: '600', fontFamily: 'Inter' },
    rowNote: { fontSize: 12.5, color: C.ink400, fontFamily: 'Inter', lineHeight: 17, paddingHorizontal: 16, paddingBottom: 13, marginTop: -4 },
    settingsError: { color: V6Colors.dangerText, fontSize: 13, fontFamily: 'Inter', marginTop: -12, marginBottom: 18 },

    navrow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 15 },
    rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: V6Colors.wellBg, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, color: C.ink900, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
    rowLabelDanger: { color: V6Colors.dangerText },

    // Language dialog
    overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(6, 61, 77, 0.5)' },
    dialog: { backgroundColor: C.surface, borderRadius: 20, padding: 22 },
    dialogTitle: { color: C.ink900, fontSize: 19, fontWeight: '800', fontFamily: 'Inter', marginBottom: 14 },
    dialogBody: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 19, marginTop: 4, marginBottom: 16 },
    dialogCloseBtn: { backgroundColor: C.cyan700, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    dialogCloseText: { color: C.onPrimary, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },

    langRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: V6Colors.wellBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
    langLabel: { color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
    langBadge: { color: V6Colors.link, fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },

  });
  return { Colors, V6Colors, C, styles };
}
