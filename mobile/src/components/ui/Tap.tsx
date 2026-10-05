import React from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../../context/ThemeContext';
import { DURATION, EASE_OUT } from './motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TapProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Subtle 0.97 press scale, for primary buttons and cards. */
  scale?: boolean;
  /** Ripple tint; defaults to the brand ripple. Pass `rippleOnHero` on colored headers. */
  rippleColor?: string;
  /** Ripple that spills past the bounds, for icon-only buttons. */
  borderlessRipple?: boolean;
  /** Accepted for TouchableOpacity compatibility; the ripple replaces the fade. */
  activeOpacity?: number;
};

/**
 * Drop-in for TouchableOpacity: Android ripple, plus an optional 0.97 scale
 * that runs on the UI thread. Feedback lands on press-in; the action still
 * fires on press, exactly like before. Reduced motion keeps the ripple and
 * drops the scale. Rounded buttons clip the ripple to their corners.
 */
export default function Tap({
  scale = false, rippleColor, borderlessRipple = false, activeOpacity: _activeOpacity,
  style, onPressIn, onPressOut, children, ...rest
}: TapProps) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const pressed = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: pressed.get() }] }));
  const useScale = scale && !reduced;
  const flat = StyleSheet.flatten(style) ?? {};
  const clip = !borderlessRipple && flat.borderRadius != null && flat.overflow == null;

  return (
    <AnimatedPressable
      {...rest}
      android_ripple={{ color: rippleColor ?? palette.V6Colors.ripple, borderless: borderlessRipple, foreground: true }}
      onPressIn={(e) => {
        if (useScale) pressed.set(withTiming(0.97, { duration: DURATION.press, easing: EASE_OUT }));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (useScale) pressed.set(withTiming(1, { duration: DURATION.press, easing: EASE_OUT }));
        onPressOut?.(e);
      }}
      style={[flat, clip && styles.clip, useScale && animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
