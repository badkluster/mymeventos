import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { PasswordInput } from '../../components/PasswordInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { api, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../state/authStore';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ChangePassword'>;

export function ChangePasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const refreshCachedCredentialsAfterPasswordChange = useAuthStore((state) => state.refreshCachedCredentialsAfterPasswordChange);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (newPassword.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.');
    if (newPassword !== confirmPassword) return setError('Las contraseñas no coinciden.');
    setError('');
    setLoading(true);
    try {
      await api.post('/mobile/auth/change-password', { currentPassword, newPassword });
      await refreshCachedCredentialsAfterPasswordChange(newPassword);
      showToast({ message: 'Contraseña actualizada correctamente.', variant: 'success' });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Cambiar contraseña" />
      <PasswordInput label="Contraseña actual" value={currentPassword} onChangeText={setCurrentPassword} />
      <PasswordInput label="Nueva contraseña" value={newPassword} onChangeText={setNewPassword} hint="Mínimo 8 caracteres." />
      <PasswordInput label="Confirmar nueva contraseña" value={confirmPassword} onChangeText={setConfirmPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Actualizar contraseña" onPress={() => void submit()} loading={loading} disabled={!currentPassword || !newPassword || !confirmPassword} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, gap: spacing.md },
  error: { ...typography.small, color: colors.danger }
});
