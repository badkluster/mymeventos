import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { PasswordInput } from '../../components/PasswordInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { api, ApiClientError } from '../../lib/api';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ route, navigation }: Props) {
  const [token, setToken] = useState(route.params?.token ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    if (newPassword.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (newPassword !== confirmPassword) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    setError('');
    try {
      await api.post('/mobile/auth/reset-password', { token: token.trim(), newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Restablecer contraseña" description="Pegá el código que recibiste por email y elegí una nueva contraseña." />
      {done ? (
        <>
          <Text style={styles.success}>Contraseña actualizada correctamente. Iniciá sesión con tu nueva contraseña.</Text>
          <AppButton title="Ir a iniciar sesión" onPress={() => navigation.navigate('Login')} />
        </>
      ) : (
        <>
          <AppTextInput label="Código recibido por email" autoCapitalize="none" autoCorrect={false} value={token} onChangeText={setToken} multiline />
          <PasswordInput label="Nueva contraseña" value={newPassword} onChangeText={setNewPassword} hint="Mínimo 8 caracteres." />
          <PasswordInput label="Confirmar contraseña" value={confirmPassword} onChangeText={setConfirmPassword} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton title="Restablecer contraseña" onPress={() => void submit()} loading={loading} disabled={!token.trim() || !newPassword || !confirmPassword} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg },
  error: { ...typography.small, color: colors.danger },
  success: { ...typography.body, color: colors.success }
});
