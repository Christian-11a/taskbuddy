import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, CircleAlert, Info } from 'lucide-react-native';
import Tap from './ui/Tap';
import { DURATION, EASE_OUT, haptic } from './ui/motion';

type ToastKind = 'info' | 'success' | 'error';
export type ToastAction = { label: string; onPress: () => void };
interface ToastMessage { id: number; text: string; kind: ToastKind; action?: ToastAction }

let listener: ((msg: ToastMessage) => void) | null = null;
let nextId = 1;

/**
 * Show a short, non-blocking message above the bottom navigation. Safe to
 * call from anywhere; it is a no-op if no <ToastHost /> is mounted. An
 * `action` (e.g. Undo) adds a button and keeps the toast up longer.
 */
export function showToast(text: string, kind: ToastKind = 'info', action?: ToastAction) {
  listener?.({ id: nextId++, text, kind, action });
}

const DURATION_MS = 2600;
const ACTION_DURATION_MS = 5000;
const ICONS = { info: Info, success: Check, error: CircleAlert } as const;
// Hit area for the action: its text is 18 dp tall, so 15 dp above and below reaches 48.
const ACTION_HIT_SLOP = { top: 15, bottom: 15, left: 8, right: 8 } as const;

/** Mount once, near the root, above every screen. */
export function ToastHost() {
  const { styles, iconFill, onWhite, pillColor } = useThemedStyles(createThemedStyles);
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
    }, msg.action ? ACTION_DURATION_MS : DURATION_MS);
    return () => clearTimeout(timer);
  }, [msg, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: reduced ? 0 : (1 - progress.get()) * 16 }],
  }));

  if (!msg) return null;
  const Icon = ICONS[msg.kind];
  const { action } = msg;
  // Run the action, then hide this toast only if it is still the one showing,
  // so an action that shows a new toast does not hide that toast too.
  const runAction = () => {
    const id = msg.id;
    action?.onPress();
    setMsg((current) => (current?.id === id ? null : current));
  };
  return (
    <View pointerEvents={action ? 'box-none' : 'none'} style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
      <Animated.View
        style={[styles.toast, { backgroundColor: pillColor }, animated]}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
      >
        <View style={[styles.iconCircle, { backgroundColor: iconFill[msg.kind] }]}>
          <Icon size={14} color={onWhite} strokeWidth={2.6} />
        </View>
        <Text style={styles.text} numberOfLines={2}>{msg.text}</Text>
        {action && (
          <Tap onPress={runAction} hitSlop={ACTION_HIT_SLOP} accessibilityRole="button" accessibilityLabel={action.label}>
            <Text style={styles.action}>{action.label}</Text>
          </Tap>
        )}
      </Animated.View>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors } = theme;
  const styles = StyleSheet.create({
    wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 48,
      maxWidth: 420,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      elevation: 8,
    },
    iconCircle: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1, fontFamily: 'Inter', fontSize: 13, fontWeight: '600', lineHeight: 18, color: Colors.onPrimary },
    action: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: '#7dd4fc' },
  });
  return {
    styles,
    // The pill is a fixed dark tone in both appearances; only the dark value differs.
    pillColor: theme.appearance === 'dark' ? '#2c3238' : '#0f1729',
    iconFill: { info: Colors.link, success: Colors.successSolid, error: Colors.dangerSolid } as Record<ToastKind, string>,
    onWhite: Colors.onPrimary,
  };
}
