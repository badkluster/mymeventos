import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { PasswordInput } from '../../components/PasswordInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { api, ApiClientError } from '../../lib/api';
import { clearCachedCredentials } from '../../lib/secureStorage';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export function ResetPasswordScreen({ route, navigation }: Props) {
  const [token, setToken] = useState(route.params?.token ?? '');
  const [username, setUsername] = useState(route.params?.username ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    if (!username.trim()) return setError('Ingresá tu usuario o email.');
    if (!/^\d{6}$/.test(token)) return setError('Ingresá el código de seis dígitos que recibiste por email.');
    if (newPassword.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (newPassword !== confirmPassword) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    setError('');
    try {
      await api.post('/mobile/auth/reset-password', { username: username.trim(), token: token.trim(), newPassword });
      try { await clearCachedCredentials(); } catch { /* best-effort: the old cached password is invalid regardless */ }
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Restablecer contraseña" description="Ingresá el código de seis dígitos que recibiste por email y elegí una nueva contraseña." />
        {done ? (
          <>
            <Text style={styles.success}>Contraseña actualizada correctamente. Iniciá sesión con tu nueva contraseña.</Text>
            <AppButton title="Ir a iniciar sesión" onPress={() => navigation.navigate('Login')} />
          </>
        ) : (
          <>
            <AppTextInput label="Usuario o email" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
            <AppTextInput label="Código recibido por email" autoCapitalize="none" autoCorrect={false} value={token} onChangeText={(value) => setToken(value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} />
            <PasswordInput label="Nueva contraseña" value={newPassword} onChangeText={setNewPassword} hint="Mínimo 8 caracteres." />
            <PasswordInput label="Confirmar contraseña" value={confirmPassword} onChangeText={setConfirmPassword} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton title="Restablecer contraseña" onPress={() => void submit()} loading={loading} disabled={!username.trim() || token.length !== 6 || !newPassword || !confirmPassword} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg },
  error: { ...typography.small, color: colors.danger },
  success: { ...typography.body, color: colors.success }
});
