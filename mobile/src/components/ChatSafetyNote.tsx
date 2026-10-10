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
      <View style={styles.titleRow}>
        <ShieldCheck size={16} color={Colors.primaryDeep} />
        <Text style={styles.title}>Stay protected</Text>
      </View>
      <Text style={styles.body}>{COPY}</Text>
      <View style={styles.actionRow}>
        <Tap
          onPress={dismiss}
          // The 15 dp slop above and below brings the text link to 48 dp.
          hitSlop={{ top: 15, bottom: 15, left: 8, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel="Got it"
        >
          <Text style={styles.gotIt}>Got it</Text>
        </Tap>
      </View>
    </View>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    note: {
      marginHorizontal: 16, marginTop: 12, padding: 14, gap: 6,
      borderRadius: 16, backgroundColor: Colors.primaryTonal,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { color: Colors.primaryDeep, fontSize: 14, fontWeight: '700', lineHeight: 18, fontFamily: 'Inter' },
    body: { color: V6Colors.ink700, fontSize: 13.5, lineHeight: 19, fontFamily: 'Inter' },
    actionRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    gotIt: { color: Colors.link, fontSize: 13, fontWeight: '600', lineHeight: 18, fontFamily: 'Inter' },
  });
  return { Colors, V6Colors, styles };
}
