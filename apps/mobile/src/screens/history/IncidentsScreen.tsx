import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { api, ApiClientError } from '../../lib/api';
import { attendanceIncidentStatusLabels, attendanceIncidentTypeLabels } from '../../lib/attendanceLabels';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AttendanceIncident } from '../../types/attendance';
import type { HistoryStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'Incidents'>;

export function IncidentsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<AttendanceIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ incidents: AttendanceIncident[] }>('/mobile/attendance/incidents');
      setItems(response.incidents);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudieron cargar tus incidencias.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <ScreenHeader title="Incidencias" description="Situaciones reportadas sobre tus registros de horario." />
      <AppButton title="Reportar incidencia" onPress={() => navigation.navigate('NewIncident')} />
      <View style={{ height: spacing.lg }} />
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => (
            <AppCard>
              <View style={styles.row}>
                <Text style={styles.title}>{attendanceIncidentTypeLabels[item.type] ?? item.type}</Text>
                <StatusBadge label={attendanceIncidentStatusLabels[item.status] ?? item.status} tone={item.status === 'resolved' ? 'ok' : item.status === 'rejected' ? 'bad' : 'warn'} />
              </View>
              <Text style={styles.description}>{item.description}</Text>
              {item.resolution ? <Text style={styles.resolution}>Resolución: {item.resolution}</Text> : null}
            </AppCard>
          )}
          ListEmptyComponent={<EmptyState title="Sin incidencias" description="Cuando reportes una situación sobre tus registros de horario la vas a ver acá." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  list: { paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  title: { ...typography.bodyStrong, color: colors.text, flex: 1, marginRight: spacing.sm },
  description: { ...typography.small, color: colors.textMuted },
  resolution: { ...typography.small, color: colors.text, marginTop: spacing.xs }
});
