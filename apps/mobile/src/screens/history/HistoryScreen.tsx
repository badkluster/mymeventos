import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { HistoryItem } from '../../components/HistoryItem';
import { LoadingState } from '../../components/LoadingState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { api, ApiClientError } from '../../lib/api';
import { colors, spacing } from '../../theme/tokens';
import type { HistoryResponse, WorkSession } from '../../types/attendance';
import type { HistoryStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'History'>;

export function HistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<WorkSession[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (targetPage: number) => {
    if (targetPage === 1) setLoading(true); else setLoadingMore(true);
    setError('');
    try {
      const response = await api.get<HistoryResponse>(`/mobile/attendance/history?page=${targetPage}&limit=20`);
      setItems((current) => (targetPage === 1 ? response.items : [...current, ...response.items]));
      setTotal(response.total);
      setPage(targetPage);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo cargar el historial.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(1); }, [load]));

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.headerRow}>
        <ScreenHeader title="Historial" description="Tus jornadas registradas." />
      </View>
      <View style={styles.actions}>
        <AppButton title="Incidencias" variant="secondary" fullWidth={false} onPress={() => navigation.navigate('Incidents')} />
        <AppButton title="Correcciones" variant="secondary" fullWidth={false} onPress={() => navigation.navigate('Adjustments')} />
      </View>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load(1)} /> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <HistoryItem
              startedAt={item.startedAt}
              endedAt={item.endedAt}
              status={item.status}
              workedMinutes={item.workedMinutes}
              onPress={() => navigation.navigate('WorkSessionDetail', { sessionId: item._id })}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (!loadingMore && items.length < total) void load(page + 1); }}
          ListEmptyComponent={<EmptyState title="Sin jornadas registradas" description="Cuando fiches tu primera entrada vas a ver el historial acá." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  headerRow: { marginBottom: 0 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  list: { paddingBottom: spacing.xxl }
});
