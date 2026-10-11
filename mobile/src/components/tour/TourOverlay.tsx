/**
 * TourOverlay.tsx: the spotlight tour's screen. The window is dimmed with a
 * rounded hole cut around the step's control, a soft ring pulses around the
 * hole, and a card explains the control. It sits in a Modal above everything.
 * The dim layer takes every touch, so the control under the hole cannot be
 * pressed during the tour; a tap anywhere outside the card moves on.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  FadeIn, cancelAnimation, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import Tap from '../ui/Tap';
import { DURATION, EASE_IN_OUT, EASE_OUT } from '../ui/motion';
import { placeTourCard } from './placeTourCard';
import type { TourRect, TourStep } from './types';

/** The spotlight leaves this much room around the control, with this corner radius. */
const HOLE_PADDING = 8;
const HOLE_RADIUS = 14;
/** The pulsing ring sits this far outside the spotlight. */
const RING_GAP = 4;
const CARD_MAX_WIDTH = 340;
const SCREEN_EDGE = 16;
const DIM_LIGHT = 'rgba(15,23,42,0.72)';
const DIM_DARK = 'rgba(0,0,0,0.8)';
/** The hint's pill: dark enough to read over the dimmed page text in both themes. */
const HINT_PILL = 'rgba(0,0,0,0.45)';
/** The ring fades from 0.9 to 0.3 and back again: 2 x 600 ms, a 1.2 s loop. */
const PULSE_LOW = 0.3;
const PULSE_HALF_MS = 600;
/** The 14 px link is 18 dp of text; 15 dp above and below reaches the 48 dp target. */
const SKIP_HIT_SLOP = { top: 15, bottom: 15, left: 8, right: 8 } as const;

const MOVE = { duration: DURATION.content, easing: EASE_OUT };
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The dim layer as one SVG path: the whole window, then a rounded rectangle.
 * With the even-odd fill rule the rectangle comes out unfilled. It is
 * evaluated on the UI thread on every frame of a move, hence the worklet.
 */
export function dimPath(
  x: number, y: number, width: number, height: number,
  screenWidth: number, screenHeight: number, radius: number,
): string {
  'worklet';
  const r = Math.min(radius, width / 2, height / 2);
  return `M0 0H${screenWidth}V${screenHeight}H0Z`
    + `M${x + r} ${y}H${x + width - r}A${r} ${r} 0 0 1 ${x + width} ${y + r}`
    + `V${y + height - r}A${r} ${r} 0 0 1 ${x + width - r} ${y + height}`
    + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + height - r}`
    + `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** Glides a value to its target, or sets it outright when the motion should not play. */
function moveTo(value: SharedValue<number>, target: number, animate: boolean) {
  value.set(animate ? withTiming(target, MOVE) : target);
}

type TourOverlayProps = {
  step: TourStep;
  /** Zero-based position of the step, for "Step 2 of 4". */
  index: number;
  total: number;
  /** The control's rectangle in window coordinates; the spotlight adds its padding. */
  hole: TourRect;
  onNext: () => void;
  onSkip: () => void;
};

export default function TourOverlay({ step, index, total, hole, onNext, onSkip }: TourOverlayProps) {
  const { palette } = useTheme();
  const C = palette.V6Colors;
  const dark = palette.appearance === 'dark';
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // The card block (card + hint) is placed once its height is known; until then it stays hidden.
  const [blockHeight, setBlockHeight] = useState(0);

  const spot = {
    x: hole.x - HOLE_PADDING,
    y: hole.y - HOLE_PADDING,
    width: hole.width + 2 * HOLE_PADDING,
    height: hole.height + 2 * HOLE_PADDING,
  };
  // The spotlight glides from one control to the next; reduced motion jumps.
  const spotX = useSharedValue(spot.x);
  const spotY = useSharedValue(spot.y);
  const spotWidth = useSharedValue(spot.width);
  const spotHeight = useSharedValue(spot.height);
  const pulse = useSharedValue(0.9);
  useEffect(() => {
    moveTo(spotX, spot.x, !reduced);
    moveTo(spotY, spot.y, !reduced);
    moveTo(spotWidth, spot.width, !reduced);
    moveTo(spotHeight, spot.height, !reduced);
  }, [spot.x, spot.y, spot.width, spot.height, reduced, spotX, spotY, spotWidth, spotHeight]);
  useEffect(() => {
    if (reduced) return;
    pulse.set(withRepeat(withTiming(PULSE_LOW, { duration: PULSE_HALF_MS, easing: EASE_IN_OUT }), -1, true));
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  const dimProps = useAnimatedProps(() => ({
    d: dimPath(spotX.get(), spotY.get(), spotWidth.get(), spotHeight.get(), width, height, HOLE_RADIUS),
  }));
  const ringStyle = useAnimatedStyle(() => ({
    left: spotX.get() - RING_GAP,
    top: spotY.get() - RING_GAP,
    width: spotWidth.get() + 2 * RING_GAP,
    height: spotHeight.get() + 2 * RING_GAP,
    opacity: pulse.get(),
  }));

  // The card sits inside the safe area. Its block is the card plus the hint under it, so both stay on screen.
  const cardWidth = Math.min(CARD_MAX_WIDTH, width - 2 * SCREEN_EDGE);
  const placed = blockHeight > 0
    ? placeTourCard(
      { x: spot.x, y: spot.y - insets.top, width: spot.width, height: spot.height },
      { width, height: height - insets.top - insets.bottom },
      { width: cardWidth, height: blockHeight },
    )
    : null;
  const targetTop = placed ? placed.top + insets.top : 0;
  const targetLeft = placed ? placed.left : 0;
  const cardTop = useSharedValue(0);
  const cardLeft = useSharedValue(0);
  const placedBefore = useRef(false);
  useEffect(() => {
    if (blockHeight === 0) return;
    // The first placement appears in place; later ones travel with the spotlight.
    const animate = placedBefore.current && !reduced;
    moveTo(cardTop, targetTop, animate);
    moveTo(cardLeft, targetLeft, animate);
    placedBefore.current = true;
  }, [blockHeight, targetTop, targetLeft, reduced, cardTop, cardLeft]);
  const cardStyle = useAnimatedStyle(() => ({ top: cardTop.get(), left: cardLeft.get() }));

  const isLast = index === total - 1;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onSkip}
    >
      <Animated.View entering={FadeIn.duration(DURATION.content)} style={styles.root}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <AnimatedPath
            animatedProps={dimProps}
            fill={dark ? DIM_DARK : DIM_LIGHT}
            fillRule="evenodd"
          />
        </Svg>
        {/* Covers the whole window, so every tap outside the card moves the tour on. */}
        <Tap testID="tour-dim" accessible={false} style={StyleSheet.absoluteFill} onPress={onNext} />
        {!reduced && (
          <Animated.View
            testID="tour-ring"
            pointerEvents="none"
            style={[styles.ring, { borderRadius: HOLE_RADIUS + RING_GAP }, ringStyle]}
          />
        )}
        <Animated.View
          testID="tour-card"
          pointerEvents="box-none"
          onLayout={(event) => setBlockHeight(event.nativeEvent.layout.height)}
          style={[styles.block, { width: cardWidth, opacity: blockHeight > 0 ? 1 : 0 }, cardStyle]}
        >
          <View accessibilityViewIsModal style={[styles.card, { backgroundColor: C.surface }]}>
            <View style={styles.topRow}>
              <Tap
                testID="tour-skip"
                hitSlop={SKIP_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Skip tour"
                onPress={onSkip}
              >
                <Text maxFontSizeMultiplier={1.3} style={[styles.skipText, { color: C.ink500 }]}>Skip tour</Text>
              </Tap>
            </View>
            <View
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Step ${index + 1} of ${total}. ${step.title}. ${step.body}`}
              style={styles.copy}
            >
              <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: C.ink900 }]}>{step.title}</Text>
              <Text maxFontSizeMultiplier={1.3} style={[styles.body, { color: C.ink700 }]}>{step.body}</Text>
            </View>
            <View style={styles.footer}>
              <View style={styles.dots}>
                {Array.from({ length: total }, (_, i) => (
                  <View
                    key={i}
                    testID="tour-dot"
                    style={[styles.dot, { backgroundColor: C.ink200 }, i === index && [styles.dotActive, { backgroundColor: C.primary }]]}
                  />
                ))}
              </View>
              <Tap
                scale
                testID="tour-next"
                style={[styles.next, { backgroundColor: C.primary }]}
                onPress={onNext}
                accessibilityRole="button"
                accessibilityLabel={isLast ? 'Done' : 'Next'}
              >
                <Text maxFontSizeMultiplier={1.3} style={[styles.nextText, { color: C.onPrimary }]}>
                  {isLast ? 'Done' : 'Next'}
                </Text>
              </Tap>
            </View>
          </View>
          {/* A small pill under the card, centred, so the hint reads over the dimmed page. Taps pass through it. */}
          <View testID="tour-hint" pointerEvents="none" style={styles.hintPill}>
            <Text maxFontSizeMultiplier={1.3} style={styles.hint}>
              Tap anywhere to continue
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  ring: { position: 'absolute', borderWidth: 2, borderColor: '#ffffff' },
  block: { position: 'absolute', gap: 10 },
  card: {
    borderRadius: 18,
    padding: 16,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  skipText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18 },
  copy: { gap: 6 },
  title: { fontFamily: 'Inter', fontSize: 18, fontWeight: '700', lineHeight: 24 },
  body: { fontFamily: 'Inter', fontSize: 15, lineHeight: 22 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24 },
  next: { minHeight: 48, minWidth: 96, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600' },
  hintPill: {
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: HINT_PILL,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  hint: { fontFamily: 'Inter', fontSize: 12, lineHeight: 16, textAlign: 'center', color: '#ffffff' },
});
