import React, { useEffect } from 'react';
import { View } from 'react-native';
import LottieView from 'lottie-react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { haptic } from './motion';

/**
 * Rare success moment (the "Job Posted!" screen): a check that
 * draws itself once (~0.8 s) with a paired success haptic. Never blocks or
 * delays anything on the screen. Reduced motion shows the static fallback.
 */
export default function SuccessMark({ size = 100, fallback }: { size?: number; fallback: React.ReactNode }) {
  const reduced = useReducedMotion();
  useEffect(() => { haptic.success(); }, []);
  if (reduced) return <>{fallback}</>;
  return (
    <View accessible accessibilityLabel="Success">
      <LottieView
        source={require('../../../assets/lottie/success-check.json')}
        autoPlay
        loop={false}
        style={{ width: size, height: size }}
      />
    </View>
  );
}
