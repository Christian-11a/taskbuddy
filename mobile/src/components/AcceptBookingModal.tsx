import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import { MapPin } from 'lucide-react-native';
import { V6Radii } from '../constants/theme';
import { api, type GeocodedAddress } from '../lib/api';
import AddressField from './AddressField';

export interface AcceptLocation {
  address: string;
  latitude: number;
  longitude: number;
}

interface AcceptBookingModalProps {
  visible: boolean;
  jobTitle?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (location: AcceptLocation) => void;
  onCancel: () => void;
}

/**
 * Accepting a booking asks where the provider is right now. Their profile
 * address is where they're based, not necessarily where they'll set out
 * from today, and the client should see a real distance.
 *
 * Starts empty rather than pre-filled with the profile address (QA #12):
 * pre-filling defeated the point of asking, since tapping Accept without
 * editing sent the home address right back.
 */
export default function AcceptBookingModal({
  visible, jobTitle, busy = false, error, onConfirm, onCancel,
}: AcceptBookingModalProps) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const [address, setAddress] = useState('');
  const [resolved, setResolved] = useState<GeocodedAddress | null>(null);
  const [checking, setChecking] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setAddress('');
      setResolved(null);
      setLocalError(null);
    }
  }, [visible]);

  const confirm = async () => {
    const text = address.trim();
    if (!text) {
      setLocalError('Enter where you are, or use your current location.');
      return;
    }
    Keyboard.dismiss();
    setLocalError(null);
    let point: { latitude: number; longitude: number } | null = resolved;
    if (!point) {
      setChecking(true);
      try {
        point = await api.geocodeAddress(text);
      } catch {
        point = null;
      } finally {
        setChecking(false);
      }
    }
    if (!point) {
      setLocalError("We couldn't find that address. Pick a suggestion or use your current location.");
      return;
    }
    onConfirm({ address: resolved?.formatted_address || text, latitude: point.latitude, longitude: point.longitude });
  };

  const working = busy || checking;
  const shownError = localError ?? error ?? null;

  return (
    <SheetFrame visible={visible} onClose={working ? undefined : onCancel} contentStyle={styles.dialog}>
            <View style={styles.iconWell}>
              <MapPin size={22} color={V6Colors.link} />
            </View>
            <Text style={styles.title} accessibilityRole="header">Confirm your location</Text>
            <Text style={styles.body}>
              {jobTitle ? `Before accepting "${jobTitle}", tell` : 'Tell'} the client where you're
              starting from so they can see how far away you are.
            </Text>

            <AddressField
              value={address}
              onChangeText={(v) => {
                setAddress(v);
                setLocalError(null);
              }}
              onResolve={setResolved}
              placeholder="Where are you now?"
              testID="accept-location-input"
            />

            {!!shownError && <Text style={styles.error} accessibilityRole="alert">{shownError}</Text>}

            <View style={styles.actions}>
              <Tap style={styles.secondaryBtn} onPress={onCancel} disabled={working} activeOpacity={0.8} accessibilityRole="button">
                <Text style={styles.secondaryText}>Cancel</Text>
              </Tap>
              <Tap
                style={[styles.primaryBtn, working && styles.disabled]}
                onPress={() => void confirm()}
                disabled={working}
                activeOpacity={0.85}
                accessibilityRole="button"
                testID="accept-location-confirm"
              >
                {working ? <ActivityIndicator color={C.onPrimary} /> : <Text style={styles.primaryText}>Accept booking</Text>}
              </Tap>
            </View>
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
    iconWell: { width: 44, height: 44, borderRadius: 13, backgroundColor: C.cyan50, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    title: { color: C.ink900, fontSize: 19, fontWeight: '800', fontFamily: 'Inter' },
    body: { color: C.ink500, fontSize: 14, fontFamily: 'Inter', lineHeight: 19, marginTop: 4, marginBottom: 14 },
    error: { color: V6Colors.dangerText, fontSize: 13.5, fontFamily: 'Inter', marginTop: 8 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    secondaryBtn: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: V6Colors.fieldBorder, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: C.ink500, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    primaryBtn: { flex: 1, minHeight: 44, backgroundColor: C.cyan700, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: C.onPrimary, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter' },
    disabled: { opacity: 0.6 },
  });
  return { Colors, V6Colors, C, styles };
}
