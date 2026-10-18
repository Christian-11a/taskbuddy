import React, { forwardRef, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import { useRevealOnFocus } from './KeyboardAwareScrollView';

export type TextFieldProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  helper?: string;
  /** Message for the current value. Pass undefined once the value is valid. */
  error?: string;
  /** True after a submit attempt, so the error shows even if the field was never left. */
  submitted?: boolean;
  /** A count such as "12 / 400", shown at the right of the footer. It stays up while an error shows. */
  counter?: string;
};

/**
 * Labelled text input. An error shows only after the user leaves the field or
 * submits, and disappears as soon as the caller stops passing `error`.
 * The ref goes to the inner TextInput, so a caller can focus the field.
 */
const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({
  label, value, onChangeText, helper, error, submitted = false, counter, multiline = false, style, onBlur, onFocus,
  ...inputProps
}, forwardedRef) {
  const { styles, Colors, V6Colors } = useThemedStyles(createThemedStyles);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<TextInput | null>(null);
  const setInputRef = (node: TextInput | null) => {
    inputRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };
  const revealField = useRevealOnFocus(inputRef);
  const showError = !!error && (touched || submitted);
  const footer = showError ? (
    <View style={styles.helperRow}>
      <CircleAlert size={14} color={Colors.dangerText} />
      <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
    </View>
  ) : helper ? (
    <Text style={styles.helper}>{helper}</Text>
  ) : null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused, showError && styles.boxError]}>
        <TextInput
          {...inputProps}
          ref={setInputRef}
          multiline={multiline}
          value={value}
          onChangeText={onChangeText}
          onFocus={(e) => {
            setFocused(true);
            // Keeps the field above the keyboard and any sticky footer, inside a KeyboardAwareScrollView.
            revealField();
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            setTouched(true);
            onBlur?.(e);
          }}
          placeholderTextColor={V6Colors.ink500}
          accessibilityLabel={label}
          accessibilityHint={showError ? error : undefined}
          style={[styles.input, multiline && styles.multiline, style]}
        />
      </View>
      {counter ? (
        <View style={styles.footerRow}>
          <View style={styles.footerMain}>{footer}</View>
          <Text style={styles.counter}>{counter}</Text>
        </View>
      ) : footer}
    </View>
  );
});

export default TextField;

function createThemedStyles(theme: Palette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    wrap: { gap: 6 },
    label: { fontFamily: 'Inter', fontSize: 13, fontWeight: '600', lineHeight: 18, color: V6Colors.ink700 },
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: V6Colors.line,
      backgroundColor: V6Colors.surface,
    },
    // Error comes after focus in the array, so it wins when both apply.
    boxFocused: { borderWidth: 1.5, borderColor: Colors.link },
    boxError: { borderWidth: 1.5, borderColor: Colors.dangerText },
    input: { flex: 1, fontFamily: 'Inter', fontSize: 15, fontWeight: '500', lineHeight: 20, color: V6Colors.ink900, paddingVertical: 0 },
    multiline: { minHeight: 72, textAlignVertical: 'top' },
    helperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    helper: { fontFamily: 'Inter', fontSize: 13, fontWeight: '400', lineHeight: 18, color: V6Colors.ink500 },
    error: { flex: 1, fontFamily: 'Inter', fontSize: 13, fontWeight: '400', lineHeight: 18, color: Colors.dangerText },
    footerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    footerMain: { flex: 1 },
    counter: { fontFamily: 'Inter', fontSize: 13, fontWeight: '400', lineHeight: 18, color: V6Colors.ink500, textAlign: 'right' },
  });
  return { styles, Colors, V6Colors };
}
