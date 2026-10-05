import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  SlideInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { SHEET_SPRING } from './motion';

type SheetFrameProps = {
  visible: boolean;
  /** Back button / drag down / backdrop tap. Omit while busy to lock the sheet. */
  onClose?: () => void;
  /** 'sheet' docks to the bottom (forms, payments); 'dialog' stays centered
   * (are-you-sure questions, where a centered box reads as a decision). */
  variant?: 'sheet' | 'dialog';
  /** The card's own layout (padding, gap…). Sheet geometry is applied on top. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Extra props for the card (testID, accessibility…). */
  cardProps?: Omit<PressableProps, 'style' | 'onPress'>;
  children: React.ReactNode;
};

const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 900;
const DIALOG_MARGIN = 24;

/**
 * Shared frame for every popup. Keeps React Native's Modal (so visibility and
 * close callbacks behave exactly as before) and only changes presentation:
 * a bottom sheet that slides up, can be dragged down by its grip, and sits on
 * top of the keyboard on Android too (K1). The card never grows past the space
 * between the status bar and the keyboard; when it would, it scrolls, and on
 * keyboard-open it scrolls to its last row so the actions stay reachable.
 * Reduced motion: fade only.
 */
export default function SheetFrame({
  visible, onClose, variant = 'sheet', contentStyle, cardProps, children,
}: SheetFrameProps) {
  const { palette } = useTheme();
  const C = palette.V6Colors;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduced = useReducedMotion();
  const dragY = useSharedValue(0);
  const isSheet = variant === 'sheet';
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // The Modal draws under the translucent nav bar, but the reported keyboard
    // height leaves that strip out, so add it back for the real overlap.
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height + insets.bottom));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [insets.bottom]);

  // Keyboard open: bring the sheet's last row (its actions) into view (K1).
  useEffect(() => {
    if (keyboardHeight === 0) return;
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [keyboardHeight]);

  const keyboardUp = keyboardHeight > 0;
  const available = windowHeight - insets.top - keyboardHeight - (isSheet ? 0 : DIALOG_MARGIN * 2);

  const pan = Gesture.Pan()
    .enabled(isSheet && !!onClose)
    .onUpdate((e) => {
      dragY.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (onClose && (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY)) {
        scheduleOnRN(onClose);
      } else {
        dragY.set(withSpring(0, { ...SHEET_SPRING, velocity: e.velocityY }));
      }
    });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.get() }] }));

  const entering = reduced ? FadeIn.duration(150) : isSheet ? SlideInDown.duration(280) : FadeIn.duration(180);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
      onShow={() => dragY.set(0)}
    >
      <GestureHandlerRootView style={styles.flex}>
        <Pressable
          style={[
            styles.backdrop,
            { backgroundColor: C.scrim, paddingTop: insets.top, paddingBottom: keyboardHeight },
            isSheet ? styles.backdropSheet : styles.backdropDialog,
          ]}
          onPress={onClose}
          accessible={false}
        >
          <Animated.View
            entering={entering}
            style={[isSheet ? styles.sheetWrap : styles.dialogWrap, { maxHeight: available }, dragStyle]}
          >
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              bounces={false}
              overScrollMode="never"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable
                {...cardProps}
                // Tapping the card (outside a field) hides the keyboard; it never closes the sheet.
                onPress={() => Keyboard.dismiss()}
                accessibilityViewIsModal
                style={[
                  contentStyle,
                  isSheet ? styles.sheet : styles.dialog,
                  { backgroundColor: C.surface },
                  isSheet && { paddingBottom: keyboardUp ? 16 : Math.max(insets.bottom, 12) + 12 },
                ]}
              >
                {isSheet && (
                  <GestureDetector gesture={pan}>
                    <View style={styles.gripArea} accessible={false}>
                      <View style={[styles.grip, { backgroundColor: C.ink200 }]} />
                    </View>
                  </GestureDetector>
                )}
                {children}
              </Pressable>
            </ScrollView>
          </Animated.View>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1 },
  backdropSheet: { justifyContent: 'flex-end' },
  backdropDialog: { justifyContent: 'center', paddingHorizontal: DIALOG_MARGIN },
  sheetWrap: { width: '100%', maxWidth: 600, alignSelf: 'center' },
  dialogWrap: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  scroll: { flexGrow: 0 },
  sheet: {
    width: '100%',
    maxWidth: '100%',
    margin: 0,
    alignSelf: 'stretch',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 0,
    elevation: 16,
  },
  dialog: {
    width: '100%',
    borderRadius: 24,
    elevation: 16,
  },
  gripArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 6, marginHorizontal: -24 },
  grip: { width: 36, height: 4, borderRadius: 2 },
});
