import { useThemedStyles, type Palette as ThemePalette } from '../context/ThemeContext';
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Tap from './ui/Tap';
import { useRevealOnFocus } from './ui/KeyboardAwareScrollView';
import { Eye, EyeOff } from 'lucide-react-native';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry' | 'style'> {
  /** The bordered box around the field — each screen keeps its own look. */
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  iconColor?: string;
}

/**
 * A password field with a show/hide toggle. Styling stays with the caller so
 * it drops into any form; this only owns the secure-entry state and the eye.
 */
const PasswordInput = forwardRef<TextInput, PasswordInputProps>(function PasswordInput(
  { containerStyle, inputStyle, iconColor, onFocus, ...inputProps },
  ref,
) {
  const { V6Colors, styles, appearance } = useThemedStyles(createThemedStyles);
  const [visible, setVisible] = useState(false);
  // The field keeps its own handle so it can be scrolled into view; the caller's ref still gets the TextInput.
  const inputRef = useRef<TextInput>(null);
  const revealField = useRevealOnFocus(inputRef);
  useImperativeHandle(ref, () => inputRef.current as TextInput, [ref]);
  return (
    <View style={[styles.row, containerStyle]}>
      <TextInput keyboardAppearance={appearance}
        ref={inputRef}
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
        onFocus={(e) => {
          revealField();
          onFocus?.(e);
        }}
        secureTextEntry={!visible}
        style={[styles.input, inputStyle]}
      />
      <Tap
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.eye}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        testID={inputProps.testID ? `${inputProps.testID}-toggle` : undefined}
      >
        {visible ? <EyeOff size={20} color={iconColor ?? V6Colors.ink400} /> : <Eye size={20} color={iconColor ?? V6Colors.ink400} />}
      </Tap>
    </View>
  );
});

export default PasswordInput;

function createThemedStyles(theme: ThemePalette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center' },
    input: { flex: 1 },
    eye: { paddingLeft: 8 },
  });
  return { appearance: theme.appearance, Colors, V6Colors, styles };
}
