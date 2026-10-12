import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import { useRevealOnFocus } from '../ui/KeyboardAwareScrollView';
import { activeBoxIndex, applyCodeInput, boxCharacters } from './resetCode';

type CodeBoxesProps = {
  /** The code so far: digits only, at most six. */
  value: string;
  onChange: (code: string) => void;
  editable?: boolean;
  autoFocus?: boolean;
};

/**
 * Six boxes for the reset code. One text input sits over them and takes the
 * typing, autofill and paste, so the keyboard's own backspace and paste work
 * as they do everywhere else. The boxes only show the result, and the input
 * is what screen readers announce.
 */
const CodeBoxes = forwardRef<TextInput, CodeBoxesProps>(function CodeBoxes(
  { value, onChange, editable = true, autoFocus = false },
  ref,
) {
  const { styles } = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const revealField = useRevealOnFocus(inputRef);
  useImperativeHandle(ref, () => inputRef.current as TextInput, [ref]);
  const characters = boxCharacters(value);
  const current = activeBoxIndex(value);

  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessible={false}>
        {characters.map((char, i) => {
          const active = focused && editable && i === current;
          return (
            <View
              key={i}
              testID={`reset-code-box-${i}`}
              style={[styles.box, char !== '' && styles.boxFilled, active && styles.boxActive]}
            >
              <Text style={styles.digit}>{char}</Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={inputRef}
        testID="reset-code-input"
        value={value}
        onChangeText={(text) => onChange(applyCodeInput(value, text))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        editable={editable}
        autoFocus={autoFocus}
        caretHidden
        accessibilityLabel="Reset code"
        accessibilityHint="Enter the six-digit code from your email"
        onFocus={() => {
          setFocused(true);
          revealField();
        }}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
      />
    </View>
  );
});

export default CodeBoxes;

function createStyles(theme: Palette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    wrap: { position: 'relative' },
    row: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    box: {
      flex: 1,
      maxWidth: 52,
      height: 56,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: V6Colors.line,
      backgroundColor: V6Colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxFilled: { borderColor: V6Colors.ink300 },
    boxActive: { borderColor: Colors.link },
    digit: { fontFamily: 'Inter', fontSize: 24, fontWeight: '800', lineHeight: 30, color: V6Colors.ink900 },
    // Covers the boxes so a tap on any box focuses the input. Invisible, but
    // still focusable, so the keyboard and the paste menu come from it.
    hiddenInput: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      opacity: 0,
      color: 'transparent',
    },
  });
  return { styles, Colors, V6Colors };
}
