/**
 * SPEditProfileScreen.tsx
 *
 * Edit profile for the provider. Fields use the shared TextField. The address
 * keeps its suggestions and GPS (AddressField), scrolled above the keyboard when
 * it takes focus, and "Save changes" is the one pinned action. Saving is
 * unchanged: the same confirmation, then the same updateProfile and
 * upsertProviderProfile calls.
 *
 * Deviation: the mockup's "Hourly rate" and "Portfolio" fields have no
 * backing columns in the real backend (ProviderProfile has no hourly_rate
 * or portfolio_urls), so they're left out rather than fabricated. "Service
 * radius" IS a real field (service_radius_km) — kept as a real numeric km
 * input instead of the mockup's free-text demo string.
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
import TextField from '../../../src/components/ui/TextField';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import { ArrowLeft, CircleAlert } from 'lucide-react-native';
import AvatarPicker from '../../../src/components/AvatarPicker';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import AddressField from '../../../src/components/AddressField';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';

import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { api, type GeocodedAddress } from '../../../src/lib/api';

interface SPEditProfileScreenProps {
  onBack: () => void;
  onSave: () => void;
  /** Opens My Services, where a service change is requested from the admins. */
  onManageServices: () => void;
}

export default function SPEditProfileScreen({ onBack, onSave, onManageServices }: SPEditProfileScreenProps) {
  const { C, styles, appearance } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const { profile, providerProfile, refreshProfile } = useAuth();
  const categories = useAsyncData(() => api.categories(), []);

  const [name, setName] = useState(profile?.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [location, setLocation] = useState(profile?.address ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [resolvedLocation, setResolvedLocation] = useState<GeocodedAddress | null>(null);
  const [bio, setBio] = useState(providerProfile?.bio ?? '');
  const [radius, setRadius] = useState(String(providerProfile?.service_radius_km ?? ''));
  const [categoryId, setCategoryId] = useState<number | null>(providerProfile?.category_id ?? null);
  const [submitted, setSubmitted] = useState(false);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const addressTop = useRef(0);
  const email = profile?.email ?? '';

  // Same rules and messages as before. Each one now shows under its own field
  // once the user has tried to save (or has left the field).
  const nameError = name.trim() ? undefined : 'Full name cannot be empty.';
  // Recommendations match providers to jobs within their service radius of
  // this address; without one a provider is never invited to anything.
  const addressError = location.trim() ? undefined : 'Enter your address so nearby jobs can be matched to you.';
  const serviceError = categoryId ? undefined : 'Please select the service you offer.';
  const bioError = bio.trim().length < 20 ? 'Bio must be at least 20 characters.' : undefined;

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
    if (nameError || addressError || serviceError || bioError) return;
    setShowSaveConfirmation(true);
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
      await api.upsertProviderProfile({
        category_id: categoryId!,
        bio: bio.trim(),
        years_experience: providerProfile?.years_experience,
        service_radius_km: radius.trim() ? Number(radius) : providerProfile?.service_radius_km,
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
          onPress={onBack}
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

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
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
            keyboardAppearance={appearance}
            error={nameError}
            submitted={submitted}
          />

          <View style={styles.lockedGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.lockedBox}>
              <Text style={styles.lockedText} numberOfLines={1}>{email}</Text>
            </View>
          </View>

          <TextField
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            placeholder="09XX XXX XXXX"
            helper="Lets the client call you about the job"
            keyboardType="phone-pad"
            keyboardAppearance={appearance}
          />

          {/* The address a provider is matched from — same suggestions + GPS
              as the job form, so "nearby" means a place the geocoder knows. */}
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
              placeholder="House no., Barangay, Street"
              error={submitted ? addressError : undefined}
              inputStyle={styles.addressInput}
            />
          </View>

          <TextField
            label="City"
            value={city}
            onChangeText={(value) => { setCity(value); setResolvedLocation(null); }}
            placeholder="City / Municipality"
            autoCapitalize="words"
            keyboardAppearance={appearance}
          />

          <TextField
            label="Bio (min 20 characters)"
            value={bio}
            onChangeText={setBio}
            placeholder="Describe your experience..."
            multiline
            keyboardAppearance={appearance}
            error={bioError}
            submitted={submitted}
          />

          <TextField
            label="Service radius (km)"
            value={radius}
            onChangeText={setRadius}
            placeholder="8"
            keyboardType="number-pad"
            keyboardAppearance={appearance}
          />

          <View style={styles.serviceGroup}>
            <Text style={styles.label}>Service offered</Text>
            {/* Once set, a service only changes through an admin-approved
                request (My Services); the first one is still picked here. */}
            {providerProfile?.category_id ? (
              <View style={styles.serviceLocked}>
                <Text style={styles.serviceLockedName}>
                  {providerProfile.service_categories?.name ??
                    (categories.data ?? []).find((c) => c.id === providerProfile.category_id)?.name ??
                    '—'}
                </Text>
                <Tap onPress={onManageServices} activeOpacity={0.8} testID="btn-manage-services">
                  <Text style={styles.serviceLockedLink}>Request a change</Text>
                </Tap>
              </View>
            ) : (
              <View style={styles.chipGrid}>
                {(categories.data ?? []).map((cat) => {
                  const active = categoryId === cat.id;
                  return (
                    <Tap
                      key={cat.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setCategoryId(cat.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat.name}</Text>
                    </Tap>
                  );
                })}
              </View>
            )}
            {submitted && serviceError ? (
              <View style={styles.helperRow}>
                <CircleAlert size={14} color={C.dangerText} />
                <Text style={styles.errorHelper} accessibilityLiveRegion="polite">{serviceError}</Text>
              </View>
            ) : null}
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>

        <BottomActionBar primaryLabel="Save changes" busy={saving} onPrimary={requestSave} />
      </KeyboardAvoidingView>

      <ConfirmationModal
        visible={showSaveConfirmation}
        title="Save profile changes?"
        message="Your updated professional details and services will be saved to your profile."
        confirmLabel="Save changes"
        onCancel={() => setShowSaveConfirmation(false)}
        onConfirm={performSave}
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

    serviceGroup: { gap: 6 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    serviceLocked: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      borderWidth: 1, borderColor: V6Colors.fieldBorder, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: V6Colors.wellBg,
    },
    serviceLockedName: { flex: 1, color: C.ink900, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
    serviceLockedLink: { color: V6Colors.link, fontSize: 13.5, fontWeight: '700', fontFamily: 'Inter' },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: V6Colors.fieldBorder, backgroundColor: C.surface },
    chipActive: { backgroundColor: V6Colors.hero, borderColor: C.ink900 },
    chipText: { color: C.ink500, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
    chipTextActive: { color: C.onPrimary },
    helperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    errorHelper: { flex: 1, color: V6Colors.dangerText, fontSize: 13, lineHeight: 18, fontFamily: 'Inter' },

    errorText: { color: V6Colors.dangerText, fontSize: 15.5, fontFamily: 'Inter', textAlign: 'center' },
  });
  return { appearance: theme.appearance, Colors: theme.Colors, V6Colors, C, styles };
}
