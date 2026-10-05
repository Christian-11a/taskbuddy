import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';
import { V6Radii } from '../constants/theme';

const Radii = { card: V6Radii.card };

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  /** Red confirm button, for actions that discard or reject something. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Reusable confirmation dialog for actions that require an explicit user choice. */
export default function ConfirmationModal({
  visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', busy = false, destructive = false, onConfirm, onCancel,
}: ConfirmationModalProps) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  return (
    <SheetFrame visible={visible} onClose={busy ? undefined : onCancel} variant="dialog" contentStyle={styles.dialog} cardProps={{ accessibilityRole: "alert" }}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Tap
              style={styles.cancelButton}
              onPress={onCancel}
              disabled={busy}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Tap>
            <Tap
              style={[styles.confirmButton, destructive && styles.confirmButtonDestructive]}
              onPress={onConfirm}
              disabled={busy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Tap>
          </View>
    </SheetFrame>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { V6Colors } = theme;
  const Colors = {
    ...V6Colors,
    brandDark: V6Colors.cyan900,
    brandTeal: V6Colors.cyan700,
    slate: V6Colors.ink500,
  } as const;
  const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(6, 61, 77, 0.5)' },
    dialog: { backgroundColor: Colors.surface, borderRadius: Radii.card, padding: 22, width: '100%', maxWidth: 420, alignSelf: 'center' },
    title: { color: V6Colors.ink900, fontSize: 19, fontWeight: '800', fontFamily: 'Inter', marginBottom: 8 },
    message: { color: Colors.slate, fontSize: 15, fontFamily: 'Inter', lineHeight: 21, marginBottom: 20 },
    // Two equal-width buttons: long labels ("Keep Editing" / "Discard & Exit")
    // used to push the row past the dialog edge on narrow phones.
    actions: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
    cancelButton: {
      flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42,
      borderWidth: 1, borderColor: 'rgba(144,153,184,0.45)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    },
    confirmButton: {
      flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42,
      backgroundColor: Colors.brandTeal, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    },
    confirmButtonDestructive: { backgroundColor: Colors.red700 },
    cancelText: { color: Colors.slate, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' },
    confirmText: { color: Colors.onPrimary, fontSize: 14.5, fontWeight: '700', fontFamily: 'Inter', textAlign: 'center' },
  });
  return { Colors, V6Colors, styles };
}
