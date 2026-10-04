import { useTheme, useThemedStyles, type Palette as ThemePalette } from '../src/context/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import React, { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Shared application frame.
 *
 * `useWindowDimensions` updates when the device size or orientation changes.
 * The frame is edge-to-edge so each screen can paint behind the iOS status and
 * home-indicator areas. The centred content column still prevents the UI from
 * becoming uncomfortably wide on tablets or large/foldable displays.
 */
export default function RootLayout({ children }: RootLayoutProps) {
  const { dark } = useTheme();
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 600);

  return (
    <View style={styles.root}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={[styles.content, { width: contentWidth }]}>{children}</View>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: V6Colors.canvas,
    },
    content: {
      flex: 1,
      maxWidth: 600,
      overflow: 'hidden',
    },
  });
  return { Colors, V6Colors, styles };
}
