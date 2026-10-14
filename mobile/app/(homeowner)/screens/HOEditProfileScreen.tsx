/**
 * HOEditProfileScreen.tsx
 *
 * Edit profile for the homeowner. Fields use the shared TextField. The address
 * keeps its suggestions and GPS (AddressField), scrolled above the keyboard when
 * it takes focus, and "Save changes" is the one pinned action. Leaving with
 * unsaved changes asks first, from the back arrow or Android back. Saving is
 * unchanged: the same confirmation, then the same updateProfile call.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../../../src/context/ThemeContext';
import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView from '../../../src/components/ui/KeyboardAwareScrollView';
import TextField from '../../../src/components/ui/TextField';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import { ArrowLeft, Save } from 'lucide-react-native';
import AvatarPicker from '../../../src/components/AvatarPicker';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import AddressField from '../../../src/components/AddressField';
import { Spacing } from '../../../src/constants/theme';

import { useAuth } from '../../../src/context/AuthContext';
import { api, type GeocodedAddress } from '../../../src/lib/api';
import { changedFields, leaveMessageFor } from '../../../src/lib/editProfileChanges';
import {
  ADDRESS_MAX,
  CITY_MAX,
  FULL_NAME_MAX,
  nextPhoneText,
  normalizeName,
  sanitizePhone,
  validateAddress,
  validateCity,
  validateFullName,
  validatePhone,
} from '../../../src/lib/inputRules';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useLeaveGuard } from '../../../src/hooks/useLeaveGuard';

interface HOEditProfileScreenProps {
  onBack: () => void;
  onSave: () => void;
}

export default function HOEditProfileScreen({ onBack, onSave }: HOEditProfileScreenProps) {
  const { C, styles, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { profile, refreshProfile } = useAuth();
  // What the screen loaded. Anything that differs from it is unsaved.
  const [loaded] = useState(() => ({
    name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    address: profile?.address ?? '',
    city: profile?.city ?? '',
    pickedAddress: false,
  }));
  const [name, setName] = useState(loaded.name);
  const [phone, setPhone] = useState(loaded.phone);
  const [location, setLocation] = useState(loaded.address);
  const [city, setCity] = useState(loaded.city);
  const [resolvedLocation, setResolvedLocation] = useState<GeocodedAddress | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const addressTop = useRef(0);
  const email = profile?.email ?? '';

  const changed = changedFields(loaded, {
    name,
    phone,
    address: location,
    city,
    pickedAddress: resolvedLocation !== null,
  });
  const { asking, requestLeave, keepEditing, leave } = useLeaveGuard(changed.length > 0, onBack);

  // A value the user did not change is not re-checked, so an older format cannot
  // block saving other fields. An empty name is always refused; an empty phone is
  // allowed, because the phone is optional.
  const nameError = (changed.includes('name') || !name.trim()) ? validateFullName(name) ?? undefined : undefined;
  const phoneChanged = changed.includes('phone');
  const phoneError = phoneChanged ? validatePhone(phone) ?? undefined : undefined;
  // The address and city are optional here, so only a value the user typed is checked.
  const addressError = changed.includes('address') ? validateAddress(location) ?? undefined : undefined;
  const cityError = changed.includes('city') ? validateCity(city) ?? undefined : undefined;

  // Moves the address to the top of the visible area as it takes focus, so the
  // suggestions it opens sit above the keyboard instead of under it.
  const keepAddressAboveKeyboard = () => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, addressTop.current - 12), animated: true });
    }, 120);
  };

  const requestSave = () => {
    setError(null);
    setSubmitted(true);
    if (nameError || phoneError || addressError || cityError) return;
    if (changed.length > 0) setShowSaveConfirmation(true);
    else onSave();
  };

  const performSave = async () => {
    setShowSaveConfirmation(false);
    setSaving(true);
    setError(null);
    try {
      await api.updateProfile({
        full_name: normalizeName(name),
        phone: phoneChanged ? sanitizePhone(phone) : phone.trim(),
        address: location.trim(),
        city: normalizeName(city),
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
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <Tap
          style={styles.backBtn}
          onPress={requestLeave}
          activeOpacity={0.8}
          hitSlop={5}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color={C.ink700} />
        </Tap>
        <Text style={styles.headerTitle} accessibilityRole="header">Edit profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <KeyboardAwareScrollView
          ref={scrollRef}
          keyboardDismissMode="on-drag"
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar — uploads on its own, independent of the Save button */}
          <AvatarPicker name={name} />

          <TextField
            label="Full name"
            value={name}
            onChangeText={setName}
            placeholder="Your full name"
            autoCapitalize="words"
            maxLength={FULL_NAME_MAX}
            keyboardAppearance={appearance}
            error={nameError}
            submitted={submitted}
          />

          <View style={styles.lockedGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.lockedBox}>
              <Text style={styles.lockedText}>{email}</Text>
            </View>
          </View>

          <TextField
            label="Phone (optional)"
            value={phone}
            onChangeText={(value) => setPhone((previous) => nextPhoneText(previous, value))}
            placeholder="09XX XXX XXXX"
            helper="11 digits, starts with 09"
            keyboardType="number-pad"
            keyboardAppearance={appearance}
            error={phoneError}
            submitted={submitted}
          />

          {/* The saved address is what job posts prefill and what the backend
              geocodes on save, so it gets the same suggestions + GPS the job
              form has rather than a bare text box. */}
          <View
            style={styles.addressGroup}
            onLayout={(e) => { addressTop.current = e.nativeEvent.layout.y; }}
          >
            <Text style={styles.label}>Address</Text>
            <AddressField
              value={location}
              onChangeText={(value) => { setLocation(value); setResolvedLocation(null); }}
              onResolve={(resolved) => { setResolvedLocation(resolved); if (resolved?.city) setCity(resolved.city); }}
              onFocus={keepAddressAboveKeyboard}
              onBlur={() => setAddressTouched(true)}
              placeholder="House no., Barangay, Street"
              maxLength={ADDRESS_MAX}
              hint="Used as the default for new jobs"
              error={addressTouched || submitted ? addressError : undefined}
              inputStyle={styles.addressInput}
            />
            {resolvedLocation === null && !(addressTouched || submitted ? addressError : undefined) && (
              <Text style={styles.addressHelper}>Include a house number and street. Pick a suggestion from the list.</Text>
            )}
          </View>

          <TextField
            label="City"
            value={city}
            onChangeText={(value) => { setCity(value); setResolvedLocation(null); }}
            placeholder="City / Municipality"
            autoCapitalize="words"
            maxLength={CITY_MAX}
            keyboardAppearance={appearance}
            error={cityError}
            submitted={submitted}
          />

          {!!error && <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text>}
        </KeyboardAwareScrollView>

        <BottomActionBar primaryLabel="Save changes" busy={saving} onPrimary={requestSave} />
      </KeyboardAvoidingView>

      <ConfirmationModal
        visible={showSaveConfirmation}
        title="Save profile changes?"
        message="Your updated profile details will be saved and shown in your account."
        confirmLabel="Save changes"
        onCancel={() => setShowSaveConfirmation(false)}
        onConfirm={performSave}
      />

      <ConfirmationModal
        visible={asking}
        icon={Save}
        title="Leave without saving?"
        message={leaveMessageFor(changed)}
        confirmLabel="Keep editing"
        cancelLabel="Discard changes"
        cancelTone="danger"
        onConfirm={keepEditing}
        onDismiss={keepEditing}
        onCancel={leave}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { V6Colors } = theme;
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
    headerSpacer: { width: 38 },

    body: { flex: 1 },
    bodyContent: { paddingHorizontal: Spacing.screenH, paddingTop: 20, paddingBottom: 24, gap: 16 },

    // Same label as the shared TextField, for the rows that are not a TextField.
    label: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', lineHeight: 18, color: C.ink700 },
    addressGroup: { gap: 6 },
    addressHelper: { fontFamily: 'Inter', fontSize: 13, fontWeight: '400', lineHeight: 18, color: C.ink500 },
    addressInput: {
      minHeight: 48, borderRadius: 14, borderColor: V6Colors.line, backgroundColor: C.surface,
      paddingHorizontal: 14, paddingTop: 13, paddingBottom: 13,
      fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: C.ink900,
    },
    lockedGroup: { gap: 6 },
    lockedBox: {
      borderRadius: 14, borderWidth: 1, borderColor: V6Colors.line, backgroundColor: V6Colors.wellBg,
      paddingHorizontal: 14, paddingVertical: 13,
    },
    lockedText: { fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: C.ink500 },

    errorText: { color: V6Colors.dangerText, fontSize: 15.5, fontFamily: 'Inter', textAlign: 'center' },
  });
  return { appearance: theme.appearance, Colors: theme.Colors, V6Colors, C, styles };
}
