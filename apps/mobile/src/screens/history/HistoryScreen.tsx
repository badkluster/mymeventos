import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
import type { HistoryResponse, SummaryResponse, WorkSession } from '../../types/attendance';
import type { HistoryStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'History'>;

function monthRange(month: Date) {
  const from = new Date(month.getFullYear(), month.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

export function HistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [viewMonth, setViewMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [items, setItems] = useState<WorkSession[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(() => monthRange(viewMonth), [viewMonth]);
  const monthLabel = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(viewMonth);
  const today = new Date();
  const canGoForward = viewMonth.getFullYear() < today.getFullYear() || (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() < today.getMonth());

  const load = useCallback(async (targetPage: number, { from, to }: { from: Date; to: Date }) => {
    if (targetPage === 1) setLoading(true); else setLoadingMore(true);
    setError('');
    try {
      const query = `page=${targetPage}&limit=20&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      const response = await api.get<HistoryResponse>(`/mobile/attendance/history?${query}`);
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

  const loadSummary = useCallback(async ({ from, to }: { from: Date; to: Date }) => {
    setSummaryLoading(true);
    try {
      const query = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      setSummary(await api.get<SummaryResponse>(`/mobile/attendance/summary?${query}`));
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(1, range); void loadSummary(range); }, [load, loadSummary, range]));

  function moveMonth(amount: number) {
    setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <AmbientBackdrop />
      <AnimatedEntrance distance={22}>
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <Text style={styles.eyebrow}>TU ACTIVIDAD</Text>
          <Text style={styles.title}>Historial de{`\n`}jornadas</Text>
          <View style={styles.heroSummary}>
            <View style={styles.heroStat}>
              <Text style={styles.summaryValue}>{summaryLoading ? '—' : `${summary?.totalHours ?? 0}h`}</Text>
              <Text style={styles.summaryLabel}>fichadas este mes</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.summaryValue}>{total}</Text>
              <Text style={styles.summaryLabel}>registros este mes</Text>
            </View>
          </View>
        </View>
      </AnimatedEntrance>
      <AnimatedEntrance delay={80} distance={12}>
        <View style={styles.monthSwitcher}>
          <Pressable style={styles.monthButton} onPress={() => moveMonth(-1)} accessibilityRole="button" accessibilityLabel="Mes anterior">
            <Text style={styles.monthButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Pressable style={[styles.monthButton, !canGoForward && styles.monthButtonDisabled]} onPress={() => canGoForward && moveMonth(1)} disabled={!canGoForward} accessibilityRole="button" accessibilityLabel="Mes siguiente">
            <Text style={styles.monthButtonText}>›</Text>
          </Pressable>
        </View>
      </AnimatedEntrance>
      <AnimatedEntrance delay={100} distance={14}>
        <View style={styles.actions}>
          <AppButton title="Incidencias" variant="secondary" fullWidth={false} onPress={() => navigation.navigate('Incidents')} />
          <AppButton title="Correcciones" variant="secondary" fullWidth={false} onPress={() => navigation.navigate('Adjustments')} />
        </View>
      </AnimatedEntrance>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load(1, range)} /> : (
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
          onEndReached={() => { if (!loadingMore && items.length < total) void load(page + 1, range); }}
          ListEmptyComponent={<EmptyState title="Sin jornadas este mes" description="Elegí otro mes o iniciá tu jornada desde el inicio." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  hero: { overflow: 'hidden', backgroundColor: colors.backgroundDark, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.sm, marginBottom: spacing.md, ...shadow.card },
  heroGlow: { position: 'absolute', backgroundColor: 'rgba(124,92,252,0.35)', width: 170, height: 170, borderRadius: 100, right: -65, top: -72 },
  eyebrow: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 1.2 },
  title: { ...typography.h1, color: colors.primaryText, lineHeight: 31 },
  heroSummary: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  heroStat: { gap: 2 },
  summaryValue: { fontSize: 30, lineHeight: 34, fontWeight: '800', color: colors.accent, fontVariant: ['tabular-nums'] },
  summaryLabel: { ...typography.small, color: '#B6C7DD' },
  monthSwitcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E6EDF7', borderRadius: radii.lg, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, marginBottom: spacing.lg, ...shadow.card },
  monthButton: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  monthButtonDisabled: { opacity: 0.35 },
  monthButtonText: { fontSize: 22, color: colors.primarySoft, lineHeight: 26 },
  monthLabel: { ...typography.bodyStrong, color: colors.text, textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  list: { paddingBottom: spacing.xxl }
});
