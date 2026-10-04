/**
 * HOEditProfileScreen.tsx
 *
 * v6 design: matches taskbuddy_UI_update.html's #ho-edit-profile screen — a
 * flat white .topbar (not a colored hero), a circular avatar with a plain
 * "Change Photo" text link (not a pill button), and a flat flowing list of
 * .field inputs (no card grouping) ending in one full-width Save button.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
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
import AvatarPicker from '../../../src/components/AvatarPicker';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import AddressField from '../../../src/components/AddressField';
import { Spacing, V6Radii, V6Shadows } from '../../../src/constants/theme';

import { useAuth } from '../../../src/context/AuthContext';
import { api, type GeocodedAddress } from '../../../src/lib/api';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

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
  required = false,
}: {
  label: string;
  /** Shows a red asterisk. Only on fields the Save button actually checks. */
  required?: boolean;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  editable?: boolean;
}) {
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.requiredAsterisk}> *</Text>}
      </Text>
      <TextInput keyboardAppearance={appearance}
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
  const { C, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [location, setLocation] = useState(profile?.address ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [resolvedLocation, setResolvedLocation] = useState<GeocodedAddress | null>(null);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = profile?.email ?? '';

  const hasChanges =
    name !== (profile?.full_name ?? '') ||
    phone !== (profile?.phone ?? '') ||
    location !== (profile?.address ?? '') ||
    city !== (profile?.city ?? '') || resolvedLocation !== null;

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
        location_reference: resolvedLocation?.location_reference,
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
      <View style={[styles.header, { paddingTop: headerTop }]}>
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
        <ScrollView keyboardDismissMode="on-drag"
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar — uploads on its own, independent of the Save button */}
          <AvatarPicker name={name} />

          <FormField required label="Full name" value={name} onChangeText={setName} placeholder="Your full name" />
          <FormField label="Email" value={email} placeholder="email@example.com" keyboardType="email-address" editable={false} />
          <FormField label="Phone" value={phone} onChangeText={setPhone} placeholder="+63 9XX XXX XXXX" keyboardType="phone-pad" />
          {/* The saved address is what job posts prefill and what the backend
              geocodes on save, so it gets the same suggestions + GPS the job
              form has rather than a bare text box. */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Address</Text>
            <AddressField
              value={location}
              onChangeText={(value) => { setLocation(value); setResolvedLocation(null); }}
              onResolve={(resolved) => { setResolvedLocation(resolved); if (resolved?.city) setCity(resolved.city); }}
              placeholder="House no., Barangay, Street"
            />
          </View>
          <FormField label="City" value={city} onChangeText={(value) => { setCity(value); setResolvedLocation(null); }} placeholder="City / Municipality" />

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

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    flex: { flex: 1 },
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

    fieldGroup: { marginBottom: 16 },
    fieldLabel: { color: C.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter', marginBottom: 6 },
    requiredAsterisk: { color: V6Colors.dangerText, fontWeight: '700' },
    fieldInput: {
      backgroundColor: C.surface, borderRadius: 12, paddingHorizontal: 14, minHeight: 46,
      borderWidth: 1, borderColor: V6Colors.fieldBorder,
      fontFamily: 'Inter', fontSize: 16.5, color: C.ink900,
    },
    fieldInputMultiline: { height: 90, textAlignVertical: 'top', paddingTop: 12 },
    fieldInputFocused: { borderColor: C.cyan500 },
    fieldInputDisabled: { color: C.ink400, backgroundColor: C.ink50 },

    errorText: { color: V6Colors.dangerText, fontSize: 15.5, fontFamily: 'Inter', marginBottom: 12, textAlign: 'center' },

    saveBtn: {
      backgroundColor: C.cyan700, borderRadius: V6Radii.btn, paddingVertical: 14,
      alignItems: 'center', marginTop: 4,
      ...V6Shadows.primaryButton,
    },
    saveBtnDisabled: { opacity: 0.7 },
    saveBtnText: { color: C.onPrimary, fontSize: 16.5, fontWeight: '700', fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, C, styles };
}
