import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { RefreshCw } from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../context/ThemeContext';
import Tap from './Tap';

export interface StaleHintProps {
  /** The data on screen is not from a successful fetch: a saved copy, or data a failed refresh left in place. */
  stale: boolean;
  /** A fetch is running. */
  refreshing: boolean;
  /** The error of the last fetch, once it failed. Only shown while the data is stale. */
  error?: string | null;
  /** Runs the fetch again. Without it the failure is said, with no button. */
  onRetry?: () => void;
  /** What the updating line says. Defaults to "Updating…". */
  updatingLabel?: string;
}

/**
 * Says whether the data on screen is saved or being refreshed. Nothing shows for fresh data. While a
 * fetch replaces a saved copy it says so; when a refresh failed it says the saved data could not be
 * refreshed, with Try again. Shown once per screen, under the header or above the list.
 */
export default function StaleHint({
  stale,
  refreshing,
  error,
  onRetry,
  updatingLabel = 'Updating…',
}: StaleHintProps) {
  const { styles, C } = useThemedStyles(createThemedStyles);
  const reduced = useReducedMotion();

  if (!stale) return null;

  if (refreshing) {
    return (
      <View testID="stale-hint" style={styles.row} accessibilityLiveRegion="polite">
        {reduced ? (
          <RefreshCw size={14} color={C.ink500} />
        ) : (
          <ActivityIndicator size="small" color={C.ink500} />
        )}
        <Text style={styles.text}>{updatingLabel}</Text>
      </View>
    );
  }

  if (!error) return null;

  return (
    <View testID="stale-hint" style={styles.row} accessibilityLiveRegion="polite">
      <Text style={[styles.text, styles.textGrow]}>Showing saved data. Couldn't refresh.</Text>
      {onRetry && (
        <Tap
          onPress={onRetry}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.retry}>Try again</Text>
        </Tap>
      )}
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 2,
    },
    text: {
      color: C.ink500,
      fontSize: 13,
      fontWeight: '500',
      fontFamily: 'Inter',
      lineHeight: 18,
    },
    textGrow: { flexShrink: 1 },
    retry: {
      color: Colors.link,
      fontSize: 13,
      fontWeight: '600',
      fontFamily: 'Inter',
      lineHeight: 18,
    },
  });
  return { styles, C };
}
