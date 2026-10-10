import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Home, Wrench } from 'lucide-react-native';
import SheetFrame from '../ui/SheetFrame';
import Tap from '../ui/Tap';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import { roleConfirmCopy, type GoogleRole } from './roleConfirm';

type RoleConfirmSheetProps = {
  visible: boolean;
  role: GoogleRole;
  /** The real Google account email, if the session has one. */
  email?: string | null;
  /** While the role is being saved: the sheet cannot be dismissed and Yes shows a spinner. */
  busy?: boolean;
  onConfirm: () => void;
  onChooseAgain: () => void;
};

/**
 * Bottom sheet that asks the person to confirm the role before it is saved,
 * because the role cannot be changed later. Back, a drag down and a backdrop
 * tap all act like "Choose again", and none of them saves.
 */
export default function RoleConfirmSheet({
  visible, role, email, busy = false, onConfirm, onChooseAgain,
}: RoleConfirmSheetProps) {
  const { styles, Colors } = useThemedStyles(createStyles);
  const copy = roleConfirmCopy(role, email);
  const Icon = role === 'provider' ? Wrench : Home;

  return (
    <SheetFrame
      visible={visible}
      onClose={busy ? undefined : onChooseAgain}
      variant="sheet"
      contentStyle={styles.content}
    >
      <View style={styles.iconTile}>
        <Icon size={22} color={Colors.link} />
      </View>
      <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>

      <Tap
        testID="role-confirm-yes"
        style={styles.confirm}
        onPress={onConfirm}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={copy.confirmLabel}
        accessibilityState={{ busy, disabled: busy }}
      >
        {busy ? <ActivityIndicator color={Colors.onPrimary} style={styles.spinner} /> : null}
        <Text style={styles.confirmText}>{copy.confirmLabel}</Text>
      </Tap>

      <Tap
        testID="role-confirm-choose-again"
        style={styles.chooseAgain}
        onPress={onChooseAgain}
        disabled={busy}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={copy.chooseAgainLabel}
      >
        <Text style={styles.chooseAgainText}>{copy.chooseAgainLabel}</Text>
      </Tap>
    </SheetFrame>
  );
}

function createStyles(theme: Palette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    content: { gap: 14, paddingHorizontal: 20, paddingTop: 4 },
    iconTile: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primaryTonal,
    },
    title: {
      fontFamily: 'Inter', fontSize: 20, fontWeight: '700', lineHeight: 26,
      textAlign: 'center', color: V6Colors.ink900,
    },
    body: {
      fontFamily: 'Inter', fontSize: 15, lineHeight: 22, textAlign: 'center', color: V6Colors.ink700,
    },
    confirm: {
      minHeight: 48,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: Colors.primary,
      paddingHorizontal: 16,
    },
    spinner: { marginRight: 8 },
    confirmText: { fontFamily: 'Inter', fontSize: 16, fontWeight: '700', color: Colors.onPrimary },
    chooseAgain: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 10 },
    chooseAgainText: { fontFamily: 'Inter', fontSize: 15, fontWeight: '700', color: Colors.link },
  });
  return { styles, Colors };
}
