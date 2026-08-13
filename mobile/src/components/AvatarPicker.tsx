/**
 * AvatarPicker.tsx — the profile photo, and the "Change Photo" link under it.
 *
 * Both Edit Profile screens had this markup inline with a dead TouchableOpacity;
 * the upload is identical for either role, so it lives here once.
 *
 * The flow is the same three steps as job photos: ask the API for a signed URL,
 * PUT the bytes straight to Supabase Storage, then send the resulting object
 * *path* to PATCH /profiles/me. The API turns that path into a public URL and
 * rejects paths belonging to another profile, so `profile.avatar_url` comes
 * back as a ready-to-render https URL, not a path.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { V6Colors } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { initials } from '../lib/format';

const C = V6Colors;

export default function AvatarPicker({ name }: { name: string }) {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarUrl = profile?.avatar_url ?? null;

  const changePhoto = async () => {
    setError(null);
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow photo library access to change your photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        // Avatars render in a circle everywhere, so crop to square up front
        // rather than letting a portrait shot get centre-cropped at each size.
        aspect: [1, 1],
        quality: 0.8,
      });
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
          <ActivityIndicator color={C.white} />
        ) : avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>{initials(name)}</Text>
        )}
      </View>
      <TouchableOpacity activeOpacity={0.7} onPress={() => void changePhoto()} disabled={busy}>
        <Text style={styles.changePhotoLink}>
          {busy ? 'Uploading…' : 'Change Photo'}
        </Text>
      </TouchableOpacity>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatarCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: C.cyan600, alignItems: 'center', justifyContent: 'center',
    marginBottom: 8, overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: C.white, fontSize: 26, fontWeight: '800', fontFamily: 'Inter' },
  changePhotoLink: { fontSize: 14, color: C.cyan700, fontWeight: '700', fontFamily: 'Inter' },
  errorText: { color: '#ef4444', fontSize: 13, fontFamily: 'Inter', marginTop: 6, textAlign: 'center' },
});
