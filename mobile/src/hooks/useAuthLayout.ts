import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Sizing for the full-bleed auth screens (login, sign-up, forgot password,
 * onboarding). They paint behind the status bar and the Android navigation
 * buttons, so their padding has to come from the real insets rather than a
 * fixed number, and on short phones they switch to a compact layout so the
 * whole form fits without scrolling.
 */
export function useAuthLayout() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height - insets.top - insets.bottom < 720;
  return {
    compact,
    paddingTop: insets.top + (compact ? 12 : 32),
    paddingBottom: insets.bottom + (compact ? 12 : 24),
  };
}
