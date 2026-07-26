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
import { colors, spacing, typography } from '../../theme/tokens';
import type { ScheduleAssignment } from '../../types/attendance';

function formatDate(value?: string): string {
  return value ? new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(value)) : 'Fecha a confirmar';
}

export function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ScheduleAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ assignments: ScheduleAssignment[] }>('/mobile/schedule');
      setItems(response.assignments ?? []);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron cargar tus turnos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <ScreenHeader title="Turnos" description="Próximas asignaciones a eventos y salones." />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <AppCard>
              <View style={styles.row}>
                <Text style={styles.title}>{item.eventId?.eventName || 'Turno de salón'}</Text>
                <StatusBadge label={item.status} tone={item.status === 'confirmed' || item.status === 'checked_in' ? 'ok' : 'neutral'} />
              </View>
              <Text style={styles.meta}>{formatDate(item.eventId?.eventDate ?? item.shiftStart)}</Text>
              <Text style={styles.meta}>{item.salonId?.name ?? 'Salón a confirmar'}{item.roleLabel ? ` · ${item.roleLabel}` : ''}</Text>
              {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            </AppCard>
          )}
          ListEmptyComponent={<EmptyState title="Sin turnos próximos" description="Todavía no tenés asignaciones cargadas para los próximos días." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  list: { paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  title: { ...typography.bodyStrong, color: colors.text, flex: 1, marginRight: spacing.sm, textTransform: 'capitalize' },
  meta: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },
  notes: { ...typography.small, color: colors.text, marginTop: spacing.xs }
});
