import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';

export type TextFieldProps = Omit<TextInputProps, 'value' | 'onChangeText'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  helper?: string;
  /** Message for the current value. Pass undefined once the value is valid. */
  error?: string;
  /** True after a submit attempt, so the error shows even if the field was never left. */
  submitted?: boolean;
};

/**
 * Labelled text input. An error shows only after the user leaves the field or
 * submits, and disappears as soon as the caller stops passing `error`.
 */
export default function TextField({
  label, value, onChangeText, helper, error, submitted = false, multiline = false, style, onBlur, onFocus, ...inputProps
}: TextFieldProps) {
  const { styles, Colors, V6Colors } = useThemedStyles(createThemedStyles);
  const [focused, setFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const showError = !!error && (touched || submitted);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused, showError && styles.boxError]}>
        <TextInput
          {...inputProps}
          multiline={multiline}
          value={value}
          onChangeText={onChangeText}
          onFocus={(e) => {
            setFocused(true);
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
      {showError ? (
        <View style={styles.helperRow}>
          <CircleAlert size={14} color={Colors.dangerText} />
          <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

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
  });
  return { styles, Colors, V6Colors };
}
