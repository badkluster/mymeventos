import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { api, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../state/authStore';
import { spacing } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const user = useAuthStore((state) => state.user);
  const refreshSessionUser = useAuthStore((state) => state.refreshSessionUser);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true);
    try {
      await api.patch('/mobile/me', { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), phone: phone.trim() });
      await refreshSessionUser();
      showToast({ message: 'Perfil actualizado correctamente.', variant: 'success' });
      navigation.goBack();
    } catch (error) {
      showToast({ message: error instanceof ApiClientError ? error.message : 'No se pudo actualizar el perfil.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Editar perfil" description="Solo se pueden editar tus datos básicos de contacto." />
      <AppTextInput label="Nombre" value={firstName} onChangeText={setFirstName} />
      <AppTextInput label="Apellido" value={lastName} onChangeText={setLastName} />
      <AppTextInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <AppTextInput label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <AppButton title="Guardar cambios" onPress={() => void submit()} loading={loading} disabled={!firstName.trim() || !lastName.trim()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, gap: spacing.md }
});
