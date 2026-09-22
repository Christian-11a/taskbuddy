import React, { forwardRef, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { V6Colors } from '../constants/theme';

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
  { containerStyle, inputStyle, iconColor = V6Colors.ink400, ...inputProps },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={[styles.row, containerStyle]}>
      <TextInput
        ref={ref}
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
        secureTextEntry={!visible}
        style={[styles.input, inputStyle]}
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.eye}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        testID={inputProps.testID ? `${inputProps.testID}-toggle` : undefined}
      >
        {visible ? <EyeOff size={20} color={iconColor} /> : <Eye size={20} color={iconColor} />}
      </TouchableOpacity>
    </View>
  );
});

export default PasswordInput;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1 },
  eye: { paddingLeft: 8 },
});
