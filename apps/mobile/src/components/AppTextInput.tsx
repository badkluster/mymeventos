import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';

type Props = TextInputProps & { label?: string; error?: string; hint?: string };

export const AppTextInput = forwardRef<TextInput, Props>(function AppTextInput(
  { label, error, hint, style, onFocus, onBlur, ...props }, ref
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textSubtle}
        style={[styles.input, focused && styles.inputFocused, Boolean(error) && styles.inputError, style]}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        {...props}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  input: {
    minHeight: 54,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FBFDFF',
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16
  },
  inputFocused: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger },
  error: { ...typography.small, color: colors.danger },
  hint: { ...typography.small, color: colors.textSubtle }
});
