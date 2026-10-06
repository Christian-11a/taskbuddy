import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import { CheckCircle2, Circle, KeyRound, ShieldCheck } from 'lucide-react-native';
import { V6Radii } from '../constants/theme';
import { api } from '../lib/api';
import PasswordInput from './PasswordInput';

const MIN_LENGTH = 8;

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * Change Password, shared by both roles' Settings. Labelled fields with
 * show/hide toggles and a live checklist of the rules, so the user sees what
 * is wrong before pressing Save rather than after.
 */
export default function ChangePasswordModal({ visible, onClose }: ChangePasswordModalProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const rules = [
    { label: `At least ${MIN_LENGTH} characters`, ok: newPassword.length >= MIN_LENGTH },
    { label: 'Different from your current password', ok: !!newPassword && newPassword !== currentPassword },
    { label: 'Both new passwords match', ok: !!confirmPassword && newPassword === confirmPassword },
  ];
  const canSave = !!currentPassword && rules.every((r) => r.ok) && !saving;

  const close = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(false);
    onClose();
  };

  const handleSave = async () => {
    if (!canSave) return;
    Keyboard.dismiss();
    setError(null);
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
    <SheetFrame visible={visible} onClose={saving ? undefined : close} contentStyle={styles.dialog}>
            {success ? (
              <View style={styles.successWrap}>
                <View style={[styles.iconWell, styles.iconWellSuccess]}>
                  <ShieldCheck size={26} color={V6Colors.successText} />
                </View>
                <Text style={styles.title} accessibilityRole="header">Password updated</Text>
                <Text style={styles.subtitle}>Use your new password the next time you sign in.</Text>
                <Tap style={[styles.primaryBtn, styles.fullWidth]} onPress={close} activeOpacity={0.85} accessibilityRole="button">
                  <Text style={styles.primaryText}>Done</Text>
                </Tap>
              </View>
            ) : (
              <>
                <View style={styles.iconWell}>
                  <KeyRound size={24} color={V6Colors.link} />
                </View>
                <Text style={styles.title} accessibilityRole="header">Change password</Text>
                <Text style={styles.subtitle}>Enter your current password, then choose a new one.</Text>

                <Text style={styles.label}>Current password</Text>
                <PasswordInput
                  containerStyle={styles.inputBox}
                  inputStyle={styles.input}
                  placeholder="Current password"
                  placeholderTextColor={C.ink400}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  editable={!saving}
                  returnKeyType="next"
                  onSubmitEditing={() => newRef.current?.focus()}
                  accessibilityLabel="Current password"
                  testID="input-current-password"
                />

                <Text style={styles.label}>New password</Text>
                <PasswordInput
                  ref={newRef}
                  containerStyle={styles.inputBox}
                  inputStyle={styles.input}
                  placeholder="New password"
                  placeholderTextColor={C.ink400}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  editable={!saving}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  accessibilityLabel="New password"
                  testID="input-new-password"
                />

                <Text style={styles.label}>Confirm new password</Text>
                <PasswordInput
                  ref={confirmRef}
                  containerStyle={styles.inputBox}
                  inputStyle={styles.input}
                  placeholder="Re-enter new password"
                  placeholderTextColor={C.ink400}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!saving}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                  accessibilityLabel="Confirm new password"
                  testID="input-confirm-password"
                />

                <View style={styles.rules}>
                  {rules.map((rule) => (
                    <View key={rule.label} style={styles.ruleRow}>
                      {rule.ok ? <CheckCircle2 size={15} color={V6Colors.successText} /> : <Circle size={15} color={C.ink300} />}
                      <Text style={[styles.ruleText, rule.ok && styles.ruleTextOk]}>{rule.label}</Text>
                    </View>
                  ))}
                </View>

                {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}

                <View style={styles.actions}>
                  <Tap style={styles.secondaryBtn} onPress={close} disabled={saving} activeOpacity={0.8} accessibilityRole="button">
                    <Text style={styles.secondaryText}>Cancel</Text>
                  </Tap>
                  <Tap
                    style={[styles.primaryBtn, !canSave && styles.disabled]}
                    onPress={handleSave}
                    disabled={!canSave}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSave }}
                    testID="btn-update-password"
                  >
                    {saving ? <ActivityIndicator color={C.onPrimary} /> : <Text style={[styles.primaryText, !canSave && styles.disabledText]}>Update password</Text>}
                  </Tap>
                </View>
              </>
            )}
    </SheetFrame>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
    overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(6, 61, 77, 0.5)' },
    dialog: { backgroundColor: C.surface, borderRadius: V6Radii.card, padding: 22, width: '100%', maxWidth: 440, alignSelf: 'center' },
    iconWell: {
      width: 48, height: 48, borderRadius: 14, backgroundColor: C.cyan50,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    iconWellSuccess: { backgroundColor: V6Colors.successSurface },
    title: { color: C.ink900, fontSize: 19, fontWeight: '800', fontFamily: 'Inter' },
    subtitle: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 19, marginTop: 4, marginBottom: 16 },
    label: { color: C.ink700, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter', marginBottom: 6 },
    inputBox: {
      backgroundColor: V6Colors.wellBg, borderRadius: 12, paddingHorizontal: 14, minHeight: 46,
      borderWidth: 1, borderColor: V6Colors.fieldBorder, marginBottom: 12,
    },
    input: { fontFamily: 'Inter', fontSize: 15, color: C.ink900, paddingVertical: 10 },
    rules: { gap: 6, marginTop: 2, marginBottom: 12 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ruleText: { color: C.ink500, fontSize: 13, fontFamily: 'Inter' },
    ruleTextOk: { color: V6Colors.successText },
    error: { color: V6Colors.dangerText, fontSize: 13.5, fontFamily: 'Inter', marginBottom: 10 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    secondaryBtn: {
      flex: 1, borderWidth: 1, borderColor: V6Colors.fieldBorder, borderRadius: 10,
      minHeight: 44, alignItems: 'center', justifyContent: 'center',
    },
    secondaryText: { color: C.ink500, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    primaryBtn: {
      flex: 1, backgroundColor: C.cyan700, borderRadius: 10,
      minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
    },
    primaryText: { color: C.onPrimary, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    // Readable disabled state: grey fill with dark text instead of a faded button.
    disabled: { backgroundColor: V6Colors.ink100 },
    disabledText: { color: V6Colors.ink700 },
    successWrap: { alignItems: 'center' },
    fullWidth: { flex: 0, alignSelf: 'stretch', marginTop: 4 },
  });
  return { Colors, V6Colors, C, styles };
}
