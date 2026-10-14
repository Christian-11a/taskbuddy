import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../context/ThemeContext';
import Tap from './ui/Tap';
import NotificationCard, { type NotificationCardProps } from './ui/NotificationCard';

/** How long a row is held before it starts select mode. */
const LONG_PRESS_MS = 500;

interface NotificationSelectRowProps {
  selecting: boolean;
  selected: boolean;
  /** Held for a long press: start select mode with this row chosen. */
  onStartSelect: () => void;
  /** Tapped while selecting: toggle this row. */
  onToggle: () => void;
  /** The card as it shows outside select mode. Its onPress opens the notification. */
  card: NotificationCardProps;
}

/**
 * One notification row that can be selected. A long press (held LONG_PRESS_MS, without moving) starts select
 * mode; while selecting, a checkbox shows and a tap toggles the row, and the card is hidden from touch and
 * screen readers so its own delete button cannot fire.
 */
export function NotificationSelectRow({ selecting, selected, onStartSelect, onToggle, card }: NotificationSelectRowProps) {
  const { s, Colors } = useThemedStyles(createStyles);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a long press fires, so the release that ends it does not also open the notification.
  const longPressed = useRef(false);

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelTimer, []);

  return (
    <View
      style={s.row}
      onTouchStart={() => {
        longPressed.current = false;
        if (selecting) return;
        cancelTimer();
        timer.current = setTimeout(() => {
          timer.current = null;
          longPressed.current = true;
          onStartSelect();
        }, LONG_PRESS_MS);
      }}
      onTouchMove={cancelTimer}
      onTouchEnd={cancelTimer}
      onTouchCancel={cancelTimer}
    >
      {selecting && (
        <View accessible={false} style={[s.check, selected && s.checkOn]}>
          {selected && <Check size={14} color={Colors.onPrimary} strokeWidth={3} />}
        </View>
      )}
      <View
        style={s.card}
        accessibilityElementsHidden={selecting}
        importantForAccessibility={selecting ? 'no-hide-descendants' : 'auto'}
      >
        <NotificationCard
          {...card}
          onPress={() => {
            if (longPressed.current) {
              longPressed.current = false;
              return;
            }
            card.onPress();
          }}
        />
      </View>
      {selecting && (
        <Tap
          style={StyleSheet.absoluteFill}
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={card.title}
        />
      )}
    </View>
  );
}

interface NotificationSelectBarProps {
  count: number;
  deleting: boolean;
  onSelectAll: () => void;
  onCancel: () => void;
  onDelete: () => void;
}

/** The header in select mode: how many are chosen, Select all and Cancel, and the Delete button. */
export function NotificationSelectBar({ count, deleting, onSelectAll, onCancel, onDelete }: NotificationSelectBarProps) {
  const { s } = useThemedStyles(createStyles);
  // The Delete button stays put while a delete runs, but cannot be pressed again.
  return (
    <View style={s.bar}>
      <View style={s.barRow}>
        <Text style={s.count} numberOfLines={1} accessibilityLiveRegion="polite">{`${count} selected`}</Text>
        <Tap onPress={onSelectAll} hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Select all">
          <Text style={s.link}>Select all</Text>
        </Tap>
        <Tap onPress={onCancel} hitSlop={{ top: 15, bottom: 15, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Cancel selection">
          <Text style={s.link}>Cancel</Text>
        </Tap>
      </View>
      <Tap style={s.deleteBtn} onPress={onDelete} disabled={deleting} accessibilityRole="button" accessibilityLabel="Delete selected notifications">
        <Text style={s.deleteText}>Delete</Text>
      </Tap>
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    check: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: V6Colors.ink500,
      alignItems: 'center', justifyContent: 'center', backgroundColor: V6Colors.surface,
    },
    checkOn: { backgroundColor: Colors.link, borderColor: Colors.link },
    card: { flex: 1 },

    bar: { gap: 10, marginBottom: 12 },
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    count: { flex: 1, color: V6Colors.ink900, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
    link: { color: Colors.link, fontSize: 14, fontWeight: '700', fontFamily: 'Inter' },
    deleteBtn: { backgroundColor: Colors.dangerSolid, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
    deleteText: { color: Colors.onPrimary, fontSize: 15, fontWeight: '700', fontFamily: 'Inter' },
  }),
  Colors,
});
