/**
 * OwnAvatar.tsx — what goes *inside* the signed-in user's avatar circle.
 *
 * Renders the uploaded photo when there is one and falls back to initials when
 * there isn't, which is still the common case. It deliberately renders only the
 * contents, not the circle: each screen's circle differs in size and colour
 * (dark hero vs. white topbar), and duplicating those here would fight the
 * per-screen styling the v6 migration set up.
 *
 * The photo is set by [AvatarPicker] and reaches every screen through
 * AuthContext, so all four sites update the moment an upload finishes.
 *
 * Only for the *current user*. Counterpart avatars (chat, applicants, provider
 * profiles) need `avatar_url` on those payloads — see the backend handoff doc.
 *
 * The parent circle must set `overflow: 'hidden'` for the photo to be clipped
 * to its radius.
 */

import React from 'react';
import { Image, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { initials } from '../lib/format';

export default function OwnAvatar({
  name,
  textStyle,
}: {
  name?: string | null;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { profile } = useAuth();
  if (profile?.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={styles.image} />;
  }
  return <Text style={textStyle}>{initials(name)}</Text>;
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
});
