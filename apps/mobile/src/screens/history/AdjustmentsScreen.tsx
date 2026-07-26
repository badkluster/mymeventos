import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AppCard } from '../../components/AppCard';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { api, ApiClientError } from '../../lib/api';
import { attendanceAdjustmentStatusLabels } from '../../lib/attendanceLabels';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AttendanceAdjustmentRequest } from '../../types/attendance';

function formatDateTime(value?: string): string {
  return value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin definir';
}

export function AdjustmentsScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AttendanceAdjustmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ adjustments: AttendanceAdjustmentRequest[] }>('/mobile/attendance/adjustments');
      setItems(response.adjustments);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron cargar tus solicitudes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <ScreenHeader title="Correcciones" description="Solicitudes para ajustar una jornada. Se piden desde el detalle de cada jornada." />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <AppCard>
              <View style={styles.row}>
                <Text style={styles.title}>{formatDateTime(item.createdAt)}</Text>
                <StatusBadge label={attendanceAdjustmentStatusLabels[item.status] ?? item.status} tone={item.status === 'approved' ? 'ok' : item.status === 'rejected' ? 'bad' : 'warn'} />
              </View>
              <Text style={styles.description}>{item.reason}</Text>
              <Text style={styles.range}>Solicitado: {formatDateTime(item.requestedStartAt)} → {formatDateTime(item.requestedEndAt)}</Text>
              {item.reviewNotes ? <Text style={styles.resolution}>Respuesta: {item.reviewNotes}</Text> : null}
            </AppCard>
          )}
          ListEmptyComponent={<EmptyState title="Sin solicitudes" description="Pedí una corrección desde el detalle de una jornada si algo no coincide." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  list: { paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  title: { ...typography.bodyStrong, color: colors.text },
  description: { ...typography.small, color: colors.textMuted },
  range: { ...typography.caption, color: colors.textSubtle, marginTop: spacing.xs },
  resolution: { ...typography.small, color: colors.text, marginTop: spacing.xs }
});
