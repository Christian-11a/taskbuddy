import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { EASE_IN_OUT } from './motion';

/** Gentle opacity pulse for skeleton placeholders (opacity only, UI thread).
 * Static under reduced motion. */
export default function Pulse({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    opacity.set(withRepeat(withTiming(0.55, { duration: 850, easing: EASE_IN_OUT }), -1, true));
    return () => cancelAnimation(opacity);
  }, [reduced, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
