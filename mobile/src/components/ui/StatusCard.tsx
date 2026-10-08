import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CalendarCheck, CircleCheck, CircleX, Hourglass, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type StatusCardTone = 'attention' | 'booked' | 'action' | 'done' | 'closed';
export type StatusCardProps = {
  tone: StatusCardTone; overline: string; title: string; body?: string; children?: ReactNode;
};

const ICONS: Record<StatusCardTone, LucideIcon> = {
  attention: Hourglass, booked: CalendarCheck, action: CircleCheck, done: ShieldCheck, closed: CircleX,
};

/** Where a job stands, in one card. A child (an inline link or button) sits under the body and keeps its own focus. */
export default function StatusCard({ tone, overline, title, body, children }: StatusCardProps) {
  const { s, tones } = useThemedStyles(createStyles);
  const t = tones[tone];
  const Icon = ICONS[tone];
  const label = [overline, title, body].filter(Boolean).join('. ');
  return (
    <View style={[s.card, { backgroundColor: t.bg, borderColor: t.border }]}
      accessible={!children} accessibilityLabel={children ? undefined : label}>
      <View style={s.overlineRow}>
        <Icon size={16} color={t.fg} />
        <Text style={[s.overline, { color: t.fg }]} numberOfLines={1}>{overline}</Text>
      </View>
      <Text style={s.title}>{title}</Text>
      {!!body && <Text style={s.body}>{body}</Text>}
      {children}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: { gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1 },
    overlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    overline: {
      flexShrink: 1, fontFamily: 'Inter', fontSize: 10, fontWeight: '700', lineHeight: 14,
      letterSpacing: 0.6, textTransform: 'uppercase',
    },
    title: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    body: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: V6Colors.ink700 },
  }),
  tones: {
    attention: { bg: Colors.warningSurface, border: Colors.warningBorder, fg: Colors.warningText },
    booked: { bg: Colors.successSurface, border: Colors.successBorder, fg: Colors.successText },
    action: { bg: Colors.primaryTonal, border: Colors.primaryTonal, fg: Colors.primaryDeep },
    done: { bg: Colors.successSurface, border: Colors.successBorder, fg: Colors.successText },
    closed: { bg: Colors.skeleton, border: V6Colors.line, fg: V6Colors.ink700 },
  } as Record<StatusCardTone, { bg: string; border: string; fg: string }>,
});
