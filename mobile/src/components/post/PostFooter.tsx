import React from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import { bottomBarPadding } from '../../lib/bottomBarPadding';
import Tap from '../ui/Tap';

export type PostFooterProps = {
  /** Left out on the first step, where Next takes the full width. */
  onBack?: () => void;
  backDisabled?: boolean;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  /** The step is waiting on something; Next shows a spinner and cannot be pressed. */
  busy?: boolean;
};

/** The job form's bottom bar: a tonal Back beside a primary Next. Clears the home indicator and the Android navigation bar. */
export default function PostFooter({
  onBack, backDisabled = false, onNext, nextLabel, nextDisabled = false, busy = false,
}: PostFooterProps) {
  const { s, c } = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const nextOff = nextDisabled || busy;
  return (
    <View testID="post-footer" style={[s.bar, { paddingBottom: bottomBarPadding(insets.bottom, Platform.OS) }]}>
      {!!onBack && (
        <Tap
          style={[s.back, backDisabled && s.off]}
          onPress={onBack}
          disabled={backDisabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Back to the previous step"
          accessibilityState={{ disabled: backDisabled }}
        >
          <Text style={s.backLabel}>Back</Text>
        </Tap>
      )}
      <Tap
        style={[s.next, nextOff && s.off]}
        onPress={onNext}
        disabled={nextOff}
        scale
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: nextOff, busy }}
      >
        <View style={s.nextInner}>
          {busy && <ActivityIndicator size="small" color={c.onPrimary} />}
          <Text style={s.nextLabel}>{nextLabel}</Text>
        </View>
      </Tap>
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    bar: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingHorizontal: 20,
      backgroundColor: V6Colors.surface, borderTopWidth: 1, borderTopColor: V6Colors.line,
    },
    back: {
      minWidth: 96, minHeight: 48, paddingHorizontal: 16, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryTonal,
    },
    backLabel: { fontFamily: 'Inter', fontSize: 15, fontWeight: '700', lineHeight: 20, color: Colors.primaryDeep },
    next: {
      flex: 1, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.primary,
    },
    nextInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    nextLabel: { fontFamily: 'Inter', fontSize: 15, fontWeight: '700', lineHeight: 20, color: Colors.onPrimary },
    off: { opacity: 0.5 },
  }),
  c: { onPrimary: Colors.onPrimary },
});
