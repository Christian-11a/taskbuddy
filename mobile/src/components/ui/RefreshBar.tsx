/**
 * RefreshBar.tsx
 *
 * A thin indeterminate line at the top of a screen that is reloading content it
 * already shows. It sits over the content, so nothing moves while it runs. Under
 * reduced motion it is a plain, half-faded line instead of a sliding one.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { useThemedStyles, type Palette as ThemePalette } from '../../context/ThemeContext';
import { EASE_IN_OUT } from './motion';

/** The sliding segment is this share of the bar's width. */
const SEGMENT = 0.35;

export default function RefreshBar() {
  const { Colors, styles } = useThemedStyles(createThemedStyles);
  const reduced = useReducedMotion();
  const trackWidth = useSharedValue(0);
  const slide = useSharedValue(0);
  const [measured, setMeasured] = useState(false);

  useEffect(() => {
    if (reduced || !measured) return;
    slide.set(withRepeat(withTiming(1, { duration: 1100, easing: EASE_IN_OUT }), -1, false));
    return () => cancelAnimation(slide);
  }, [reduced, measured, slide]);

  // The segment starts just off the left edge and leaves past the right one.
  const segment = useAnimatedStyle(() => ({
    transform: [{ translateX: (slide.get() * (1 + SEGMENT) - SEGMENT) * trackWidth.get() }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    trackWidth.set(event.nativeEvent.layout.width);
    setMeasured(true);
  };

  return (
    <View testID="refresh-bar" accessibilityLabel="Refreshing" pointerEvents="none" style={styles.track} onLayout={onLayout}>
      <Animated.View
        style={[
          styles.segment,
          { backgroundColor: Colors.primary },
          reduced ? styles.still : segment,
        ]}
      />
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors } = theme;
  const styles = StyleSheet.create({
    track: {
      position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 10,
      overflow: 'hidden', backgroundColor: 'transparent',
    },
    segment: { position: 'absolute', top: 0, bottom: 0, left: 0, width: `${SEGMENT * 100}%`, borderRadius: 2 },
    still: { width: '100%', opacity: 0.5 },
  });
  return { Colors, styles };
}
