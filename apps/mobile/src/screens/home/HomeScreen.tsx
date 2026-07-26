import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { Avatar } from '../../components/Avatar';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';
import { LocationStatus, type LocationState } from '../../components/LocationStatus';
import { MetricCard } from '../../components/MetricCard';
import { OfflineBanner } from '../../components/OfflineBanner';
import { useToast } from '../../components/Toast';
import { WorkStatusCard } from '../../components/WorkStatusCard';
import { ensureLocationPermission, openDeviceSettings } from '../../lib/geo';
import { api, ApiClientError } from '../../lib/api';
import { useAttendanceStore } from '../../state/attendanceStore';
import { useAuthStore } from '../../state/authStore';
import { colors, spacing, typography } from '../../theme/tokens';
import type { SummaryResponse } from '../../types/attendance';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buen día';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const user = useAuthStore((state) => state.user);
  const { activeSession, todayAssignment, pendingQueue, acting, error, refresh, checkIn, checkOut, clearError } = useAttendanceStore();
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<'check-in' | 'check-out' | null>(null);
  const [locationState, setLocationState] = useState<LocationState>('idle');
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  const load = useCallback(async () => {
    await refresh();
    try {
      setSummary(await api.get<SummaryResponse>('/mobile/attendance/summary'));
    } catch {
      setSummary(null);
    }
  }, [refresh]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    if (error) {
      showToast({ message: error, variant: 'error' });
      clearError();
    }
  }, [error, showToast, clearError]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openSheet(kind: 'check-in' | 'check-out') {
    setSheet(kind);
    setLocationState('requesting');
    const status = await ensureLocationPermission();
    setLocationState(status === 'granted' ? 'ready' : status === 'denied' ? 'denied' : 'unavailable');
  }

  async function confirm() {
    if (!sheet) return;
    try {
      const result = sheet === 'check-in'
        ? await checkIn({ salonId: todayAssignment?.salonId?._id, eventId: todayAssignment?.eventId?._id })
        : await checkOut();
      setSheet(null);
      if (result.queued) {
        showToast({ message: 'Sin conexión: la marcación quedó pendiente de sincronizar.', variant: 'info' });
      } else if (result.requiresReview) {
        showToast({ message: 'Marcación registrada. Quedó señalada para revisión administrativa.', variant: 'info' });
      } else {
        showToast({ message: sheet === 'check-in' ? 'Entrada registrada correctamente.' : 'Salida registrada correctamente.', variant: 'success' });
      }
    } catch (err) {
      showToast({ message: err instanceof ApiClientError ? err.message : 'No se pudo completar la marcación.', variant: 'error' });
    }
  }

  const name = user?.firstName || user?.username || 'equipo';
  const salonLabel = todayAssignment?.salonId?.name;
  const eventLabel = todayAssignment?.eventId?.eventName;

  return (
    <View style={styles.flex}>
      {pendingQueue.length ? <OfflineBanner pendingCount={pendingQueue.length} /> : null}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting()}, {name}</Text>
            <Text style={styles.date}>{new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</Text>
          </View>
          <Avatar uri={user?.avatarUrl} name={user?.fullName || name} />
        </View>

        {activeSession ? (
          <WorkStatusCard startedAt={activeSession.startedAt} salonName={salonLabel} eventName={eventLabel} />
        ) : (
          <AppCard style={styles.promptCard}>
            <Text style={styles.promptTitle}>Todavía no iniciaste tu jornada</Text>
            <Text style={styles.promptBody}>
              {salonLabel ? `Tenés asignación hoy en ${salonLabel}${eventLabel ? ` · ${eventLabel}` : ''}.` : 'Cuando llegues al salón, iniciá tu jornada.'}
            </Text>
          </AppCard>
        )}

        <AppButton
          title={activeSession ? 'Finalizar jornada' : 'Iniciar jornada'}
          variant={activeSession ? 'danger' : 'primary'}
          onPress={() => void openSheet(activeSession ? 'check-out' : 'check-in')}
        />

        {summary ? (
          <View style={styles.metrics}>
            <MetricCard label="Últimos 30 días" value={`${summary.totalHours}h`} hint={`${summary.days.length} jornadas registradas`} />
          </View>
        ) : null}
      </ScrollView>

      <ConfirmationSheet
        visible={sheet !== null}
        title={sheet === 'check-in' ? 'Confirmar inicio de jornada' : 'Confirmar fin de jornada'}
        description={salonLabel ? `Salón: ${salonLabel}` : undefined}
        confirmLabel={sheet === 'check-in' ? 'Iniciar jornada' : 'Finalizar jornada'}
        danger={sheet === 'check-out'}
        loading={acting}
        onConfirm={() => void confirm()}
        onCancel={() => setSheet(null)}
      >
        <LocationStatus state={locationState} onOpenSettings={openDeviceSettings} />
      </ConfirmationSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { ...typography.h2, color: colors.text },
  date: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },
  promptCard: { gap: spacing.xs },
  promptTitle: { ...typography.bodyStrong, color: colors.text },
  promptBody: { ...typography.small, color: colors.textMuted },
  metrics: { flexDirection: 'row', gap: spacing.md }
});
