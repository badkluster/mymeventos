import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AmbientBackdrop } from '../../components/AmbientBackdrop';
import { AnimatedEntrance } from '../../components/AnimatedEntrance';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { HistoryItem } from '../../components/HistoryItem';
import { LoadingState } from '../../components/LoadingState';
import { api, ApiClientError } from '../../lib/api';
import { colors, radii, shadow, spacing, typography } from '../../theme/tokens';
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
      <AmbientBackdrop />
      <AnimatedEntrance distance={22}>
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>TU ACTIVIDAD</Text>
          <Text style={styles.title}>Historial de{`\n`}jornadas</Text>
          <View style={styles.heroSummary}>
            <Text style={styles.summaryValue}>{total}</Text>
            <Text style={styles.summaryLabel}>registros disponibles</Text>
          </View>
        </View>
      </AnimatedEntrance>
      <AnimatedEntrance delay={100} distance={14}>
        <View style={styles.actions}>
          <AppButton title="Incidencias" variant="secondary" fullWidth={false} onPress={() => navigation.navigate('Incidents')} />
          <AppButton title="Correcciones" variant="secondary" fullWidth={false} onPress={() => navigation.navigate('Adjustments')} />
        </View>
      </AnimatedEntrance>
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
  hero: { overflow: 'hidden', backgroundColor: colors.backgroundDark, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.sm, marginBottom: spacing.lg, ...shadow.card },
  heroGlow: { position: 'absolute', backgroundColor: 'rgba(124,92,252,0.35)', width: 170, height: 170, borderRadius: 100, right: -65, top: -72 },
  eyebrow: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 1.2 },
  title: { ...typography.h1, color: colors.primaryText, lineHeight: 31 },
  heroSummary: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.sm },
  summaryValue: { fontSize: 30, lineHeight: 34, fontWeight: '800', color: colors.accent, fontVariant: ['tabular-nums'] },
  summaryLabel: { ...typography.small, color: '#B6C7DD' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  list: { paddingBottom: spacing.xxl }
});
