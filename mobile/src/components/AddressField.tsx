/**
 * AddressField.tsx — the app's one way to enter an address.
 *
 * Two routes to the same answer, because neither alone covers a real user:
 *
 *   • "Use my current location" asks for the location permission, takes a GPS
 *     fix and reverse-geocodes it on the backend. One tap for the common case
 *     of a job at the house you are standing in.
 *   • Typing offers suggestions from the backend's Geoapify proxy, debounced so
 *     a burst of keystrokes costs one lookup rather than one per character.
 *
 * Picking a suggestion (or the GPS fix) hands the caller coordinates the
 * backend already resolved, so the job form has nothing left to verify. Typing
 * an address *without* picking one is still allowed — the dropdown can be
 * empty for a perfectly good address — and the caller geocodes that text the
 * way it always did. `onResolve(null)` fires whenever the text stops matching
 * what was resolved, so a stale pin can never outlive the address it belonged
 * to.
 *
 * The permission and location failure modes are deliberately quiet: the field
 * says what happened in its hint line and the user keeps typing. Nothing here
 * blocks the form.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { LocateFixed, MapPin } from 'lucide-react-native';

import { requestAppPermission } from '../lib/permissions';
import { api, type AddressSuggestion, type GeocodedAddress } from '../lib/api';

/**
 * Long enough that a steady typist spends one lookup on a street name rather
 * than one per keystroke, short enough that the list appears while the finger
 * is still moving to the next key.
 */
const DEBOUNCE_MS = 400;

/** Matches the backend's floor — below this it answers an empty list anyway. */
const MIN_QUERY_LENGTH = 3;

/**
 * A GPS fix good enough to name a street. `High` would wait for satellites the
 * user does not need: the address is reverse-geocoded, not navigated to.
 */
const FIX_ACCURACY = Location.Accuracy.Balanced;

interface Props {
  value: string;
  onChangeText: (value: string) => void;
  /**
   * Coordinates for the address now in the field, or null when the text no
   * longer matches a resolved address and needs geocoding by the caller.
   */
  onResolve: (resolved: GeocodedAddress | null) => void;
  placeholder?: string;
  /** Caller-owned validation message, shown under the field. */
  error?: string;
  /** Extra hint under the field (e.g. "Verifying address…"). */
  hint?: string;
  inputStyle?: object;
  actionVariant?: 'default' | 'primary';
  testID?: string;
}

export default function AddressField({
  value,
  onChangeText,
  onResolve,
  placeholder = 'Brgy. Sampaguita, Lipa City',
  error,
  hint,
  inputStyle,
  actionVariant = 'default',
  testID,
}: Props) {
  const { Colors, styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  // The text a suggestion or GPS fix produced. While the field still holds it,
  // there is nothing to look up — and no dropdown to reopen on the next render.
  const resolvedTextRef = useRef<string | null>(null);
  // Guards against an earlier, slower lookup overwriting a later one's rows.
  const queryIdRef = useRef(0);

  useEffect(() => {
    const query = value.trim();

    if (query === resolvedTextRef.current) return;
    if (query.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      setSearching(false);
      return;
    }

    const id = ++queryIdRef.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const rows = await api.addressSuggestions(query);
          if (id !== queryIdRef.current) return;
          setSuggestions(rows);
          setOpen(rows.length > 0);
        } catch {
          // Suggestions are an assist, never a gate: the typed address still
          // gets geocoded when the user moves on.
          if (id !== queryIdRef.current) return;
          setSuggestions([]);
          setOpen(false);
        } finally {
          if (id === queryIdRef.current) setSearching(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  const handleChangeText = useCallback(
    (next: string) => {
      ++queryIdRef.current;
      setNotice(null);
      // Editing resolved text invalidates the pin that came with it.
      if (resolvedTextRef.current !== null && next.trim() !== resolvedTextRef.current) {
        resolvedTextRef.current = null;
        onResolve(null);
      }
      onChangeText(next);
    },
    [onChangeText, onResolve],
  );

  const pick = useCallback(
    (suggestion: AddressSuggestion) => {
      ++queryIdRef.current;
      setSearching(false);
      onChangeText(suggestion.formatted_address);
      setSuggestions([]);
      setOpen(false);
      setNotice(null);

      if (suggestion.precise) {
        resolvedTextRef.current = suggestion.formatted_address.trim();
        onResolve(suggestion);
        return;
      }

      // A city or barangay: a good start, not somewhere a provider can be sent.
      resolvedTextRef.current = null;
      onResolve(null);
      setNotice('Add the house number and street to this address.');
    },
    [onChangeText, onResolve],
  );

  const useCurrentLocation = useCallback(async () => {
    const request = ++queryIdRef.current;
    setSearching(false);
    setSuggestions([]);
    setOpen(false);
    setNotice(null);
    setLocating(true);
    try {
      // Shows the OS prompt the first time, and offers Settings once the user
      // has denied it for good.
      const allowed = await requestAppPermission('location');
      if (request !== queryIdRef.current) return;
      if (!allowed) {
        setNotice('Location access is off — type the address instead.');
        return;
      }

      const fix = await Location.getCurrentPositionAsync({
        accuracy: FIX_ACCURACY,
      });
      if (request !== queryIdRef.current) return;
      const address = await api.reverseGeocode(
        fix.coords.latitude,
        fix.coords.longitude,
      );

      if (request !== queryIdRef.current) return;
      onChangeText(address.formatted_address);
      resolvedTextRef.current = address.formatted_address.trim();
      onResolve(address);
      setSuggestions([]);
      setOpen(false);
    } catch (e) {
      if (request !== queryIdRef.current) return;
      // A fix can fail indoors, and the backend answers 400 where GPS lands on
      // nothing addressable. Both leave the user typing, so both say so here.
      setNotice(
        e instanceof Error && e.message
          ? e.message
          : "We couldn't read your location — type the address instead.",
      );
    } finally {
      setLocating(false);
    }
  }, [onChangeText, onResolve]);

  return (
    <View>
      <TextInput keyboardAppearance={appearance}
        testID={testID}
        style={[
          styles.input,
          inputStyle,
          focused && styles.inputFocused,
          !!error && styles.inputError,
        ]}
        placeholder={placeholder}
        placeholderTextColor={Colors.muted}
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => {
          setFocused(true);
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        multiline
      />

      <TouchableOpacity
        style={[styles.locateBtn, actionVariant === 'primary' && styles.locateBtnPrimary]}
        onPress={() => void useCurrentLocation()}
        disabled={locating}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Use my current location"
        testID="address-use-current-location"
      >
        {locating ? (
          <ActivityIndicator
            size="small"
            color={actionVariant === 'primary' ? Colors.white : Colors.brandTeal}
          />
        ) : (
          <LocateFixed size={18} color={actionVariant === 'primary' ? Colors.white : Colors.brandTeal} />
        )}
        <Text style={[styles.locateText, actionVariant === 'primary' && styles.locateTextPrimary]}>
          {locating ? 'Finding your address…' : 'Use my current location'}
        </Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.dropdown} testID="address-suggestions">
          {suggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={`${suggestion.latitude},${suggestion.longitude},${index}`}
              style={[styles.row, index > 0 && styles.rowDivider]}
              onPress={() => pick(suggestion)}
              activeOpacity={0.7}
            >
              <MapPin
                size={16}
                color={suggestion.precise ? Colors.brandTeal : Colors.muted}
              />
              <Text style={styles.rowText} numberOfLines={2}>
                {suggestion.formatted_address}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {searching && !open && <Text style={styles.hint}>Looking up addresses…</Text>}
      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      {!!hint && !notice && <Text style={styles.hint}>{hint}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    input: {
      backgroundColor: Colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingTop: 12,
      minHeight: 70,
      borderWidth: 1,
      borderColor: V6Colors.fieldBorder,
      fontFamily: 'Inter',
      fontSize: 16.5,
      color: V6Colors.ink900,
      textAlignVertical: 'top',
    },
    inputFocused: { borderColor: Colors.brandTeal, borderWidth: 2 },
    inputError: { borderColor: Colors.error, borderWidth: 2 },

    locateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
    },
    locateBtnPrimary: {
      justifyContent: 'center',
      backgroundColor: Colors.brandTeal,
      borderRadius: 13,
      paddingVertical: 14,
      marginTop: 10,
    },
    locateText: {
      color: V6Colors.link,
      fontFamily: 'Inter',
      fontSize: 15,
      fontWeight: '600',
    },
    locateTextPrimary: { color: Colors.onPrimary, fontWeight: '700' },

    dropdown: {
      backgroundColor: Colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: Colors.divider,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: Colors.mutedLight },
    rowText: { flex: 1, color: V6Colors.ink900, fontFamily: 'Inter', fontSize: 15 },

    hint: { color: Colors.slate, fontSize: 13.5, marginTop: 8, fontFamily: 'Inter' },
    notice: { color: Colors.warning, fontSize: 13.5, marginTop: 8, fontFamily: 'Inter' },
    error: { color: Colors.error, fontSize: 15.5, marginTop: 8, fontFamily: 'Inter' },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
