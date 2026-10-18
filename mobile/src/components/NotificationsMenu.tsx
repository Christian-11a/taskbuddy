/**
 * NotificationsMenu.tsx
 *
 * The ⋯ button in a notifications header (both roles). It opens a small menu
 * with "Mark all read" (only while something is unread) and "Clear all".
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CheckCheck, MoreHorizontal, Trash2 } from 'lucide-react-native';
import Tap from './ui/Tap';
import { useHeaderTop } from '../hooks/useHeaderTop';

interface Props {
  canMarkAllRead: boolean;
  onMarkAllRead: () => void;
  onClearAll: () => void;
}

export default function NotificationsMenu({ canMarkAllRead, onMarkAllRead, onClearAll }: Props) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const headerTop = useHeaderTop();
  const [open, setOpen] = useState(false);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <>
      <Tap
        style={styles.button}
        onPress={() => setOpen(true)}
        hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
        accessibilityRole="button"
        accessibilityLabel="More actions"
      >
        <MoreHorizontal size={20} color={V6Colors.ink700} />
      </Tap>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessible={false}>
          <View style={[styles.menu, { top: headerTop + 44 }]}>
            {canMarkAllRead && (
              <Tap style={styles.item} onPress={choose(onMarkAllRead)} accessibilityRole="button" accessibilityLabel="Mark all read">
                <CheckCheck size={18} color={V6Colors.ink700} />
                <Text style={styles.itemText}>Mark all read</Text>
              </Tap>
            )}
            <Tap style={styles.item} onPress={choose(onClearAll)} accessibilityRole="button" accessibilityLabel="Clear all notifications">
              <Trash2 size={18} color={V6Colors.ink700} />
              <Text style={styles.itemText}>Clear all</Text>
            </Tap>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { V6Colors } = theme;
  const styles = StyleSheet.create({
    button: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line,
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    backdrop: { flex: 1 },
    menu: {
      position: 'absolute', right: 16, minWidth: 190, paddingVertical: 6,
      backgroundColor: V6Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: V6Colors.line,
      elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    },
    item: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
    itemText: { color: V6Colors.ink900, fontSize: 15, fontWeight: '600', fontFamily: 'Inter' },
  });
  return { V6Colors, styles };
}
