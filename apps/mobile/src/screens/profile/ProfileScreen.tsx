import { useState } from 'react';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { Avatar } from '../../components/Avatar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { api, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../state/authStore';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const logoutAllDevices = useAuthStore((state) => state.logoutAllDevices);
  const refreshSessionUser = useAuthStore((state) => state.refreshSessionUser);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  async function changeAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return showToast({ message: 'Necesitamos acceso a tus fotos para cambiar el avatar.', variant: 'error' });
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, allowsEditing: true, aspect: [1, 1] });
    if (picked.canceled || !picked.assets[0]) return;
    setUploadingAvatar(true);
    try {
      const asset = picked.assets[0];
      const form = new FormData();
      form.append('context', 'users');
      form.append('file', { uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
      const uploaded = await api.post<{ asset: { url: string; secureUrl?: string } }>('/uploads', form);
      await api.post('/mobile/me/avatar', { avatarUrl: uploaded.asset.secureUrl || uploaded.asset.url });
      await refreshSessionUser();
      showToast({ message: 'Avatar actualizado correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof ApiClientError ? error.message : 'No se pudo actualizar el avatar.', variant: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  const name = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}>
      <ScreenHeader title="Perfil" />
      <View style={styles.avatarBlock}>
        <Avatar uri={user?.avatarUrl} name={name} size={88} />
        <AppButton title={uploadingAvatar ? 'Subiendo…' : 'Cambiar avatar'} variant="secondary" fullWidth={false} onPress={() => void changeAvatar()} loading={uploadingAvatar} />
      </View>

      <AppCard style={styles.card}>
        <Row label="Nombre" value={name} />
        <Row label="Usuario" value={user?.username} />
        <Row label="Email" value={user?.email || 'Sin informar'} />
        <Row label="Teléfono" value={user?.phone || 'Sin informar'} />
        {user?.staffProfile?.staffCode ? <Row label="Legajo" value={user.staffProfile.staffCode} /> : null}
        {user?.staffProfile?.staffSubroles?.length ? <Row label="Función" value={user.staffProfile.staffSubroles.join(', ')} /> : null}
        <View style={styles.row}>
          <Text style={styles.label}>Estado</Text>
          <StatusBadge label={user?.active === false ? 'Inactivo' : 'Activo'} tone={user?.active === false ? 'bad' : 'ok'} />
        </View>
      </AppCard>

      <View style={styles.links}>
        <AppButton title="Editar perfil" variant="secondary" onPress={() => navigation.navigate('EditProfile')} />
        <AppButton title="Cambiar contraseña" variant="secondary" onPress={() => navigation.navigate('ChangePassword')} />
        <AppButton title="Seguridad y biometría" variant="secondary" onPress={() => navigation.navigate('BiometricSettings')} />
        <AppButton title="Sesiones y dispositivos" variant="secondary" onPress={() => navigation.navigate('ActiveSessions')} />
      </View>

      <View style={styles.links}>
        <AppButton title="Cerrar todas las sesiones" variant="ghost" onPress={() => void logoutAllDevices()} />
        <AppButton title="Cerrar sesión" variant="danger" onPress={() => void logout()} />
      </View>

      <Text style={styles.version}>Versión {Constants.expoConfig?.version ?? '1.0.0'}</Text>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  avatarBlock: { alignItems: 'center', gap: spacing.md },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.small, color: colors.textMuted },
  value: { ...typography.bodyStrong, color: colors.text },
  links: { gap: spacing.sm },
  version: { ...typography.caption, color: colors.textSubtle, textAlign: 'center' }
});
