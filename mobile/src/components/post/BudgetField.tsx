import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import { useRevealOnFocus } from '../ui/KeyboardAwareScrollView';

export type BudgetFieldProps = {
  /** The amount as the screen keeps it. */
  value: string;
  /** Draws the card in the error colour. Nothing is red until the screen sets this, after a Next press. */
  invalid?: boolean;
  /** Receives the typed text; the screen cleans it into the amount it keeps. */
  onChangeText: (text: string) => void;
  /** Runs after the field loses focus. The screen formats the amount here. */
  onBlur?: () => void;
};

/**
 * The job budget: a large peso amount on the When & budget step. It owns its
 * TextInput, because useRevealOnFocus only finds the KeyboardAwareScrollView
 * when it is called inside a component rendered within that scroll view. Called
 * from the screen body, the reveal did nothing and the field stayed behind the footer.
 */
export default function BudgetField({ value, invalid = false, onChangeText, onBlur }: BudgetFieldProps) {
  const { styles, V6Colors, appearance } = useThemedStyles(createThemedStyles);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const revealField = useRevealOnFocus(inputRef);
  return (
    <View style={[styles.card, focused && styles.cardFocused, invalid && styles.cardInvalid]}>
      <Text style={styles.currency}>₱</Text>
      <TextInput keyboardAppearance={appearance}
        ref={inputRef}
        style={styles.input}
        placeholder="0.00"
        placeholderTextColor={V6Colors.ink400}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          setFocused(true);
          revealField();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

function createThemedStyles({ V6Colors, appearance }: Palette) {
  const styles = StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 64, paddingHorizontal: 16,
      backgroundColor: V6Colors.surface, borderRadius: 16, borderWidth: 1.5, borderColor: V6Colors.fieldBorder,
    },
    cardFocused: { borderColor: V6Colors.link, borderWidth: 2 },
    // Listed after cardFocused, so the error colour still wins while the field is focused.
    cardInvalid: { borderColor: V6Colors.dangerText, borderWidth: 1.5 },
    currency: { color: V6Colors.ink700, fontSize: 28, fontWeight: '700', fontFamily: 'Inter' },
    input: { flex: 1, fontSize: 30, fontWeight: '700', fontFamily: 'Inter', color: V6Colors.ink900, paddingVertical: 8 },
  });
  return { styles, V6Colors, appearance };
}
