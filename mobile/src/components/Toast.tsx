import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import { DURATION, EASE_OUT, haptic } from './ui/motion';

type ToastKind = 'info' | 'success' | 'error';
interface ToastMessage { id: number; text: string; kind: ToastKind }

let listener: ((msg: ToastMessage) => void) | null = null;
let nextId = 1;

/**
 * Show a short, non-blocking message above the bottom navigation. Safe to
 * call from anywhere; it is a no-op if no <ToastHost /> is mounted.
 */
export function showToast(text: string, kind: ToastKind = 'info') {
  listener?.({ id: nextId++, text, kind });
}

const DURATION_MS = 2600;
const ICONS = { info: Info, success: CircleCheck, error: CircleAlert } as const;

/** Mount once, near the root, above every screen. */
export function ToastHost() {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const progress = useSharedValue(0);

  useEffect(() => {
    listener = setMsg;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!msg) return;
    if (msg.kind === 'success') haptic.success();
    else if (msg.kind === 'error') haptic.error();
    progress.set(0);
    progress.set(withTiming(1, { duration: DURATION.toast, easing: EASE_OUT }));
    const clear = (id: number) => setMsg((current) => (current?.id === id ? null : current));
    const timer = setTimeout(() => {
      progress.set(withTiming(0, { duration: DURATION.toast, easing: EASE_OUT }, (finished) => {
        if (finished) scheduleOnRN(clear, msg.id);
      }));
    }, DURATION_MS);
    return () => clearTimeout(timer);
  }, [msg, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: reduced ? 0 : (1 - progress.get()) * 16 }],
  }));

  if (!msg) return null;
  const Icon = ICONS[msg.kind];
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
      <Animated.View
        style={[styles.toast, msg.kind === 'error' && styles.error, msg.kind === 'success' && styles.success, animated]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Icon size={18} color={V6Colors.onPrimary} strokeWidth={2.4} />
        <Text style={styles.text}>{msg.text}</Text>
      </Animated.View>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.appearance === 'dark' ? '#2c3238' : '#1e293b',
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      maxWidth: 420,
      elevation: 6,
    },
    error: { backgroundColor: V6Colors.dangerSolid },
    success: { backgroundColor: '#15803d' },
    text: { flexShrink: 1, color: V6Colors.onPrimary, fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, styles };
}
