import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../context/ThemeContext';

/** The line a slow first load shows: the API server is waking up. Shown only while there is nothing to show. */
export default function SlowLoadNote() {
  const { styles } = useThemedStyles(createThemedStyles);
  return (
    <Text style={styles.note} accessibilityLiveRegion="polite">
      The server is waking up. This can take up to a minute.
    </Text>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { V6Colors } = theme;
  const styles = StyleSheet.create({
    note: {
      color: V6Colors.ink500,
      fontFamily: 'Inter',
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
  });
  return { styles };
}
