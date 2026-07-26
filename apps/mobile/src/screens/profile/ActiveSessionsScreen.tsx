import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { getInstallationId } from '../../lib/device';
import { api, ApiClientError } from '../../lib/api';
import { colors, spacing, typography } from '../../theme/tokens';
import type { MobileDevice } from '../../types/user';

function formatDateTime(value?: string): string {
  return value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registrar';
}

export function ActiveSessionsScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revokingId, setRevokingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [response, installationId] = await Promise.all([
        api.get<{ devices: MobileDevice[] }>('/mobile/me/devices'),
        getInstallationId()
      ]);
      setDevices(response.devices);
      setCurrentId(installationId);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron cargar tus dispositivos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function revoke(deviceId: string) {
    setRevokingId(deviceId);
    try {
      await api.delete(`/mobile/me/devices/${deviceId}`);
      showToast({ message: 'Dispositivo revocado correctamente.', variant: 'success' });
      await load();
    } catch (err) {
      showToast({ message: err instanceof ApiClientError ? err.message : 'No se pudo revocar el dispositivo.', variant: 'error' });
    } finally {
      setRevokingId('');
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <ScreenHeader title="Sesiones y dispositivos" description="Dispositivos con acceso a tu cuenta." />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => {
            const isCurrent = item.installationId === currentId;
            return (
              <AppCard style={styles.row}>
                <View style={styles.textBlock}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title}>{item.deviceModel || item.platform}</Text>
                    {isCurrent ? <StatusBadge label="Este dispositivo" tone="ok" /> : null}
                  </View>
                  <Text style={styles.meta}>Último uso: {formatDateTime(item.lastUsedAt)}</Text>
                </View>
                {!isCurrent && item.isActive ? (
                  <AppButton title="Revocar" variant="danger" fullWidth={false} loading={revokingId === item._id} onPress={() => void revoke(item._id)} />
                ) : null}
              </AppCard>
            );
          }}
          ListEmptyComponent={<EmptyState title="Sin dispositivos registrados" />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  list: { paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  textBlock: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...typography.bodyStrong, color: colors.text },
  meta: { ...typography.small, color: colors.textMuted }
});
