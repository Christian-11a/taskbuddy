import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type LucideIcon, Trash2 } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import type { NotificationTone } from '../../lib/notificationPresentation';
import Tap from './Tap';

export type NotificationCardProps = {
  title: string;
  body: string;
  time: string;
  tone: NotificationTone;
  icon: LucideIcon;
  unread: boolean;
  /** Marking read is in flight: the card dims and cannot be tapped. */
  pending?: boolean;
  onPress: () => void;
  onDelete: () => void;
};

/**
 * One notification: a solid circle holding a white icon (its colour says the
 * kind of outcome), the title with a dot while unread, one line of body, when
 * it happened, and a delete button. Tapping the card opens what it is about.
 */
export default function NotificationCard({
  title, body, time, tone, icon: Icon, unread, pending = false, onPress, onDelete,
}: NotificationCardProps) {
  const { s, tones, dot, deleteIcon } = useThemedStyles(createStyles);
  const colors = tones[tone];
  return (
    <Tap
      style={[s.card, pending && s.pending]}
      onPress={onPress}
      disabled={pending}
      activeOpacity={0.85}
      scale
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}. ${time}${unread ? '. Unread' : ''}`}
    >
      <View testID="notification-tile" style={[s.tile, { backgroundColor: colors.background }]}>
        <Icon size={22} color={colors.icon} strokeWidth={2.25} />
      </View>
      <View style={s.text}>
        <View style={s.titleRow}>
          <Text style={[s.title, unread && s.titleUnread]} numberOfLines={2}>{title}</Text>
          {unread && <View accessible={false} style={[s.dot, { backgroundColor: dot }]} testID="unread-dot" />}
        </View>
        <Text style={s.body} numberOfLines={1}>{body}</Text>
        <Text style={s.time}>{time}</Text>
      </View>
      <Tap
        onPress={onDelete}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={`Delete notification: ${title}`}
        style={s.delete}
      >
        <Trash2 size={16} color={deleteIcon} />
      </Tap>
    </Tap>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line,
      borderRadius: 16, padding: 14,
    },
    pending: { opacity: 0.6 },
    tile: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    text: { flex: 1, gap: 2 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900 },
    titleUnread: { fontWeight: '700' },
    dot: { width: 8, height: 8, borderRadius: 4 },
    body: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: V6Colors.ink700 },
    time: { fontFamily: 'Inter', fontSize: 12, lineHeight: 16, color: V6Colors.ink500, marginTop: 2 },
    delete: { alignSelf: 'center', padding: 4 },
  }),
  // Each tone is a solid circle. onPrimary is white in every palette, and the
  // three solids keep at least 4.5:1 against it in light, dark and provider navy.
  tones: {
    info: { background: Colors.primary, icon: Colors.onPrimary },
    success: { background: Colors.successSolid, icon: Colors.onPrimary },
    danger: { background: Colors.dangerSolid, icon: Colors.onPrimary },
  } satisfies Record<NotificationTone, { background: string; icon: string }>,
  dot: Colors.link,
  deleteIcon: V6Colors.ink500,
});
