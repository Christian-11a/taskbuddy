import React from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
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

/**
 * Shared frame for every popup. Keeps React Native's Modal (so visibility and
 * close callbacks behave exactly as before) and only changes presentation:
 * a bottom sheet that slides up, can be dragged down by its grip, and rides
 * above the keyboard on Android too (K1). Reduced motion: fade only.
 */
export default function SheetFrame({
  visible, onClose, variant = 'sheet', contentStyle, cardProps, children,
}: SheetFrameProps) {
  const { palette } = useTheme();
  const C = palette.V6Colors;
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const dragY = useSharedValue(0);
  const isSheet = variant === 'sheet';

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
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <Pressable
            style={[styles.backdrop, { backgroundColor: C.scrim }, isSheet ? styles.backdropSheet : styles.backdropDialog]}
            onPress={onClose}
            accessible={false}
          >
            <Animated.View entering={entering} style={[isSheet ? styles.sheetWrap : styles.dialogWrap, dragStyle]}>
              <Pressable
                {...cardProps}
                // Tapping the card (outside a field) hides the keyboard; it never closes the sheet.
                onPress={() => Keyboard.dismiss()}
                accessibilityViewIsModal
                style={[
                  contentStyle,
                  isSheet ? styles.sheet : styles.dialog,
                  { backgroundColor: C.surface },
                  isSheet && { paddingBottom: Math.max(insets.bottom, 12) + 12 },
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
            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1 },
  backdropSheet: { justifyContent: 'flex-end' },
  backdropDialog: { justifyContent: 'center', padding: 24 },
  sheetWrap: { width: '100%', maxWidth: 600, alignSelf: 'center' },
  dialogWrap: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  sheet: {
    width: '100%',
    maxWidth: '100%',
    margin: 0,
    alignSelf: 'stretch',
    maxHeight: '100%',
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
