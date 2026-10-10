import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { useThemedStyles, type Palette } from '../../context/ThemeContext';
import PasswordInput from '../PasswordInput';

export type AuthFieldProps = Omit<TextInputProps, 'value' | 'onChangeText' | 'style' | 'secureTextEntry'> & {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Secure entry with the show/hide eye (the shared PasswordInput). */
  secure?: boolean;
  /** Red asterisk after the label, for fields the submit button checks. */
  required?: boolean;
  /** Message for the current value. Pass undefined once the value is valid. */
  error?: string;
  helper?: string;
  testID?: string;
};

/**
 * The text field used on every sign-in, sign-up and reset screen. Same box as
 * the shared TextField (radius 14, 1 dp border, 1.5 dp ring when focused or in
 * error), plus a show/hide eye for passwords.
 *
 * The focus style is a border change only. Adding a shadow or elevation to a
 * style that wraps a focused TextInput makes Android drop the focus, which
 * closes the keyboard the moment it opens.
 */
const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { label, value, onChangeText, secure = false, required = false, error, helper, testID, onFocus, onBlur, ...inputProps },
  ref,
) {
  const { styles, Colors, V6Colors, appearance } = useThemedStyles(createStyles);
  const [focused, setFocused] = useState(false);
  const boxStyle = [styles.box, focused && styles.boxFocused, !!error && styles.boxError];

  const handleFocus: TextInputProps['onFocus'] = (e) => {
    setFocused(true);
    onFocus?.(e);
  };
  const handleBlur: TextInputProps['onBlur'] = (e) => {
    setFocused(false);
    onBlur?.(e);
  };

  const input = secure ? (
    <PasswordInput
      ref={ref}
      containerStyle={boxStyle}
      inputStyle={styles.input}
      testID={testID}
      accessibilityLabel={label}
      accessibilityHint={error}
      placeholderTextColor={V6Colors.ink500}
      value={value}
      onChangeText={onChangeText}
      onFocus={handleFocus}
      onBlur={handleBlur}
      {...inputProps}
    />
  ) : (
    <View style={boxStyle}>
      <TextInput
        ref={ref}
        keyboardAppearance={appearance}
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={error}
        style={styles.input}
        placeholderTextColor={V6Colors.ink500}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        enablesReturnKeyAutomatically
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...inputProps}
      />
    </View>
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.asterisk}> *</Text>}
      </Text>
      {input}
      {!!error ? (
        <View style={styles.errorRow}>
          <CircleAlert size={14} color={Colors.dangerText} />
          <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>
        </View>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
});

export default AuthField;

function createStyles(theme: Palette) {
  const { Colors, V6Colors } = theme;
  const styles = StyleSheet.create({
    wrap: { gap: 6 },
    label: { fontFamily: 'Inter', fontSize: 14, fontWeight: '600', lineHeight: 18, color: V6Colors.ink700 },
    asterisk: { color: V6Colors.dangerText, fontWeight: '700' },
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: V6Colors.line,
      backgroundColor: V6Colors.surface,
    },
    boxFocused: { borderWidth: 1.5, borderColor: Colors.link },
    boxError: { borderWidth: 1.5, borderColor: V6Colors.dangerText },
    input: {
      flex: 1,
      fontFamily: 'Inter',
      fontSize: 16,
      fontWeight: '500',
      lineHeight: 20,
      color: V6Colors.ink900,
      paddingVertical: 0,
    },
    errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    error: { flex: 1, fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: V6Colors.dangerText },
    helper: { fontFamily: 'Inter', fontSize: 13, lineHeight: 18, color: V6Colors.ink500 },
  });
  return { appearance: theme.appearance, styles, Colors, V6Colors };
}
