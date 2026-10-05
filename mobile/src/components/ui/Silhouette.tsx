import React from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Default avatar: a person silhouette that fills its circle. The tint comes
 * from `textStyle.color` (the style the initials used to have), so it always
 * complements the circle's own background.
 */
export default function Silhouette({ name, textStyle }: { name?: string | null; textStyle?: StyleProp<TextStyle> }) {
  const tint = (StyleSheet.flatten(textStyle)?.color as string | undefined) ?? '#0c4a6e';
  return (
    <Svg width="100%" height="100%" viewBox="0 0 40 40" accessibilityLabel={name ? `${name}'s avatar` : 'Avatar'}>
      <Circle cx={20} cy={16} r={7} fill={tint} opacity={0.9} />
      <Path d="M6 42c0-8.3 6.3-14 14-14s14 5.7 14 14z" fill={tint} opacity={0.9} />
    </Svg>
  );
}
