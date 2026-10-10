import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from '../ui/Tap';

export type ReviewRowProps = {
  label: string;
  /** The value as text. Leave it out for a row whose content is `children`, such as photos. */
  value?: string;
  /** Bold value, for the figure that matters most. */
  strong?: boolean;
  /** The first row of the card has no divider above it. */
  first?: boolean;
  /** Jumps to the step that holds this answer. Left out where the answer cannot be edited. */
  onEdit?: () => void;
  children?: ReactNode;
};

/** One answer on the review: its name, what was entered, and an Edit link back to the step. */
export default function ReviewRow({ label, value, strong = false, first = false, onEdit, children }: ReviewRowProps) {
  const { s } = useThemedStyles(createStyles);
  return (
    <View style={[s.row, !first && s.divider]}>
      <View style={s.body}>
        <Text style={s.label}>{label}</Text>
        {value !== undefined && <Text style={[s.value, strong && s.strong]}>{value}</Text>}
        {children}
      </View>
      {!!onEdit && (
        <Tap
          onPress={onEdit}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${label}`}
        >
          <Text style={s.edit}>Edit</Text>
        </Tap>
      )}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors }: Palette) => ({
  s: StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
    divider: { borderTopWidth: 1, borderTopColor: V6Colors.hairline },
    body: { flex: 1, gap: 2 },
    label: { fontFamily: 'Inter', fontSize: 13, fontWeight: '500', lineHeight: 18, color: V6Colors.ink500 },
    value: { fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 21, color: V6Colors.ink900 },
    strong: { fontWeight: '700' },
    edit: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: Colors.link, paddingTop: 1 },
  }),
});
