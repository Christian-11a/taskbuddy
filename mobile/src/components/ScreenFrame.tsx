import React, { ReactNode, useEffect, useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { V6Colors } from '../constants/theme';

interface ScreenFrameProps {
  children: ReactNode;
  /** Page background. */
  background?: string;
  /**
   * Colour of the strip under the content that sits behind the Android
   * navigation buttons / gesture bar. Match it to whatever the screen docks at
   * its bottom edge (e.g. white for a white action bar) so the bar looks like
   * it runs to the edge.
   */
  bottomColor?: string;
}

/**
 * Full-screen frame for routes without the bottom nav bar.
 *
 * The app is edge-to-edge on Android, so without this the last row of a
 * screen — often its primary action — renders underneath the system
 * navigation buttons and can't be tapped. Tab screens don't need it:
 * BottomNavBar already pads for the same inset.
 */
export default function ScreenFrame({
  children,
  background = V6Colors.canvas,
  bottomColor = background,
}: ScreenFrameProps) {
  const insets = useSafeAreaInsets();
  // With the keyboard up the nav-bar strip would sit between the input and
  // the keyboard as an empty gap.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <View style={[styles.frame, { backgroundColor: background }]}>
      <View style={styles.content}>{children}</View>
      {insets.bottom > 0 && !keyboardUp && (
        <View style={{ height: insets.bottom, backgroundColor: bottomColor }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  content: { flex: 1 },
});
