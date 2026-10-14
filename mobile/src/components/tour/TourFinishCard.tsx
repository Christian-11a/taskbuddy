/**
 * TourFinishCard.tsx: the last card of the welcome flow, shown once the
 * spotlight tour ends. A bottom sheet with a checklist from the account's real
 * status and one main action. Confetti and one light tap play only on a first
 * run, never on a replay. It is its own modal, not SheetFrame, because the
 * confetti has to sit above the sheet and SheetFrame only holds its children
 * inside the card. Its layout follows SheetFrame's, the one that takes presses
 * on a phone: a full-window backdrop wraps the sheet, the sheet takes presses
 * that are not on a button, and the entrance animation sits on a wrapper rather
 * than on the element that holds the buttons.
 */
import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, SlideInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Check } from 'lucide-react-native';
import { useThemedStyles, type Palette as ThemePalette } from '../../context/ThemeContext';
import Tap from '../ui/Tap';
import { V6Shadows } from '../../constants/theme';
import { haptic } from '../ui/motion';
import { finishCard, type ChecklistState, type FinishAction, type WelcomeRole } from '../../lib/tourContent';
import Confetti from './Confetti';

type TourFinishCardProps = {
  role: WelcomeRole;
  /** A provider's real verification status; the client ignores it. */
  verified: boolean;
  /** Whether a provider's profile is ready to verify (address and bio); the client ignores it. */
  hasServiceProfile?: boolean;
  firstName: string;
  /** A brand-new account's first walkthrough: confetti and one light tap. Never on a replay. */
  firstRun: boolean;
  onAction: (action: FinishAction) => void;
};

/** How each checklist step reads to a screen reader, after its name. */
const STATE_WORD: Record<ChecklistState, string> = { done: 'done', next: 'next step', later: 'to do' };

/** The card takes the presses that are not on a button, so they do not fall through to the backdrop. */
const noop = () => {};
/** The 18 dp link plus 15 dp above and below makes the 48 dp target. The gap above the link is 16 dp, so the slop never reaches the main button. */
const SECONDARY_HIT_SLOP = { top: 15, bottom: 15, left: 12, right: 12 } as const;

export default function TourFinishCard({ role, verified, hasServiceProfile = true, firstName, firstRun, onAction }: TourFinishCardProps) {
  const { Colors, C, styles } = useThemedStyles(createThemedStyles);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const reduced = useReducedMotion();
  const content = finishCard({ role, verified, hasServiceProfile, firstName });
  const { secondary } = content;

  // One light tap when a first run's card appears, and none on a replay.
  useEffect(() => {
    if (firstRun) haptic.light();
  }, [firstRun]);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => onAction('close')}
    >
      <GestureHandlerRootView style={styles.root}>
        {/* A tap on the dimmed area closes the card. The full-window height is explicit, as in SheetFrame, so the sheet reaches the bottom edge. */}
        <Pressable
          testID="tour-finish-scrim"
          accessible={false}
          style={[styles.backdrop, { backgroundColor: Colors.scrim, height: windowHeight }]}
          onPress={() => onAction('close')}
        >
          {/* The entrance moves this wrapper, which holds no buttons itself; the buttons sit inside the card. */}
          <Animated.View
            entering={reduced ? FadeIn.duration(150) : SlideInDown.duration(280)}
            style={styles.sheetWrap}
          >
            <Pressable
              testID="tour-finish"
              accessible={false}
              accessibilityViewIsModal
              onPress={noop}
              // The Modal is drawn under the navigation bar, so the sheet clears its inset; 16 dp sits under the link.
              style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
            >
              <View style={styles.grip}>
                <View style={[styles.gripBar, { backgroundColor: C.ink200 }]} />
              </View>

              <Text accessibilityRole="header" style={styles.title}>{content.title}</Text>

              <View style={styles.checklist}>
                {content.checklist.map((item) => (
                  <View
                    key={item.label}
                    accessible
                    accessibilityLabel={`${item.label}, ${STATE_WORD[item.state]}`}
                    style={[styles.row, item.state === 'next' && styles.rowNext]}
                  >
                    <Mark state={item.state} />
                    <Text
                      style={[
                        styles.rowText,
                        item.state === 'next' && styles.rowTextNext,
                        item.state === 'later' && styles.rowTextLater,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </View>
                ))}
              </View>

              <Tap
                testID="tour-finish-primary"
                scale
                accessibilityRole="button"
                accessibilityLabel={content.primary.label}
                style={styles.primary}
                onPress={() => onAction(content.primary.action)}
              >
                <Text style={styles.primaryText}>{content.primary.label}</Text>
              </Tap>

              {secondary && (
                <Tap
                  testID="tour-finish-secondary"
                  accessibilityRole="button"
                  accessibilityLabel={secondary.label}
                  style={styles.secondary}
                  hitSlop={SECONDARY_HIT_SLOP}
                  onPress={() => onAction(secondary.action)}
                >
                  <Text style={styles.secondaryText}>{secondary.label}</Text>
                </Tap>
              )}
            </Pressable>
          </Animated.View>
        </Pressable>

        {/* Above the backdrop and the sheet. Its layer ignores touches (pointerEvents none), so the buttons work while it plays. */}
        <Confetti active={firstRun} />
      </GestureHandlerRootView>
    </Modal>
  );
}

/** A step's mark: a green check when done, an arrow on the step to do next, a hollow ring for later. */
function Mark({ state }: { state: ChecklistState }) {
  const { Colors, C, styles } = useThemedStyles(createThemedStyles);
  if (state === 'done') {
    return (
      <View style={[styles.mark, { backgroundColor: Colors.successSolid }]}>
        <Check size={14} color={Colors.onPrimary} strokeWidth={3} />
      </View>
    );
  }
  if (state === 'next') {
    return (
      <View style={[styles.mark, { backgroundColor: Colors.primary }]}>
        <ArrowRight size={14} color={Colors.onPrimary} strokeWidth={2.6} />
      </View>
    );
  }
  return <View style={[styles.mark, styles.markLater, { borderColor: C.ink300 }]} />;
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const C = V6Colors;
  const styles = StyleSheet.create({
    root: { flex: 1 },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, justifyContent: 'flex-end' },
    // Centred and capped on wide screens, as SheetFrame's sheet is.
    sheetWrap: { width: '100%', maxWidth: 600, alignSelf: 'center' },
    sheet: {
      paddingHorizontal: 24,
      paddingTop: 8,
      gap: 16,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: C.surface,
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 16,
    },
    grip: { alignItems: 'center', paddingVertical: 4 },
    gripBar: { width: 40, height: 4, borderRadius: 2 },
    title: {
      color: C.ink900, fontSize: 22, fontWeight: '800', fontFamily: 'Inter', lineHeight: 28, letterSpacing: -0.3,
    },
    checklist: { gap: 8 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
      borderWidth: 1, borderColor: C.line,
    },
    rowNext: { borderColor: Colors.primary, backgroundColor: Colors.primaryTonal },
    rowText: { flex: 1, color: C.ink700, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
    rowTextNext: { color: C.ink900, fontWeight: '700' },
    rowTextLater: { color: C.ink500, fontWeight: '500' },
    mark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    markLater: { borderWidth: 2, backgroundColor: 'transparent' },
    primary: {
      minHeight: 52, borderRadius: 14, paddingHorizontal: 20,
      backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
      ...V6Shadows.primaryButton,
    },
    primaryText: { color: Colors.onPrimary, fontSize: 16, fontWeight: '700', fontFamily: 'Inter' },
    secondary: { alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: Colors.link, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, C, styles };
}
