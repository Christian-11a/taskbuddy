/**
 * ChatSafetyNote.tsx
 *
 * The payment reminder pinned under a chat's header, for both roles. The
 * device's choice is read once per app session. Until that answer is known the
 * note stays hidden, so a dismissed note never flashes, and a chat opened
 * again in the same session shows or hides it at once. "Got it" hides it and
 * the choice is remembered on this device (see chatSafetyNote.ts).
 */

import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import Tap from './ui/Tap';
import {
  knownSafetyNoteDismissed,
  rememberedSafetyNoteDismissed,
  saveSafetyNoteDismissed,
} from '../lib/chatSafetyNote';

const COPY = "Keep payments in TaskBuddy. Money paid outside the app isn't protected, and TaskBuddy can't refund it.";

export default function ChatSafetyNote() {
  const { styles, Colors } = useThemedStyles(createThemedStyles);
  // null until this session has read the device; then the answer it already holds.
  const [dismissed, setDismissed] = useState<boolean | null>(() => knownSafetyNoteDismissed());

  useEffect(() => {
    if (dismissed !== null) return undefined;
    let live = true;
    void rememberedSafetyNoteDismissed().then((value) => {
      if (live) setDismissed(value);
    });
    return () => {
      live = false;
    };
  }, [dismissed]);

  if (dismissed !== false) return null;

  const dismiss = () => {
    setDismissed(true);
    void saveSafetyNoteDismissed();
  };

  return (
    <View style={styles.note}>
      <ShieldCheck size={16} color={Colors.primaryDeep} />
      <View style={styles.textCol}>
        <Text style={styles.title}>Stay protected</Text>
        <Text style={styles.body} numberOfLines={2}>{COPY}</Text>
      </View>
      <Tap
        onPress={dismiss}
        // 44 dp tall hit area around the text link.
        hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Got it"
      >
        <Text style={styles.gotIt}>Got it</Text>
      </Tap>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    note: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      marginHorizontal: 16, marginTop: 8, paddingVertical: 8, paddingHorizontal: 12,
      borderRadius: 14, backgroundColor: Colors.primaryTonal,
    },
    textCol: { flex: 1, gap: 1 },
    title: { color: Colors.primaryDeep, fontSize: 13, fontWeight: '700', lineHeight: 17, fontFamily: 'Inter' },
    body: { color: V6Colors.ink700, fontSize: 12, lineHeight: 16, fontFamily: 'Inter' },
    gotIt: { color: Colors.link, fontSize: 13, fontWeight: '700', lineHeight: 18, fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, styles };
}
