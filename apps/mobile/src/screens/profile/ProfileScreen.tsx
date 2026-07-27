import { useState } from 'react';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { AmbientBackdrop } from '../../components/AmbientBackdrop';
import { AnimatedEntrance } from '../../components/AnimatedEntrance';
import { Avatar } from '../../components/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { api, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../state/authStore';
import { colors, radii, shadow, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>;

const staffSubroleLabels: Record<string, string> = {
  WAITER: 'Mozo/a',
  MAITRE: 'Metre',
  COOK: 'Cocinero/a',
  KITCHEN_ASSISTANT: 'Ayudante de cocina',
  BARTENDER: 'Barman / Bartender',
  DJ: 'DJ',
  DECORATION: 'Decoración',
  CLEANING: 'Limpieza',
  SECURITY: 'Seguridad',
  COORDINATOR: 'Coordinación',
  RECEPTION: 'Recepción',
  OTHER: 'Otra función'
};

function formatDate(value?: string) {
  if (!value) return 'Sin informar';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Sin informar'
    : new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(date);
}

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
      const uploaded = await api.postForm<{ asset: { url: string; secureUrl?: string } }>('/uploads', form);
      await api.post('/mobile/me/avatar', { avatarUrl: uploaded.asset.secureUrl || uploaded.asset.url });
      await refreshSessionUser();
      showToast({ message: 'Avatar actualizado correctamente.', variant: 'success' });
    } catch (error) {
      showToast({ message: error instanceof ApiClientError ? error.message : 'No se pudo actualizar el avatar.', variant: 'error' });
    } finally {
      setUploadingAvatar(false);
    }
  }

  const name = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || 'Mi perfil';
  const documentType = user?.documentType || user?.staffProfile?.documentType || 'DNI';
  const documentNumber = user?.documentNumber || user?.staffProfile?.documentNumber || 'Sin informar';
  const birthDate = user?.birthDate || user?.staffProfile?.birthDate;
  const address = user?.address || user?.staffProfile?.address || 'Sin informar';
  const emergencyContactName = user?.emergencyContactName || user?.staffProfile?.emergencyContactName || 'Sin informar';
  const emergencyContactPhone = user?.emergencyContactPhone || user?.staffProfile?.emergencyContactPhone || 'Sin informar';
  const staffFunctions = (user?.staffProfile?.staffSubroles ?? [])
    .map((subrole) => staffSubroleLabels[subrole] ?? subrole)
    .join(', ');

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]} showsVerticalScrollIndicator={false}>
      <AmbientBackdrop />
      <AnimatedEntrance distance={22}>
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTopline}>
            <Text style={styles.eyebrow}>CUENTA PERSONAL</Text>
            <StatusBadge label={user?.active === false ? 'Inactivo' : 'Activo'} tone={user?.active === false ? 'bad' : 'ok'} />
          </View>
          <View style={styles.identity}>
            <View style={styles.avatarRing}><Avatar uri={user?.avatarUrl} name={name} size={82} /></View>
            <View style={styles.identityText}>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.username}>@{user?.username || 'usuario'}</Text>
              {staffFunctions ? <Text style={styles.function}>{staffFunctions}</Text> : null}
            </View>
          </View>
          <View style={styles.avatarAction}>
            <AppButton title={uploadingAvatar ? 'Subiendo…' : 'Cambiar avatar'} variant="secondary" fullWidth={false} onPress={() => void changeAvatar()} loading={uploadingAvatar} />
          </View>
        </View>
      </AnimatedEntrance>

      <AnimatedEntrance delay={90} distance={16}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Datos personales</Text>
          <Text style={styles.sectionSubtitle}>Tu información de contacto y emergencia.</Text>
        </View>
        <AppCard style={styles.card}>
          <Row label="Nombre" value={name} />
          <Row label="Usuario" value={user?.username} />
          <Row label="Email" value={user?.email || 'Sin informar'} />
          <Row label="Teléfono" value={user?.phone || 'Sin informar'} />
          <View style={styles.divider} />
          <Row label={documentType === 'DNI' ? 'DNI' : documentType} value={documentNumber} />
          <Row label="Fecha de nacimiento" value={formatDate(birthDate)} />
          <Row label="Dirección" value={address} />
          <View style={styles.divider} />
          <Row label="Contacto de emergencia" value={emergencyContactName} />
          <Row label="Teléfono de emergencia" value={emergencyContactPhone} />
        </AppCard>
      </AnimatedEntrance>

      <AnimatedEntrance delay={160} distance={14}>
        <View style={styles.links}>
          <Text style={styles.sectionTitle}>Configuración</Text>
          <AppButton title="Editar perfil" variant="secondary" onPress={() => navigation.navigate('EditProfile')} />
          <AppButton title="Cambiar contraseña" variant="secondary" onPress={() => navigation.navigate('ChangePassword')} />
          <AppButton title="Seguridad y biometría" variant="secondary" onPress={() => navigation.navigate('BiometricSettings')} />
          <AppButton title="Sesiones y dispositivos" variant="secondary" onPress={() => navigation.navigate('ActiveSessions')} />
        </View>
      </AnimatedEntrance>

      <AnimatedEntrance delay={220} distance={12}>
        <View style={styles.links}>
          <AppButton title="Cerrar todas las sesiones" variant="ghost" onPress={() => void logoutAllDevices()} />
          <AppButton title="Cerrar sesión" variant="danger" onPress={() => void logout()} />
        </View>
      </AnimatedEntrance>

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
  hero: { overflow: 'hidden', backgroundColor: colors.backgroundDark, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.lg, ...shadow.card },
  heroGlow: { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(34,211,238,0.15)', right: -80, top: -70 },
  heroTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  eyebrow: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 1.15 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarRing: { padding: 3, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.45)' },
  identityText: { flex: 1, gap: 2 },
  name: { ...typography.h2, color: colors.primaryText },
  username: { ...typography.small, color: '#B6C7DD' },
  function: { ...typography.caption, color: colors.accent, fontWeight: '700', marginTop: spacing.xs },
  avatarAction: { alignSelf: 'flex-start' },
  sectionHeading: { gap: 2 },
  sectionTitle: { ...typography.h3, color: colors.text },
  sectionSubtitle: { ...typography.small, color: colors.textMuted },
  card: { gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  label: { ...typography.small, color: colors.textMuted, flex: 1 },
  value: { ...typography.bodyStrong, color: colors.text, flex: 1.35, textAlign: 'right' },
  links: { gap: spacing.sm },
  version: { ...typography.caption, color: colors.textSubtle, textAlign: 'center' }
});
