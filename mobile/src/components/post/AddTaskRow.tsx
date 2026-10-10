import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import Tap from '../ui/Tap';

export type AddTaskRowProps = {
  value: string;
  onChangeText: (text: string) => void;
  /** Adds the typed task; the screen owns the rules (no blanks, no duplicates, the cap). */
  onSubmit: () => void;
  maxLength?: number;
};

/** The last row of the task list: a dashed row to type one more task into. */
export default function AddTaskRow({ value, onChangeText, onSubmit, maxLength = 120 }: AddTaskRowProps) {
  const { s, c, appearance } = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const ready = value.trim().length > 0;
  return (
    <View style={[s.row, focused && s.rowFocused]}>
      <Plus size={18} color={c.link} />
      <TextInput
        keyboardAppearance={appearance}
        style={s.input}
        placeholder="Add your own task"
        placeholderTextColor={c.placeholder}
        accessibilityLabel="Add your own task"
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmit}
        returnKeyType="done"
        maxLength={maxLength}
      />
      {ready && (
        <Tap
          onPress={onSubmit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Add task"
        >
          <Text style={s.add}>Add</Text>
        </Tap>
      )}
    </View>
  );
}

const createStyles = ({ Colors, V6Colors, appearance }: Palette) => ({
  s: StyleSheet.create({
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14,
      borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: V6Colors.fieldBorder,
      backgroundColor: V6Colors.surface,
    },
    rowFocused: { borderStyle: 'solid', borderColor: Colors.link },
    input: { flex: 1, fontFamily: 'Inter', fontSize: 15, lineHeight: 20, color: V6Colors.ink900, paddingVertical: 12 },
    add: { fontFamily: 'Inter', fontSize: 15, fontWeight: '700', color: Colors.link },
  }),
  c: { link: Colors.link, placeholder: V6Colors.ink500 },
  appearance,
});
