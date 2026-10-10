import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import Tap from '../ui/Tap';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type AuthStepHeaderProps = {
  title: string;
  /** Round back button. Leave out on a screen with nowhere to go back to. */
  onBack?: () => void;
  /** Screen-reader name for the back button, e.g. "Back to sign in". */
  backLabel?: string;
  /** Segmented progress under the title, as on the Post a job form. */
  progress?: { step: number; total: number; label: string };
};

/**
 * Top bar for the multi-step sign-up and reset flows: a round back button, the
 * screen name, and (optionally) the same segmented progress the job form uses.
 */
export default function AuthStepHeader({ title, onBack, backLabel = 'Go back', progress }: AuthStepHeaderProps) {
  const { styles, Colors, V6Colors } = useThemedStyles(createStyles);
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        {onBack ? (
          <Tap
            style={styles.back}
            onPress={onBack}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
          >
            <ArrowLeft size={20} color={V6Colors.ink800} />
          </Tap>
        ) : null}
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
      </View>
      {progress ? (
        <View
          style={styles.progress}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Step ${progress.step} of ${progress.total}: ${progress.label}`}
        >
          <View style={styles.bars}>
            {Array.from({ length: progress.total }, (_, i) => (
              <View
                key={i}
                style={[styles.segment, { backgroundColor: i < progress.step ? Colors.primary : V6Colors.ink100 }]}
              />
            ))}
          </View>
          <Text style={styles.caption}>{`STEP ${progress.step} OF ${progress.total} · ${progress.label.toUpperCase()}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: Palette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    wrap: { marginBottom: 20 },
    bar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    back: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: V6Colors.surface,
      borderWidth: 1,
      borderColor: V6Colors.line,
    },
    title: { flex: 1, fontFamily: 'Inter', fontSize: 18, fontWeight: '700', lineHeight: 24, color: V6Colors.ink900 },
    progress: { gap: 8, marginTop: 16 },
    bars: { flexDirection: 'row', gap: 6 },
    segment: { flex: 1, height: 5, borderRadius: 3 },
    caption: {
      fontFamily: 'Inter', fontSize: 12, fontWeight: '700', lineHeight: 16, letterSpacing: 0.6, color: Colors.link,
    },
  });
  return { styles, Colors, V6Colors };
}
