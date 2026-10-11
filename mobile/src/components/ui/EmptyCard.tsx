import React, { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type EmptyCardProps = { children: ReactNode; testID?: string };

/**
 * The card an empty list, or a failed load that leaves nothing to show, sits in: the same surface,
 * hairline border and 16 dp radius the client screens use. Put an EmptyRow inside it.
 */
export default function EmptyCard({ children, testID = 'empty-card' }: EmptyCardProps) {
  const { s } = useThemedStyles(createStyles);
  return <View testID={testID} style={s.card}>{children}</View>;
}

const createStyles = ({ V6Colors }: Palette) => ({
  s: StyleSheet.create({
    card: {
      backgroundColor: V6Colors.surface, borderWidth: 1, borderColor: V6Colors.line,
      borderRadius: 16, paddingHorizontal: 16,
    },
  }),
});
