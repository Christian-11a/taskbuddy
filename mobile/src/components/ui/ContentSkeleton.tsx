import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import Pulse from './Pulse';

type Variant = 'detail' | 'list' | 'chat';

/**
 * In-place loading placeholder shaped like the content that is coming, so
 * the screen doesn't jump when it arrives. Replaces bare spinners; the
 * loading condition around it is unchanged.
 */
export default function ContentSkeleton({ variant = 'list' }: { variant?: Variant }) {
  const { palette } = useTheme();
  const C = palette.V6Colors;
  const block = { backgroundColor: C.skeleton };
  const card = { backgroundColor: C.surface, borderColor: C.line };

  if (variant === 'chat') {
    return (
      <Pulse style={styles.chat}>
        {[0.62, 0.48, 0.7, 0.4].map((w, i) => (
          <View
            key={i}
            style={[styles.bubble, block, { width: `${w * 100}%`, alignSelf: i % 2 ? 'flex-end' : 'flex-start' }]}
          />
        ))}
      </Pulse>
    );
  }

  if (variant === 'detail') {
    return (
      <Pulse style={styles.detail}>
        <View style={[styles.line, block, { width: '28%', height: 12 }]} />
        <View style={[styles.line, block, { width: '82%', height: 22 }]} />
        <View style={[styles.line, block, { width: '36%', height: 28, marginBottom: 24 }]} />
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.row}>
            <View style={[styles.icon, block]} />
            <View style={styles.rowText}>
              <View style={[styles.line, block, { width: '30%', height: 10 }]} />
              <View style={[styles.line, block, { width: i === 1 ? '90%' : '60%' }]} />
            </View>
          </View>
        ))}
      </Pulse>
    );
  }

  return (
    <Pulse style={styles.list}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.card, card]}>
          <View style={[styles.line, block, { width: i % 2 ? '55%' : '72%' }]} />
          <View style={[styles.line, block, { width: '45%', height: 10 }]} />
          <View style={[styles.line, block, { width: '30%', height: 22, borderRadius: 11 }]} />
        </View>
      ))}
    </Pulse>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 8 },
  card: { borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 12, gap: 12 },
  detail: { paddingTop: 20, paddingHorizontal: 20 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  rowText: { flex: 1, gap: 8 },
  icon: { width: 32, height: 32, borderRadius: 10 },
  line: { height: 14, borderRadius: 7, marginBottom: 8 },
  chat: { padding: 16, gap: 12 },
  bubble: { height: 40, borderRadius: 18 },
});
