import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ShieldCheck, Trash2, type LucideIcon } from 'lucide-react-native';
import Tap from './ui/Tap';
import SheetFrame from './ui/SheetFrame';

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** A notice with one OK button: no cancel action. */
  hideCancel?: boolean;
  busy?: boolean;
  /** Red confirm button, for actions that discard or reject something. */
  destructive?: boolean;
  /** Red cancel text, for a second action that discards something. */
  cancelTone?: 'default' | 'danger';
  /** Icon in the header circle. Defaults to a shield, or a bin when destructive. */
  icon?: LucideIcon;
  onConfirm: () => void;
  onCancel: () => void;
  /** Back and a backdrop tap. Defaults to onCancel. */
  onDismiss?: () => void;
}

/**
 * Reusable confirmation for short yes/no questions with no fields. Opens as a
 * centered dialog. Back and a backdrop tap dismiss (onDismiss, else onCancel),
 * and both are locked while `busy`. Anything with fields or choices belongs in
 * a bottom sheet instead.
 */
export default function ConfirmationModal({
  visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', hideCancel = false, busy = false, destructive = false, cancelTone = 'default', icon, onConfirm, onCancel, onDismiss,
}: ConfirmationModalProps) {
  const { styles, tones, onPrimary } = useThemedStyles(createThemedStyles);
  const tone = destructive ? tones.destructive : tones.default;
  const Icon = icon ?? (destructive ? Trash2 : ShieldCheck);
  return (
    <SheetFrame visible={visible} onClose={busy ? undefined : (onDismiss ?? onCancel)} variant="dialog" contentStyle={styles.dialog} cardProps={{ accessibilityRole: 'alert' }}>
      <View style={[styles.iconCircle, { backgroundColor: tone.surface }]} testID="confirm-icon-circle">
        <Icon size={22} color={tone.icon} />
      </View>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Tap
        style={[styles.confirmButton, destructive && styles.confirmButtonDestructive]}
        onPress={onConfirm}
        disabled={busy}
        scale
        hitSlop={{ top: 1, bottom: 1 }}
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
      >
        {busy
          ? <ActivityIndicator color={onPrimary} testID="confirm-spinner" />
          : <Text style={styles.confirmText}>{confirmLabel}</Text>}
      </Tap>
      {!hideCancel && <Tap
        style={styles.cancelButton}
        onPress={onCancel}
        disabled={busy}
        hitSlop={{ top: 7, bottom: 7, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
      >
        <Text style={[styles.cancelText, cancelTone === 'danger' && styles.cancelTextDanger]}>{cancelLabel}</Text>
      </Tap>}
    </SheetFrame>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    // Centered dialog (no grip), so the padding is even on all sides.
    dialog: { gap: 14, padding: 24 },
    iconCircle: {
      width: 48, height: 48, borderRadius: 24, alignSelf: 'center',
      alignItems: 'center', justifyContent: 'center',
    },
    title: {
      fontFamily: 'Inter', fontSize: 20, fontWeight: '700', lineHeight: 26, textAlign: 'center', color: V6Colors.ink900,
    },
    message: {
      fontFamily: 'Inter', fontSize: 15, fontWeight: '400', lineHeight: 22, textAlign: 'center', color: V6Colors.ink700,
    },
    // Visible height is 46; the 1 dp hitSlop above and below brings the touch area to 48.
    confirmButton: {
      height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary,
    },
    confirmButtonDestructive: { backgroundColor: Colors.dangerSolid },
    confirmText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: Colors.onPrimary },
    cancelButton: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 8 },
    cancelText: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: Colors.link },
    cancelTextDanger: { color: Colors.dangerText },
  });
  const tones = {
    default: { surface: Colors.primaryTonal, icon: Colors.link },
    destructive: { surface: Colors.dangerSurface, icon: Colors.dangerText },
  };
  return { styles, tones, onPrimary: Colors.onPrimary };
}
