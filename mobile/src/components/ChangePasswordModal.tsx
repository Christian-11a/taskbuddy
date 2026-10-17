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
import { CheckCircle2, Circle, CircleAlert, KeyRound, ShieldCheck } from 'lucide-react-native';
import { api } from '../lib/api';
import { validateNewPasswordDiffers, validatePasswordRules } from '../lib/inputRules';
import PasswordInput from './PasswordInput';

const MIN_LENGTH = 8;
const MAX_LENGTH = 72;
const LINK_HIT_SLOP = { top: 15, bottom: 15, left: 8, right: 8 } as const;

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
}

type Touched = { current: boolean; next: boolean; confirm: boolean };
const NOT_TOUCHED: Touched = { current: false, next: false, confirm: false };
const ALL_TOUCHED: Touched = { current: true, next: true, confirm: true };

/**
 * Change password, as a bottom sheet from Settings. Labelled fields with
 * show/hide toggles and a live checklist of the rules, so the user sees what is
 * still missing. Update password stays disabled until every rule passes. A
 * field's message appears once that field is left, or once Done is pressed on
 * the confirm field while the rules are not met. A server answer appears after
 * Update password is sent.
 */
export default function ChangePasswordModal({ visible, onClose }: ChangePasswordModalProps) {
  const { C, styles, V6Colors, Colors } = useThemedStyles(createThemedStyles);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState<Touched>(NOT_TOUCHED);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const rules = [
    { label: `${MIN_LENGTH}–${MAX_LENGTH} characters`, ok: newPassword.length >= MIN_LENGTH && newPassword.length <= MAX_LENGTH },
    { label: 'A letter and a number', ok: /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword) },
    { label: 'Different from your current password', ok: !!newPassword && !!currentPassword && newPassword !== currentPassword },
    { label: 'Both new passwords match', ok: !!confirmPassword && newPassword === confirmPassword },
  ];
  // The message the new-password field shows, whether or not it is shown yet. A password it refuses (such as
  // only spaces) is not sent, even when the checklist above is complete.
  const newRuleError = validatePasswordRules(newPassword, 'New password') ?? validateNewPasswordDiffers(currentPassword, newPassword);
  const canSave = !!currentPassword.trim() && rules.every((r) => r.ok) && newRuleError === null && !saving;

  // Each message is computed from the values now, and shown only for a field the user has left.
  const currentError = touched.current && !currentPassword.trim() ? 'Enter your current password' : undefined;
  const newError = touched.next ? newRuleError ?? undefined : undefined;
  const confirmError = touched.confirm
    ? (!confirmPassword ? 'Type your new password again' : newPassword !== confirmPassword ? 'Passwords do not match.' : undefined)
    : undefined;

  const close = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTouched(NOT_TOUCHED);
    setError(null);
    setSuccess(false);
    onClose();
  };

  const handleSave = async () => {
    if (!canSave) {
      // Pressed while the rules are not met: show every message, send nothing.
      setTouched(ALL_TOUCHED);
      return;
    }
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
    <SheetFrame visible={visible} onClose={saving ? undefined : close} contentStyle={styles.sheet}>
      {success ? (
        <View style={styles.successWrap}>
          <View style={[styles.iconWell, styles.iconWellSuccess]}>
            <ShieldCheck size={26} color={V6Colors.successText} />
          </View>
          <Text style={styles.title} accessibilityRole="header">Password updated</Text>
          <Text style={styles.subtitle}>Use your new password the next time you sign in.</Text>
          <Tap style={[styles.primaryBtn, styles.fullWidth]} onPress={close} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={styles.primaryText}>Done</Text>
          </Tap>
        </View>
      ) : (
        <>
          <View style={styles.iconWell}>
            <KeyRound size={24} color={Colors.link} />
          </View>
          <Text style={styles.title} accessibilityRole="header">Change password</Text>

          <Text style={styles.label}>Current password</Text>
          <PasswordInput
            containerStyle={[styles.inputBox, !!currentError && styles.inputBoxError]}
            inputStyle={styles.input}
            placeholder="Current password"
            placeholderTextColor={C.ink400}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            onBlur={() => setTouched((t) => ({ ...t, current: true }))}
            editable={!saving}
            returnKeyType="next"
            onSubmitEditing={() => newRef.current?.focus()}
            accessibilityLabel="Current password"
            testID="input-current-password"
          />
          {!!currentError && <FieldError text={currentError} />}

          <Text style={styles.label}>New password</Text>
          <PasswordInput
            ref={newRef}
            containerStyle={[styles.inputBox, !!newError && styles.inputBoxError]}
            inputStyle={styles.input}
            placeholder="New password"
            placeholderTextColor={C.ink400}
            value={newPassword}
            onChangeText={setNewPassword}
            onBlur={() => setTouched((t) => ({ ...t, next: true }))}
            editable={!saving}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
            accessibilityLabel="New password"
            testID="input-new-password"
          />
          {!!newError && <FieldError text={newError} />}

          <Text style={styles.label}>Confirm new password</Text>
          <PasswordInput
            ref={confirmRef}
            containerStyle={[styles.inputBox, !!confirmError && styles.inputBoxError]}
            inputStyle={styles.input}
            placeholder="Type it again"
            placeholderTextColor={C.ink400}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
            editable={!saving}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            accessibilityLabel="Confirm new password"
            testID="input-confirm-password"
          />
          {!!confirmError && <FieldError text={confirmError} />}

          <View style={styles.rules}>
            {rules.map((rule) => (
              <View key={rule.label} style={styles.ruleRow}>
                {rule.ok ? <CheckCircle2 size={15} color={V6Colors.successText} /> : <Circle size={15} color={C.ink300} />}
                <Text style={[styles.ruleText, rule.ok && styles.ruleTextOk]}>{rule.label}</Text>
              </View>
            ))}
          </View>

          {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}

          <Tap
            style={[styles.primaryBtn, !canSave && styles.disabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Update password"
            accessibilityState={{ disabled: !canSave }}
            testID="btn-update-password"
          >
            {saving ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={[styles.primaryText, !canSave && styles.disabledText]}>Update password</Text>}
          </Tap>
          <Tap
            style={styles.cancelBtn}
            onPress={close}
            disabled={saving}
            activeOpacity={0.8}
            hitSlop={LINK_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Tap>
        </>
      )}
    </SheetFrame>
  );
}

/** The message under a password field, styled like the shared TextField's helper row. */
function FieldError({ text }: { text: string }) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  return (
    <View style={styles.fieldErrorRow}>
      <CircleAlert size={14} color={V6Colors.dangerText} />
      <Text style={styles.fieldError} accessibilityLiveRegion="polite">{text}</Text>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    sheet: { backgroundColor: C.surface, paddingHorizontal: 22, paddingTop: 4 },
    inputBoxError: { borderWidth: 1.5, borderColor: V6Colors.dangerText },
    fieldErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    fieldError: { flex: 1, color: V6Colors.dangerText, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },
    iconWell: {
      width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.primaryTonal,
      alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    },
    iconWellSuccess: { backgroundColor: V6Colors.successSurface },
    title: { color: C.ink900, fontSize: 20, fontWeight: '800', fontFamily: 'Inter' },
    subtitle: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 19, marginTop: 4, marginBottom: 16 },
    label: { color: C.ink700, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter', marginTop: 14, marginBottom: 6 },
    inputBox: {
      backgroundColor: V6Colors.surface, borderRadius: 14, paddingHorizontal: 14, minHeight: 48,
      borderWidth: 1, borderColor: V6Colors.fieldBorder,
    },
    input: { fontFamily: 'Inter', fontSize: 15, color: C.ink900, paddingVertical: 10 },
    rules: { gap: 6, marginTop: 12, marginBottom: 12 },
    ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ruleText: { color: C.ink500, fontSize: 13, fontFamily: 'Inter' },
    ruleTextOk: { color: V6Colors.successText },
    error: { color: V6Colors.dangerText, fontSize: 13.5, fontFamily: 'Inter', marginBottom: 10 },
    primaryBtn: {
      backgroundColor: Colors.primary, borderRadius: 14, minHeight: 50,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, marginTop: 6,
    },
    primaryText: { color: Colors.onPrimary, fontSize: 15.5, fontWeight: '700', fontFamily: 'Inter' },
    // Readable disabled state: grey fill with dark text instead of a faded button.
    disabled: { backgroundColor: V6Colors.ink100 },
    disabledText: { color: V6Colors.ink700 },
    cancelBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 4 },
    cancelText: { color: Colors.link, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    successWrap: { alignItems: 'center' },
    fullWidth: { alignSelf: 'stretch' },
  });
  return { Colors, V6Colors, C, styles };
}
