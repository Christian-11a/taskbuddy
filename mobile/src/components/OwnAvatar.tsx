/**
 * OwnAvatar.tsx — what goes *inside* the signed-in user's avatar circle.
 *
 * Renders the uploaded photo when there is one and falls back to a person
 * silhouette when there isn't, which is still the common case. The silhouette
 * takes its tint from `textStyle.color`, so it always complements the circle
 * it sits in. It deliberately renders only the contents, not the circle: each
 * screen's circle differs in size and colour.
 *
 * The photo is set by [AvatarPicker] and reaches every screen through
 * AuthContext, so all four sites update the moment an upload finishes.
 *
 * Only for the *current user*. Counterpart avatars (chat, applicants, provider
 * profiles) need `avatar_url` on those payloads — see the backend handoff doc.
 *
 * The parent circle must set `overflow: 'hidden'` for the photo and the
 * silhouette's shoulders to be clipped to its radius.
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';

export default function OwnAvatar({
  name,
  textStyle,
}: {
  name?: string | null;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const { profile } = useAuth();
  if (profile?.avatar_url) {
    return (
      <Image
        source={{ uri: profile.avatar_url }}
        style={styles.image}
        contentFit="cover"
        transition={150}
        accessibilityLabel={name ? `${name}'s photo` : 'Your photo'}
      />
    );
  }
  const tint = (StyleSheet.flatten(textStyle)?.color as string | undefined) ?? V6Colors.primaryDeep;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 40 40" accessibilityLabel={name ? `${name}'s avatar` : 'Avatar'}>
      <Circle cx={20} cy={16} r={7} fill={tint} opacity={0.9} />
      <Path d="M6 42c0-8.3 6.3-14 14-14s14 5.7 14 14z" fill={tint} opacity={0.9} />
    </Svg>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    image: { width: '100%', height: '100%' },
  });
  return { Colors, V6Colors, styles };
}
