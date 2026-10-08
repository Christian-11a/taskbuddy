import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CircleX, ShieldCheck, TriangleAlert, WifiOff, type LucideIcon } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from './Tap';

export type BannerTone = 'info' | 'warning' | 'error' | 'offline';
export type BannerProps = {
  tone: BannerTone; message: string; actionLabel?: string; onAction?: () => void;
};

const ICONS: Record<BannerTone, LucideIcon> = {
  info: ShieldCheck, warning: TriangleAlert, error: CircleX, offline: WifiOff,
};

/** A notice inside a screen: what happened, and at most one thing the person can do about it. */
export default function Banner({ tone, message, actionLabel, onAction }: BannerProps) {
  const { s, tones } = useThemedStyles(createStyles);
  const t = tones[tone];
  const Icon = ICONS[tone];
  return (
    <View style={[s.row, { backgroundColor: t.bg, borderColor: t.border }]}
      accessibilityRole={tone === 'info' ? undefined : 'alert'} accessibilityLiveRegion="polite">
      <Icon size={18} color={t.fg} />
      <Text style={[s.message, { color: t.fg }]}>{message}</Text>
      {!!actionLabel && !!onAction && (
        <Tap onPress={onAction} hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel={actionLabel}>
          <Text style={[s.action, { color: t.action }]}>{actionLabel}</Text>
        </Tap>
      )}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14,
      borderRadius: 14, borderWidth: 1,
    },
    message: { flex: 1, fontFamily: 'Inter', fontSize: 13, lineHeight: 18 },
    action: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  }),
  tones: {
    info: { bg: Colors.primaryTonal, border: Colors.primaryTonal, fg: Colors.primaryDeep, action: Colors.link },
    warning: { bg: Colors.warningSurface, border: Colors.warningBorder, fg: Colors.warningText, action: Colors.link },
    error: { bg: Colors.dangerSurface, border: Colors.dangerBorder, fg: Colors.dangerText, action: Colors.link },
    offline: { bg: Colors.skeleton, border: V6Colors.line, fg: V6Colors.ink700, action: V6Colors.ink700 },
  } as Record<BannerTone, { bg: string; border: string; fg: string; action: string }>,
});
