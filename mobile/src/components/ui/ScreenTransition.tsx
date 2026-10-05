import React, { useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  useReducedMotion,
} from 'react-native-reanimated';

/**
 * Screen-to-screen motion for the app's state-based router. Purely visual:
 * it wraps whatever screen App.tsx decided to render and never touches the
 * navigation state. A deeper screen slides in from the right, going back
 * slides in from the left, and tab switches (same key) don't animate at all
 * because tabs are peers. Runs on the UI thread; reduced motion = short fade.
 */
export function useTransitionDirection(key: string, depth: number) {
  const last = useRef({ key, depth, direction: 'none' as Direction });
  if (last.current.key !== key) {
    const direction: Direction =
      depth > last.current.depth ? 'push' : depth < last.current.depth ? 'pop' : 'fade';
    last.current = { key, depth, direction };
  }
  return last.current.direction;
}

type Direction = 'push' | 'pop' | 'fade' | 'none';

export default function ScreenTransition({
  screenKey, direction, children,
}: { screenKey: string; direction: Direction; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const entering =
    direction === 'none' ? undefined
      : reduced || direction === 'fade' ? FadeIn.duration(160)
        : direction === 'push' ? FadeInRight.duration(240)
          : FadeInLeft.duration(240);
  return (
    <Animated.View
      key={screenKey}
      style={styles.fill}
      entering={entering}
      exiting={direction === 'none' ? undefined : FadeOut.duration(120)}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } });
