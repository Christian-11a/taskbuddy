/**
 * AvatarPicker.tsx — the profile photo, and the "Change photo" link under it.
 *
 * Both Edit Profile screens had this markup inline with a dead TouchableOpacity;
 * the upload is identical for either role, so it lives here once.
 *
 * "Change photo" opens a sheet with Take a photo and Choose from gallery. Both
 * options run the same three steps as job photos: ask the API for a signed URL,
 * PUT the bytes straight to Supabase Storage, then send the resulting object
 * *path* to PATCH /profiles/me. The API turns that path into a public URL and
 * rejects paths belonging to another profile, so `profile.avatar_url` comes
 * back as a ready-to-render https URL, not a path.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Tap from './ui/Tap';
import Silhouette from './ui/Silhouette';
import SheetFrame from './ui/SheetFrame';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as GalleryIcon } from 'lucide-react-native';

import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { requestAppPermission } from '../lib/permissions';

type PhotoSource = 'camera' | 'gallery';

export default function AvatarPicker({ name }: { name: string }) {
  const { C, styles, V6Colors } = useThemedStyles(createThemedStyles);
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarUrl = profile?.avatar_url ?? null;

  // The camera and the gallery differ only in where the picture comes from.
  const choosePhoto = async (source: PhotoSource) => {
    setSheetOpen(false);
    setError(null);
    setBusy(true);
    try {
      if (!(await requestAppPermission(source))) return;
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        // Avatars render in a circle everywhere, so crop to square up front
        // rather than letting a portrait shot get centre-cropped at each size.
        aspect: [1, 1],
        quality: 0.8,
      };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;

      const path = await api.uploadImage('avatars', result.assets[0].uri);
      await api.updateProfile({ avatar_url: path });
      // The new URL reaches every screen through AuthContext's profile.
      await refreshProfile();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.avatarSection}>
      <View style={styles.avatarCircle}>
        {busy ? (
          <ActivityIndicator color={C.onPrimary} />
        ) : avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Silhouette name={name} textStyle={styles.avatarText} />
        )}
      </View>
      <Tap
        style={styles.changePhotoBtn}
        activeOpacity={0.7}
        onPress={() => setSheetOpen(true)}
        disabled={busy}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Change photo"
      >
        {!busy && <Camera size={14} color={V6Colors.link} />}
        <Text style={styles.changePhotoLink}>
          {busy ? 'Uploading…' : 'Change photo'}
        </Text>
      </Tap>
      {!!error && <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text>}

      <SheetFrame visible={sheetOpen} onClose={() => setSheetOpen(false)} contentStyle={styles.sheet}>
        <Text style={styles.sheetTitle} accessibilityRole="header">Profile photo</Text>
        <Tap
          style={styles.sheetRow}
          onPress={() => void choosePhoto('camera')}
          accessibilityRole="button"
          accessibilityLabel="Take a photo"
        >
          <View style={styles.sheetIcon}>
            <Camera size={18} color={V6Colors.link} />
          </View>
          <Text style={styles.sheetLabel}>Take a photo</Text>
        </Tap>
        <Tap
          style={styles.sheetRow}
          onPress={() => void choosePhoto('gallery')}
          accessibilityRole="button"
          accessibilityLabel="Choose from gallery"
        >
          <View style={styles.sheetIcon}>
            <GalleryIcon size={18} color={V6Colors.link} />
          </View>
          <Text style={styles.sheetLabel}>Choose from gallery</Text>
        </Tap>
        <Tap
          style={styles.sheetCancel}
          onPress={() => setSheetOpen(false)}
          hitSlop={{ top: 7, bottom: 7, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.sheetCancelText}>Cancel</Text>
        </Tap>
      </SheetFrame>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    avatarSection: { alignItems: 'center', marginBottom: 20 },
    avatarCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: C.primaryTonalStrong, alignItems: 'center', justifyContent: 'center',
      marginBottom: 8, overflow: 'hidden',
    },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { color: C.primaryDeep, fontSize: 26, fontWeight: '800', fontFamily: 'Inter' },
    changePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    changePhotoLink: { fontSize: 14, color: V6Colors.link, fontWeight: '700', fontFamily: 'Inter' },
    errorText: { color: V6Colors.dangerText, fontSize: 13, fontFamily: 'Inter', marginTop: 6, textAlign: 'center' },

    sheet: { paddingHorizontal: 20, gap: 2 },
    sheetTitle: { color: C.ink900, fontSize: 20, fontWeight: '700', lineHeight: 26, fontFamily: 'Inter', marginBottom: 8 },
    sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8 },
    sheetIcon: {
      width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primaryTonal,
      alignItems: 'center', justifyContent: 'center',
    },
    sheetLabel: { color: C.ink900, fontSize: 15, fontWeight: '500', lineHeight: 20, fontFamily: 'Inter' },
    sheetCancel: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 12, marginTop: 4 },
    sheetCancelText: { color: C.ink500, fontSize: 14, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, C, styles };
}
