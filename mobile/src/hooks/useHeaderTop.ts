import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Replaces the fixed `Sizes.statusBarHeight` estimate (a bare `52` on iOS,
 * a tuned `StatusBar.currentHeight + 28` on Android — computed once at
 * import time, never reactive to rotation) with the real, per-device inset.
 * `+16` is the redesign's header breathing room below the status bar
 * (was `+28`, which left a visibly large gap above every header title).
 */
export function useHeaderTop(extra = 0) {
  const insets = useSafeAreaInsets();
  return insets.top + 16 + extra;
}
