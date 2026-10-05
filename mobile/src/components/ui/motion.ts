import * as Haptics from 'expo-haptics';
import { Easing } from 'react-native-reanimated';

/**
 * Motion tokens for the redesign. Purpose-only motion: press feedback,
 * sheets, toasts, skeletons. Tab switches and screen pushes are left to the
 * platform. Durations stay short so money, status and errors are never
 * hidden behind an animation.
 */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

export const DURATION = {
  press: 120,
  small: 180,
  toast: 200,
  content: 200,
} as const;

export const SHEET_SPRING = { duration: 300, dampingRatio: 0.8 } as const;

/** One haptic per user action, always paired with a visual change. Haptics
 * are a bonus (often off on Android), so failures are ignored silently. */
export const haptic = {
  tick: () => { Haptics.selectionAsync().catch(() => {}); },
  light: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  success: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  error: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); },
};
