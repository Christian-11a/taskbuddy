/**
 * HOSettingsScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-settings screen — a flat
 * white .topbar (not a colored hero), a Notifications toggle card (3 native
 * switches, no per-row description text), an Account .navrow card, and a
 * single outline "Log Out" button.
 *
 * Also fixes a real bug found while restyling: the old file defined
 * `logoutBtn` styles but never rendered a logout button in the JSX, so there
 * was previously no way to log out from this screen at all despite
 * `onLogout` being a prop. Wired it now, with the same confirmation-modal
 * pattern used on the Profile screen.
 *
 * All five switches persist for real, through `useSettings` → GET/PATCH
 * /settings → the `user_settings` row from migration 0011. They used to be
 * plain `useState` that reset on every mount.
 *
 * "Dark Mode" is the one to be careful about: the *preference* is genuinely
 * stored, but the app still has no theme switching to apply it to, so the row
 * says as much rather than letting the switch imply a repaint that won't come.
 *
 * Change Password is real (calls the actual `/auth/change-password`
 * endpoint). Language and Delete Account intentionally don't fake real
 * functionality that doesn't exist yet: Language has no i18n backing so its
 * modal just states English is the only option for now; Delete Account has
 * no self-serve deletion endpoint, so it directs to support email instead of
 * pretending to delete the account.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
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
import { Sizes, Spacing, V6Colors } from '../../../src/constants/theme';

const C = V6Colors;
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { useSettings } from '../../../src/hooks/useSettings';
import { api } from '../../../src/lib/api';

const SUPPORT_EMAIL = 'support@taskbuddy.ph';

interface HOSettingsScreenProps {
  onBack: () => void;
  onLogout: () => void;
}

export default function HOSettingsScreen({ onBack, onLogout }: HOSettingsScreenProps) {
  const { flags, setFlag, loading: settingsLoading, error: settingsError } = useSettings();
  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const toggles = [
    { key: 'push_enabled' as const, label: 'Push Notifications' },
    { key: 'email_enabled' as const, label: 'Email Updates' },
    { key: 'sms_enabled' as const, label: 'SMS Alerts' },
  ];

  const accountItems = [
    { label: 'Change Password', icon: Lock, onPress: () => setShowPasswordModal(true) },
    { label: 'Language', icon: Globe, onPress: () => setShowLanguageModal(true) },
  ];

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a colored hero) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
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
              value={flags.dark_mode}
              onValueChange={(v) => void setFlag('dark_mode', v)}
              disabled={settingsLoading}
              trackColor={{ false: C.ink200, true: C.cyan600 }}
              thumbColor={C.white}
              ios_backgroundColor={C.ink200}
            />
          </View>
          {/* The preference is stored for real; nothing applies it yet. Saying
              so beats letting the switch imply a theme change that won't come. */}
          <Text style={styles.rowNote}>
            Saved to your account. Theme switching isn't available in the app yet.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.card}>
          {toggles.map((toggle, i) => (
            <View key={toggle.key} style={[styles.toggleRow, i < toggles.length - 1 && styles.rowBorder]}>
              <Text style={styles.toggleLabel}>{toggle.label}</Text>
              <Switch
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
        {!!settingsError && <Text style={styles.settingsError}>{settingsError}</Text>}

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
              <Trash2 size={17} color="#ef4444" />
            </View>
            <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Delete Account</Text>
            <ChevronRight size={20} color={C.ink300} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => setConfirmLogoutVisible(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.logoutBtnText}>Log Out</Text>
        </TouchableOpacity>

        <View style={{ height: 20 }} />
      </ScrollView>

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

      <ConfirmationModal
        visible={showDeleteModal}
        title="Delete your account?"
        message="Account deletion isn't self-serve yet. Email us and we'll take care of it for you."
        confirmLabel="Email Support"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowDeleteModal(false);
          Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Delete my account`);
        }}
        onCancel={() => setShowDeleteModal(false)}
      />
    </View>
  );
}

function ChangePasswordModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    setError(null);
    if (!currentPassword || !newPassword) {
      setError('Fill in both password fields.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.changePassword({ current_password: currentPassword, new_password: newPassword });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close} accessible={false}>
        <Pressable
          style={styles.dialog}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          {success ? (
            <>
              <Text style={styles.dialogTitle} accessibilityRole="header">Password changed</Text>
              <Text style={styles.dialogBody}>Your password has been updated.</Text>
              <TouchableOpacity
                style={styles.dialogCloseBtn}
                onPress={close}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.dialogCloseText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.dialogTitle} accessibilityRole="header">Change Password</Text>
              <TextInput
                style={styles.pwInput}
                placeholder="Current password"
                placeholderTextColor={C.ink400}
                secureTextEntry
                value={currentPassword}
                onChangeText={setCurrentPassword}
                editable={!saving}
                accessibilityLabel="Current password"
              />
              <TextInput
                style={styles.pwInput}
                placeholder="New password"
                placeholderTextColor={C.ink400}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                editable={!saving}
                accessibilityLabel="New password"
              />
              <TextInput
                style={styles.pwInput}
                placeholder="Confirm new password"
                placeholderTextColor={C.ink400}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!saving}
                accessibilityLabel="Confirm new password"
              />
              {!!error && <Text style={styles.pwError}>{error}</Text>}
              <View style={styles.pwActions}>
                <TouchableOpacity
                  style={styles.dialogCancelBtn}
                  onPress={close}
                  disabled={saving}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.dialogCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dialogSaveBtn}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Save"
                >
                  {saving ? <ActivityIndicator color={C.white} /> : <Text style={styles.dialogSaveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.canvas },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.white,
    paddingTop: Sizes.statusBarHeight,
    paddingHorizontal: Spacing.screenH,
    paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#edf1f4',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: C.white, borderWidth: 1, borderColor: '#e8edf2',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, color: C.ink900, fontSize: 19.5, fontWeight: '800', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.ink400, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, fontFamily: 'Inter' },
  card: { backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginBottom: 20 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: C.ink50 },

  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { fontSize: 14.5, color: C.ink900, fontWeight: '600', fontFamily: 'Inter' },
  rowNote: { fontSize: 12.5, color: C.ink400, fontFamily: 'Inter', lineHeight: 17, paddingHorizontal: 16, paddingBottom: 13, marginTop: -4 },
  settingsError: { color: '#ef4444', fontSize: 13, fontFamily: 'Inter', marginTop: -12, marginBottom: 18 },

  navrow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 15 },
  rowIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#f5f8fa', alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, color: C.ink900, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
  rowLabelDanger: { color: '#ef4444' },

  logoutBtn: {
    borderWidth: 1, borderColor: '#dce3e9', borderRadius: 13, paddingVertical: 14,
    alignItems: 'center',
  },
  logoutBtnText: { color: C.ink700, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },

  // Shared small-dialog styles (Language + Change Password)
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(6, 61, 77, 0.5)' },
  dialog: { backgroundColor: C.white, borderRadius: 20, padding: 22 },
  dialogTitle: { color: C.ink900, fontSize: 19, fontWeight: '800', fontFamily: 'Inter', marginBottom: 14 },
  dialogBody: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 19, marginTop: 4, marginBottom: 16 },
  dialogCloseBtn: { backgroundColor: C.cyan700, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  dialogCloseText: { color: C.white, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },

  langRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f5f8fa', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  langLabel: { color: C.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
  langBadge: { color: C.cyan700, fontSize: 12, fontWeight: '700', fontFamily: 'Inter' },

  pwInput: {
    backgroundColor: '#f5f8fa', borderRadius: 12, paddingHorizontal: 14, minHeight: 46,
    borderWidth: 1, borderColor: '#dce3e9', fontFamily: 'Inter', fontSize: 15, color: C.ink900,
    marginBottom: 10,
  },
  pwError: { color: '#ef4444', fontSize: 13, fontFamily: 'Inter', marginBottom: 6 },
  pwActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  dialogCancelBtn: { flex: 1, borderWidth: 1, borderColor: '#dce3e9', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  dialogCancelText: { color: C.ink500, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  dialogSaveBtn: { flex: 1, backgroundColor: C.cyan700, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  dialogSaveText: { color: C.white, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
});
