import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import SheetFrame from './SheetFrame';
import Tap from './Tap';

export type MenuSheetItem = {
  label: string;
  icon: LucideIcon;
  tone?: 'default' | 'danger';
  /** A line under a danger row, saying what the action does to money or to the other person. */
  hint?: string;
  /** Dimmed and not pressable, e.g. while another action on the screen is still running. */
  disabled?: boolean;
  onPress: () => void;
};

export type MenuSheetProps = {
  visible: boolean;
  title: string;
  items: MenuSheetItem[];
  onClose: () => void;
};

/**
 * The ⋮ menu of a screen: the rare or risky actions, listed under the screen's
 * title. Picking a row closes the sheet first, then runs that row's action.
 */
export default function MenuSheet({ visible, title, items, onClose }: MenuSheetProps) {
  const { s, c } = useThemedStyles(createStyles);
  return (
    <SheetFrame visible={visible} onClose={onClose} variant="sheet" contentStyle={s.content}>
      <Text style={s.title} accessibilityRole="header" numberOfLines={2}>{title}</Text>
      {items.map((item) => {
        const Icon = item.icon;
        const danger = item.tone === 'danger';
        return (
          <View key={item.label}>
            <Tap
              style={[s.row, item.disabled && s.rowDisabled]}
              disabled={item.disabled}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityHint={item.hint}
            >
              <Icon size={20} color={danger ? c.danger : c.ink700} />
              <Text style={[s.label, { color: danger ? c.danger : c.ink900 }]} numberOfLines={1}>
                {item.label}
              </Text>
              {!danger && <ChevronRight size={18} color={c.ink400} />}
            </Tap>
            {danger && !!item.hint && <Text style={s.hint}>{item.hint}</Text>}
          </View>
        );
      })}
    </SheetFrame>
  );
}

const createStyles = ({ V6Colors }: Palette) => ({
  s: StyleSheet.create({
    content: { gap: 2, paddingHorizontal: 20, paddingTop: 4 },
    title: { fontFamily: 'Inter', fontSize: 15, fontWeight: '600', lineHeight: 20, color: V6Colors.ink900, marginBottom: 6 },
    row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowDisabled: { opacity: 0.5 },
    label: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20 },
    hint: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: V6Colors.ink500, paddingLeft: 32, paddingBottom: 10 },
  }),
  c: {
    danger: V6Colors.dangerText,
    ink900: V6Colors.ink900,
    ink700: V6Colors.ink700,
    ink500: V6Colors.ink500,
    ink400: V6Colors.ink400,
  },
});
