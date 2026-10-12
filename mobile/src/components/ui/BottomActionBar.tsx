import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';

export type BottomActionBarProps = {
  primaryLabel: string; onPrimary: () => void; primaryDisabled?: boolean; busy?: boolean;
  tone?: 'default' | 'danger'; secondaryLabel?: string; onSecondary?: () => void;
};

/** A screen's main action pinned to the bottom, with an optional text action under it. Clears the home indicator. */
export default function BottomActionBar({
  primaryLabel, onPrimary, primaryDisabled = false, busy = false, tone = 'default', secondaryLabel, onSecondary,
}: BottomActionBarProps) {
  const { s, c } = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const disabled = busy || primaryDisabled;
  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <Tap style={[s.primary, { backgroundColor: tone === 'danger' ? c.danger : c.primary }, disabled && s.disabled]}
        scale onPress={onPrimary} disabled={disabled} hitSlop={{ top: 1, bottom: 1 }}
        accessibilityRole="button" accessibilityLabel={primaryLabel} accessibilityState={{ disabled }}>
        {busy ? <ActivityIndicator color={c.onPrimary} /> : <Text style={s.primaryLabel}>{primaryLabel}</Text>}
      </Tap>
      {!!secondaryLabel && onSecondary && (
        // The 8 dp top slop fills the gap above the text, so it never takes presses from the primary button.
        <Tap onPress={onSecondary} disabled={busy} style={busy && s.disabled}
          hitSlop={{ top: 8, bottom: 22, left: 12, right: 12 }}
          accessibilityRole="button" accessibilityLabel={secondaryLabel} accessibilityState={{ disabled: busy }}>
          <Text style={s.secondary}>{secondaryLabel}</Text>
        </Tap>
      )}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    bar: {
      alignItems: 'center', gap: 8, paddingTop: 12, paddingHorizontal: 20, borderTopWidth: 1,
      borderTopColor: V6Colors.line, backgroundColor: V6Colors.surface,
    },
    primary: { alignSelf: 'stretch', height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    disabled: { opacity: 0.5 },
    primaryLabel: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: Colors.onPrimary },
    secondary: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: Colors.link },
  }),
  c: { primary: Colors.primary, danger: Colors.dangerSolid, onPrimary: Colors.onPrimary },
});
