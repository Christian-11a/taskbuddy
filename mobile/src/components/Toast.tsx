import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { V6Colors } from '../constants/theme';

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

/** Mount once, near the root, above every screen. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<ToastMessage | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listener = setMsg;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!msg) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        () => setMsg((current) => (current?.id === msg.id ? null : current)),
      );
    }, DURATION_MS);
    return () => clearTimeout(timer);
  }, [msg, opacity]);

  if (!msg) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
      <Animated.View
        style={[styles.toast, msg.kind === 'error' && styles.error, msg.kind === 'success' && styles.success, { opacity }]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <Text style={styles.text}>{msg.text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    backgroundColor: V6Colors.ink900,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    maxWidth: 420,
  },
  error: { backgroundColor: '#b91c1c' },
  success: { backgroundColor: '#15803d' },
  text: { color: '#ffffff', fontSize: 14.5, fontWeight: '600', fontFamily: 'Inter', textAlign: 'center' },
});
