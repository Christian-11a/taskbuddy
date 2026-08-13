/**
 * HOEditProfileScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-edit-profile screen — a
 * flat white .topbar (not a colored hero), a circular avatar with a plain
 * "Change Photo" text link (not a pill button), and a flat flowing list of
 * .field inputs (no card grouping) ending in one full-width Save button.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import { Sizes, Spacing, V6Colors, V6Radii, V6Shadows } from '../../../src/constants/theme';

const C = V6Colors;
import { useAuth } from '../../../src/context/AuthContext';
import { api } from '../../../src/lib/api';
import { initials } from '../../../src/lib/format';

interface HOEditProfileScreenProps {
  onBack: () => void;
  onSave: () => void;
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  editable?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[
          styles.fieldInput,
          multiline && styles.fieldInputMultiline,
          focused && styles.fieldInputFocused,
          !editable && styles.fieldInputDisabled,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.ink400}
        multiline={multiline}
        keyboardType={keyboardType}
        editable={editable}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

export default function HOEditProfileScreen({ onBack, onSave }: HOEditProfileScreenProps) {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [location, setLocation] = useState(profile?.address ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = profile?.email ?? '';

  const hasChanges =
    name !== (profile?.full_name ?? '') ||
    phone !== (profile?.phone ?? '') ||
    location !== (profile?.address ?? '') ||
    city !== (profile?.city ?? '');

  const requestSave = () => {
    setError(null);
    if (!name.trim()) {
      setError('Full name cannot be empty.');
      return;
    }
    if (hasChanges) setShowSaveConfirmation(true);
    else onSave();
  };

  const performSave = async () => {
    setShowSaveConfirmation(false);
    setSaving(true);
    setError(null);
    try {
      await api.updateProfile({
        full_name: name.trim(),
        phone: phone.trim(),
        address: location.trim(),
        city: city.trim(),
      });
      await refreshProfile();
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header — matches .topbar (flat white, not a colored hero) */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.8}>
          <ArrowLeft size={20} color={C.ink700} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 38 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{initials(name)}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.changePhotoLink}>Change Photo</Text>
            </TouchableOpacity>
          </View>

          <FormField label="Full name" value={name} onChangeText={setName} placeholder="Your full name" />
          <FormField label="Email" value={email} placeholder="email@example.com" keyboardType="email-address" editable={false} />
          <FormField label="Phone" value={phone} onChangeText={setPhone} placeholder="+63 9XX XXX XXXX" keyboardType="phone-pad" />
          <FormField label="Address" value={location} onChangeText={setLocation} placeholder="House no., Barangay, Street" />
          <FormField label="City" value={city} onChangeText={setCity} placeholder="City / Municipality" />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={requestSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
          </TouchableOpacity>

          <View style={{ height: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmationModal
        visible={showSaveConfirmation}
        title="Save profile changes?"
        message="Your updated profile details will be saved and shown in your account."
        confirmLabel="Save Changes"
        onCancel={() => setShowSaveConfirmation(false)}
        onConfirm={performSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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

  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatarCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: C.cyan600, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  avatarText: { color: C.white, fontSize: 26, fontWeight: '800', fontFamily: 'Inter' },
  changePhotoLink: { fontSize: 14, color: C.cyan700, fontWeight: '700', fontFamily: 'Inter' },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 20 },

  fieldGroup: { marginBottom: 16 },
  fieldLabel: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 6 },
  fieldInput: {
    backgroundColor: C.white, borderRadius: 12, paddingHorizontal: 14, minHeight: 46,
    borderWidth: 1, borderColor: '#dce3e9',
    fontFamily: 'Inter', fontSize: 16.5, color: C.ink900,
  },
  fieldInputMultiline: { height: 90, textAlignVertical: 'top', paddingTop: 12 },
  fieldInputFocused: { borderColor: C.cyan500 },
  fieldInputDisabled: { color: C.ink400, backgroundColor: C.ink50 },

  errorText: { color: '#ef4444', fontSize: 15.5, fontFamily: 'Inter', marginBottom: 12, textAlign: 'center' },

  saveBtn: {
    backgroundColor: C.cyan700, borderRadius: V6Radii.btn, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
    ...V6Shadows.primaryButton,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: C.white, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
});
