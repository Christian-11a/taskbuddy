import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors, Radii, Spacing } from '../constants/theme';

type SkeletonVariant = 'dashboard' | 'list' | 'detail';

export default function ScreenSkeleton({ variant = 'list' }: { variant?: SkeletonVariant }) {
  const cards = variant === 'dashboard' ? 3 : variant === 'detail' ? 4 : 5;
  return (
    <View style={styles.screen} accessibilityLabel="Loading content">
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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.screenH, gap: 12 },
  block: { backgroundColor: '#E2E8F0', overflow: 'hidden' },
  header: { height: 190, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroCard: { height: 128, borderRadius: Radii.card, marginTop: -44, marginBottom: 12 },
  title: { height: 20, width: '42%', borderRadius: 8, marginBottom: 4 },
  card: { height: 100, borderRadius: Radii.card, padding: 16, gap: 12 },
  detailRow: { height: 62, borderRadius: 12, padding: 14, gap: 10 },
  line: { height: 14, borderRadius: 7, backgroundColor: '#CBD5E1' },
  subline: { height: 10, width: '38%', borderRadius: 5, backgroundColor: '#CBD5E1' },
});
