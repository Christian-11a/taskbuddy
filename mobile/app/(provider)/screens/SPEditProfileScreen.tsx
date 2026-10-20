/**
 * SPEditProfileScreen.tsx
 *
 * Edit profile for the provider. Fields use the shared TextField. The address
 * keeps its suggestions and GPS (AddressField), scrolled above the keyboard when
 * it takes focus, and "Save changes" is the one pinned action. Leaving with
 * unsaved changes asks first, from the back arrow or Android back. Save is
 * disabled until something changes; a failed save scrolls to the first invalid
 * field. It calls the same updateProfile and upsertProviderProfile as before.
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
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Tap from '../../../src/components/ui/Tap';
import KeyboardAwareScrollView, { useRevealOnFocus } from '../../../src/components/ui/KeyboardAwareScrollView';
import TextField from '../../../src/components/ui/TextField';
import BottomActionBar from '../../../src/components/ui/BottomActionBar';
import { ArrowLeft, CircleAlert, Minus, Plus, Save } from 'lucide-react-native';
import AvatarPicker from '../../../src/components/AvatarPicker';
import ConfirmationModal from '../../../src/components/ConfirmationModal';
import AddressField from '../../../src/components/AddressField';
import { Spacing } from '../../../src/constants/theme';
import { useHeaderTop } from '../../../src/hooks/useHeaderTop';
import { useLeaveGuard } from '../../../src/hooks/useLeaveGuard';
import { useScrollToFirstError } from '../../../src/hooks/useScrollToFirstError';

import { useAuth } from '../../../src/context/AuthContext';
import { useAsyncData } from '../../../src/hooks/useAsyncData';
import { isList } from '../../../src/lib/savedShapes';
import { SEVEN_DAYS_MS } from '../../../src/lib/persistentCache';
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
import { BIO_MAX, cleanText, validateBio } from '../../../src/lib/textRules';

// Service radius bounds mirror the backend (SERVICE_RADIUS_MIN_KM / MAX_KM).
const RADIUS_MIN_KM = 1;
const RADIUS_MAX_KM = 50;
const RADIUS_DEFAULT_KM = 15;
const RADIUS_LONG_PRESS_STEP_KM = 5;
const RADIUS_MESSAGE = 'Choose 1 to 50 km';
// Top to bottom, the order the fields appear on screen.
const FIELD_ORDER = ['name', 'phone', 'address', 'city', 'bio', 'radius', 'service'] as const;

/** The whole km the text stands for, or null when it is empty or not a number. */
function radiusValue(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed));
}

function clampRadius(km: number): number {
  return Math.min(RADIUS_MAX_KM, Math.max(RADIUS_MIN_KM, km));
}

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
  const categories = useAsyncData(() => api.categories(), [], 'categories', {
    persist: true,
    maxAgeMs: SEVEN_DAYS_MS,
    validate: isList,
  });

  // What the screen loaded. Anything that differs from it is unsaved.
  const [loaded] = useState(() => ({
    name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    address: profile?.address ?? '',
    city: profile?.city ?? '',
    pickedAddress: false,
    bio: providerProfile?.bio ?? '',
    radius: String(providerProfile?.service_radius_km ?? RADIUS_DEFAULT_KM),
    service: providerProfile?.category_id ?? null,
  }));
  const [name, setName] = useState(loaded.name);
  const [phone, setPhone] = useState(loaded.phone);
  const [location, setLocation] = useState(loaded.address);
  const [city, setCity] = useState(loaded.city);
  const [resolvedLocation, setResolvedLocation] = useState<GeocodedAddress | null>(null);
  const [bio, setBio] = useState(loaded.bio);
  const [radius, setRadius] = useState(loaded.radius);
  // Set when the radius was typed out of range or empty and then clamped on blur.
  const [radiusNotice, setRadiusNotice] = useState(false);
  const radiusRef = useRef<TextInput | null>(null);
  const revealRadius = useRevealOnFocus(radiusRef);
  // A long press steps by 5; the release must not also step by 1.
  const radiusHeld = useRef(false);
  const [categoryId, setCategoryId] = useState<number | null>(loaded.service);
  const [submitted, setSubmitted] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { scrollRef, fieldLayout, inputRef, scrollToFirstError } = useScrollToFirstError(FIELD_ORDER);
  const setRadiusInput = inputRef('radius');
  const addressTop = useRef(0);
  const email = profile?.email ?? '';

  const changed = changedFields(loaded, {
    name,
    phone,
    address: location,
    city,
    pickedAddress: resolvedLocation !== null,
    bio,
    radius,
    service: categoryId,
  });
  const { asking, requestLeave, keepEditing, leave } = useLeaveGuard(changed.length > 0, onBack);

  // An older phone format the user did not touch is not re-checked, so it cannot
  // block saving other fields. A phone the user changed must be a 09 number (or empty).
  const phoneChanged = changed.includes('phone');
  const phoneError = phoneChanged ? validatePhone(phone) ?? undefined : undefined;

  // Same rules and messages as before. Each one now shows under its own field
  // once the user has tried to save (or has left the field). A name the user did
  // not change is only refused when it is empty (see the phone rule above).
  const nameError = (changed.includes('name') || !name.trim()) ? validateFullName(name) ?? undefined : undefined;
  // Recommendations match providers to jobs within their service radius of
  // this address; without one a provider is never invited to anything. The city
  // is optional, so it is only checked when it was typed.
  const addressError = (changed.includes('address') || !location.trim())
    ? validateAddress(location, {
      required: true,
      requiredMessage: 'Enter your address so nearby jobs can be matched to you.',
    }) ?? undefined
    : undefined;
  const cityError = changed.includes('city') ? validateCity(city) ?? undefined : undefined;
  // Whole km from 1 to 50. A stored radius left alone is not re-checked.
  const radiusNumber = radiusValue(radius);
  const radiusInvalid = radiusNumber === null || radiusNumber < RADIUS_MIN_KM || radiusNumber > RADIUS_MAX_KM;
  const radiusError = changed.includes('radius') && radiusInvalid ? RADIUS_MESSAGE : undefined;
  const radiusNow = radiusNumber ?? RADIUS_DEFAULT_KM;
  const radiusAtMin = radiusNow <= RADIUS_MIN_KM;
  const radiusAtMax = radiusNow >= RADIUS_MAX_KM;
  const showRadiusMessage = radiusNotice || (submitted && !!radiusError);

  // On blur: empty or not a number becomes the default; out of range is clamped.
  const commitRadius = () => {
    const typed = radiusValue(radius);
    if (typed === null || typed < RADIUS_MIN_KM || typed > RADIUS_MAX_KM) setRadiusNotice(true);
    setRadius(String(typed === null ? RADIUS_DEFAULT_KM : clampRadius(typed)));
  };

  const stepRadius = (delta: number) => {
    setRadius(String(clampRadius(radiusNow + delta)));
    setRadiusNotice(false);
  };

  const radiusStepProps = (delta: number) => ({
    onPressIn: () => { radiusHeld.current = false; },
    onPress: () => {
      if (radiusHeld.current) { radiusHeld.current = false; return; }
      stepRadius(delta);
    },
    onLongPress: () => {
      radiusHeld.current = true;
      setRadius(String(clampRadius(radiusNow + delta * RADIUS_LONG_PRESS_STEP_KM)));
      setRadiusNotice(false);
    },
  });
  const serviceError = categoryId ? undefined : 'Please select the service you offer.';
  // Whitespace-only counts as empty; the bio is sent cleaned, the same text it was checked as.
  const bioError = validateBio(bio) ?? undefined;

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
    const errors = {
      name: nameError, phone: phoneError, address: addressError, city: cityError,
      bio: bioError, radius: radiusError, service: serviceError,
    };
    if (Object.values(errors).some(Boolean)) {
      scrollToFirstError(errors);
      return;
    }
    performSave();
  };

  const performSave = async () => {
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
      await api.upsertProviderProfile({
        category_id: categoryId!,
        bio: cleanText(bio),
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

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

          <View onLayout={fieldLayout('name')}>
          <TextField
            ref={inputRef('name')}
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
          </View>

          <View style={styles.lockedGroup}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.lockedBox}>
              <Text style={styles.lockedText}>{email}</Text>
            </View>
          </View>

          <View onLayout={fieldLayout('phone')}>
          <TextField
            ref={inputRef('phone')}
            label="Phone (optional)"
            value={phone}
            onChangeText={(value) => setPhone((previous) => nextPhoneText(previous, value))}
            placeholder="09XX XXX XXXX"
            helper="Starts with 09 or +63"
            keyboardType="phone-pad"
            keyboardAppearance={appearance}
            error={phoneError}
            submitted={submitted}
          />
          </View>

          {/* The address a provider is matched from — same suggestions + GPS
              as the job form, so "nearby" means a place the geocoder knows. */}
          <View
            style={styles.addressGroup}
            onLayout={(e) => { addressTop.current = e.nativeEvent.layout.y; fieldLayout('address')(e); }}
          >
            <Text style={styles.label}>Address</Text>
            <AddressField
              ref={inputRef('address')}
              value={location}
              onChangeText={(value) => { setLocation(value); setResolvedLocation(null); }}
              onResolve={(resolved) => { setResolvedLocation(resolved); if (resolved?.city) setCity(resolved.city); }}
              onFocus={keepAddressAboveKeyboard}
              onBlur={() => setAddressTouched(true)}
              placeholder="House no., Barangay, Street"
              maxLength={ADDRESS_MAX}
              error={addressTouched || submitted ? addressError : undefined}
              inputStyle={styles.addressInput}
            />
            {resolvedLocation === null && !(addressTouched || submitted ? addressError : undefined) && (
              <Text style={styles.addressHelper}>Include a house number and street. Pick a suggestion from the list.</Text>
            )}
          </View>

          <View onLayout={fieldLayout('city')}>
          <TextField
            ref={inputRef('city')}
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
          </View>

          <View onLayout={fieldLayout('bio')}>
          <TextField
            ref={inputRef('bio')}
            label="Bio (min 20 characters)"
            value={bio}
            onChangeText={setBio}
            placeholder="Describe your experience..."
            multiline
            maxLength={BIO_MAX}
            counter={`${bio.length} / ${BIO_MAX}`}
            keyboardAppearance={appearance}
            error={bioError}
            submitted={submitted}
          />
          </View>

          <View style={styles.radiusGroup} onLayout={fieldLayout('radius')}>
            <Text style={styles.label}>Service radius (km)</Text>
            <View style={styles.radiusRow}>
              <Tap
                style={[styles.stepBtn, radiusAtMin && styles.stepBtnDisabled]}
                disabled={radiusAtMin}
                accessibilityRole="button"
                accessibilityLabel="Decrease radius"
                accessibilityState={{ disabled: radiusAtMin }}
                {...radiusStepProps(-1)}
              >
                <Minus size={18} color={C.ink900} />
              </Tap>
              <View style={[styles.radiusBox, showRadiusMessage && styles.radiusBoxError]}>
                <TextInput
                  ref={(node) => { radiusRef.current = node; setRadiusInput?.(node); }}
                  value={radius}
                  onChangeText={(value) => { setRadius(value); setRadiusNotice(false); }}
                  onFocus={revealRadius}
                  onBlur={commitRadius}
                  placeholder={String(RADIUS_DEFAULT_KM)}
                  placeholderTextColor={C.ink500}
                  keyboardType="number-pad"
                  keyboardAppearance={appearance}
                  maxLength={3}
                  accessibilityLabel="Service radius (km)"
                  style={styles.radiusInput}
                />
                <Text style={styles.radiusUnit}>km</Text>
              </View>
              <Tap
                style={[styles.stepBtn, radiusAtMax && styles.stepBtnDisabled]}
                disabled={radiusAtMax}
                accessibilityRole="button"
                accessibilityLabel="Increase radius"
                accessibilityState={{ disabled: radiusAtMax }}
                {...radiusStepProps(1)}
              >
                <Plus size={18} color={C.ink900} />
              </Tap>
            </View>
            {showRadiusMessage ? (
              <View style={styles.helperRow}>
                <CircleAlert size={14} color={C.dangerText} />
                <Text style={styles.errorHelper} accessibilityLiveRegion="polite">{RADIUS_MESSAGE}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.serviceGroup} onLayout={fieldLayout('service')}>
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

        </KeyboardAwareScrollView>

        {!!error && (
          <View style={styles.statusStrip}>
            <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text>
          </View>
        )}
        {!error && changed.length === 0 && (
          <View style={styles.statusStrip}>
            <Text style={styles.noChangesHint}>No changes yet</Text>
          </View>
        )}
        <BottomActionBar primaryLabel="Save changes" busy={saving} primaryDisabled={changed.length === 0} onPrimary={requestSave} />
      </KeyboardAvoidingView>

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

    radiusGroup: { gap: 6 },
    radiusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepBtn: {
      width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: V6Colors.line,
      backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center',
    },
    stepBtnDisabled: { opacity: 0.4 },
    radiusBox: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      minHeight: 48, paddingHorizontal: 14, paddingVertical: 13, borderRadius: 14,
      borderWidth: 1, borderColor: V6Colors.line, backgroundColor: C.surface,
    },
    radiusBoxError: { borderWidth: 1.5, borderColor: V6Colors.dangerText },
    radiusInput: {
      minWidth: 48, paddingVertical: 0, textAlign: 'center',
      fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: C.ink900,
    },
    radiusUnit: { fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: C.ink500 },

    statusStrip: { paddingHorizontal: Spacing.screenH, paddingTop: 8, backgroundColor: C.surface },
    noChangesHint: { color: C.ink500, fontSize: 13, lineHeight: 18, fontFamily: 'Inter', textAlign: 'center' },
    errorText: { color: V6Colors.dangerText, fontSize: 15.5, fontFamily: 'Inter', textAlign: 'center' },
  });
  return { appearance: theme.appearance, Colors: theme.Colors, V6Colors, C, styles };
}
