import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Spacing, V6Radii } from '../constants/theme';
import Pulse from './ui/Pulse';

const Radii = { card: V6Radii.card };

type SkeletonVariant = 'dashboard' | 'list' | 'detail';

export default function ScreenSkeleton({ variant = 'list' }: { variant?: SkeletonVariant }) {
  const { styles, V6Colors } = useThemedStyles(createThemedStyles);
  const cards = variant === 'dashboard' ? 3 : variant === 'detail' ? 4 : 5;
  return (
    <Pulse style={styles.screen}>
      <View style={styles.fill} accessibilityLabel="Loading content">
        <View style={[styles.block, styles.header]} />
        <View style={styles.content}>
          {variant === 'dashboard' && <View style={[styles.block, styles.heroCard]} />}
          <View style={[styles.block, styles.title]} />
          {Array.from({ length: cards }).map((_, index) => (
            <View key={index} style={[styles.block, variant === 'detail' ? styles.detailRow : styles.card]}>
              <View style={[styles.line, { width: index % 2 ? '58%' : '76%' }]} />
              <View style={styles.subline} />
            </View>
          ))}
        </View>
      </View>
    </Pulse>
  );
}

function createThemedStyles(theme: ThemePalette) {
  const { V6Colors } = theme;
  const Colors = { ...V6Colors, background: V6Colors.canvas } as const;
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: Colors.background },
    fill: { flex: 1 },
    content: { padding: Spacing.screenH, gap: 12 },
    block: { backgroundColor: V6Colors.skeleton, overflow: 'hidden' },
    header: { height: 190, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, backgroundColor: V6Colors.primaryTonal },
    heroCard: { height: 128, borderRadius: Radii.card, marginTop: -44, marginBottom: 12 },
    title: { height: 20, width: '42%', borderRadius: 8, marginBottom: 4 },
    card: { height: 100, borderRadius: Radii.card, padding: 16, gap: 12 },
    detailRow: { height: 62, borderRadius: 12, padding: 14, gap: 10 },
    line: { height: 14, borderRadius: 7, backgroundColor: V6Colors.ink100 },
    subline: { height: 10, width: '38%', borderRadius: 5, backgroundColor: V6Colors.ink100 },
  });
  return { Colors, V6Colors, styles };
}
