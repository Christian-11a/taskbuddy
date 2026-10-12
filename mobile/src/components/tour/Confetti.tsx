/**
 * Confetti.tsx: a short burst of paper pieces for a first-time finish. It is
 * decoration only: it ignores touches, plays once each time `active` turns on,
 * and under reduced motion it is skipped entirely and reports done at once.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '../../context/ThemeContext';
import { EASE_OUT } from '../ui/motion';

const BURST_MS = 1400;
const PIECE_COUNT = 30;

export type ConfettiPiece = {
  /** Where the piece starts: across the top fifth of the screen. */
  x: number;
  y: number;
  /** Sideways and downward travel by the end of the burst, in dp. */
  drift: number;
  fall: number;
  /** Degrees turned by the end of the burst. */
  spin: number;
  size: number;
  color: string;
  round: boolean;
  /** Share of the burst to wait before this piece starts moving (0 to 0.2). */
  delay: number;
};

/** Mulberry32: a small seeded generator, so a burst can be reproduced in tests. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The pieces of one burst. `random` is injected so tests can fix the result. */
export function makeConfettiPieces({
  count = PIECE_COUNT, width, height, colors, random = Math.random,
}: {
  count?: number;
  width: number;
  height: number;
  colors: readonly string[];
  random?: () => number;
}): ConfettiPiece[] {
  const between = (min: number, max: number) => min + random() * (max - min);
  return Array.from({ length: count }, () => ({
    x: between(0, width),
    y: between(0, height * 0.2),
    drift: between(-width * 0.12, width * 0.12),
    fall: between(height * 0.4, height * 0.75),
    spin: between(-540, 540),
    size: between(6, 10),
    color: colors[Math.floor(random() * colors.length)],
    round: random() < 0.3,
    delay: between(0, 0.2),
  }));
}

type ConfettiProps = {
  active: boolean;
  /** Runs when the burst has finished, or at once under reduced motion. */
  onDone?: () => void;
};

export default function Confetti({ active, onDone }: ConfettiProps) {
  const { palette } = useTheme();
  const C = palette.V6Colors;
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  // Defined on the RN side and passed by reference: the timing callback runs on the UI
  // thread, and scheduleOnRN rejects a function created there, such as an inline arrow.
  const finishBurst = useCallback(() => {
    onDoneRef.current?.();
  }, []);

  // A new burst starts each time `active` turns on; the colours and size are read at that moment.
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      onDoneRef.current?.();
      return;
    }
    setPieces(makeConfettiPieces({
      width,
      height,
      colors: [C.primary, C.cyan500, C.successSolid, C.amber500, C.red500],
      random: Math.random,
    }));
    progress.set(0);
    progress.set(withTiming(1, { duration: BURST_MS, easing: EASE_OUT }, (finished) => {
      if (finished) scheduleOnRN(finishBurst);
    }));
    return () => cancelAnimation(progress);
  }, [active, reduced]);

  if (!active || reduced) return null;
  return (
    <View testID="confetti-layer" pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, index) => <ConfettiPieceView key={index} piece={piece} progress={progress} />)}
    </View>
  );
}

function ConfettiPieceView({ piece, progress }: { piece: ConfettiPiece; progress: SharedValue<number> }) {
  const animated = useAnimatedStyle(() => {
    const t = Math.min(1, Math.max(0, (progress.get() - piece.delay) / (1 - piece.delay)));
    return {
      // The piece fades over the last quarter of its fall, so it does not stop dead on screen.
      opacity: t < 0.75 ? 1 : (1 - t) / 0.25,
      transform: [
        { translateX: piece.drift * t },
        { translateY: piece.fall * t },
        { rotate: `${piece.spin * t}deg` },
      ],
    };
  });
  return (
    <Animated.View
      testID="confetti-piece"
      style={[
        {
          position: 'absolute',
          left: piece.x,
          top: piece.y,
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 0.5,
          borderRadius: piece.round ? piece.size / 2 : 1,
          backgroundColor: piece.color,
        },
        animated,
      ]}
    />
  );
}
