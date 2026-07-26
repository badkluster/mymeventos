import { useState } from 'react';
import { Pressable, Text, View, type TextInputProps } from 'react-native';
import { AppTextInput } from './AppTextInput';
import { colors, spacing } from '../theme/tokens';

export function PasswordInput({ label = 'Contraseña', error, hint, ...props }: TextInputProps & { label?: string; error?: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <View>
      <AppTextInput
        label={label}
        error={error}
        hint={hint}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        style={{ paddingRight: 64 }}
        {...props}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        onPress={() => setVisible((current) => !current)}
        style={{ position: 'absolute', right: spacing.md, bottom: 14 }}
        hitSlop={8}
      >
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
      </Pressable>
    </View>
  );
}
