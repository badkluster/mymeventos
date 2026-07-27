import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { AmbientBackdrop } from '../../components/AmbientBackdrop';
import { AnimatedEntrance } from '../../components/AnimatedEntrance';
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
import { colors, radii, shadow, spacing, typography } from '../../theme/tokens';
import type { SummaryResponse } from '../../types/attendance';

const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('es-AR', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: ARGENTINA_TIME_ZONE
  }).format(now));
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
  const [now, setNow] = useState(() => new Date());

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

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(interval);
  }, []);

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
        showToast({ message: 'Sin conexión: el registro de horario quedó pendiente de sincronizar.', variant: 'info' });
      } else if (result.requiresReview) {
        showToast({ message: 'Registro de horario guardado. Quedó señalado para revisión administrativa.', variant: 'info' });
      } else {
        showToast({ message: sheet === 'check-in' ? 'Entrada registrada correctamente.' : 'Salida registrada correctamente.', variant: 'success' });
      }
    } catch (err) {
      showToast({ message: err instanceof ApiClientError ? err.message : 'No se pudo completar el registro de horario.', variant: 'error' });
    }
  }

  const name = user?.firstName || user?.username || 'equipo';
  const salonLabel = todayAssignment?.salonId?.name;
  const eventLabel = todayAssignment?.eventId?.eventName;
  const fullDate = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ARGENTINA_TIME_ZONE }).format(now);
  const shortDate = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: ARGENTINA_TIME_ZONE }).format(now);
  const clockTime = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: ARGENTINA_TIME_ZONE }).format(now);

  return (
    <View style={styles.flex}>
      <AmbientBackdrop />
      {pendingQueue.length ? <OfflineBanner pendingCount={pendingQueue.length} /> : null}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        <AnimatedEntrance distance={22}>
          <View style={styles.hero}>
            <View style={styles.heroOrb} />
            <View style={styles.header}>
              <View style={styles.heroText}>
                <Text style={styles.eyebrow}>REGISTRO DE HORARIO</Text>
                <Text style={styles.greeting}>{greeting(now)},{`\n`}{name}</Text>
                <Text style={styles.date}>{fullDate}</Text>
              </View>
              <View style={styles.avatarShell}>
                <Avatar uri={user?.avatarUrl} name={user?.fullName || name} />
              </View>
            </View>
            <View style={styles.clockPanel} accessibilityLabel={`Hora actual: ${clockTime}`}>
              <View style={styles.clockHeader}>
                <View style={styles.clockLive}><View style={styles.clockDot} /><Text style={styles.clockLabel}>HORA DE REFERENCIA</Text></View>
                <Text style={styles.clockDate}>{shortDate}</Text>
              </View>
              <Text style={styles.clockTime}>{clockTime}</Text>
              <Text style={styles.clockHint}>El registro oficial se valida con la hora del servidor.</Text>
            </View>
            <View style={styles.heroFooter}>
              <View style={[styles.statusDot, activeSession ? styles.statusDotActive : styles.statusDotIdle]} />
              <Text style={styles.heroFooterText}>{activeSession ? 'Jornada en curso' : 'Listo para comenzar'}</Text>
            </View>
          </View>
        </AnimatedEntrance>

        <AnimatedEntrance delay={90}>
          {activeSession ? (
            <WorkStatusCard startedAt={activeSession.startedAt} salonName={salonLabel} eventName={eventLabel} />
          ) : (
            <AppCard style={styles.promptCard}>
              <View style={styles.promptIcon}><Text style={styles.promptIconText}>◈</Text></View>
              <View style={styles.promptText}>
                <Text style={styles.promptEyebrow}>ESTADO ACTUAL</Text>
                <Text style={styles.promptTitle}>Todavía no iniciaste tu jornada</Text>
                <Text style={styles.promptBody}>
                  {salonLabel ? `Tenés asignación hoy en ${salonLabel}${eventLabel ? ` · ${eventLabel}` : ''}.` : 'Cuando llegues al salón, iniciá tu jornada.'}
                </Text>
              </View>
            </AppCard>
          )}
        </AnimatedEntrance>

        <AnimatedEntrance delay={160}>
          <View style={styles.actionBlock}>
            <AppButton
              title={activeSession ? 'Finalizar jornada' : 'Iniciar jornada'}
              variant={activeSession ? 'danger' : 'primary'}
              onPress={() => void openSheet(activeSession ? 'check-out' : 'check-in')}
            />
            <Text style={styles.actionHint}>{activeSession ? 'Confirmá la salida para cerrar tu registro de hoy.' : 'Se validará la información del momento de tu registro.'}</Text>
          </View>
        </AnimatedEntrance>

        {summary ? <AnimatedEntrance delay={220}><View style={styles.metrics}>
          <MetricCard label="Últimos 30 días" value={`${summary.totalHours}h`} hint={`${summary.days.length} jornadas registradas`} />
        </View></AnimatedEntrance> : null}
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
  hero: { overflow: 'hidden', backgroundColor: colors.backgroundDark, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.xl, ...shadow.card },
  heroOrb: { position: 'absolute', width: 170, height: 170, borderRadius: 100, backgroundColor: 'rgba(34,211,238,0.16)', right: -48, top: -64 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  heroText: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 1.2 },
  greeting: { ...typography.h2, color: colors.primaryText, lineHeight: 27 },
  date: { ...typography.small, color: '#B6C7DD', textTransform: 'capitalize' },
  avatarShell: { padding: 3, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.46)' },
  clockPanel: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(148,226,244,0.2)', borderRadius: radii.lg, padding: spacing.md, gap: 2 },
  clockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  clockLive: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  clockDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  clockLabel: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 0.85 },
  clockDate: { ...typography.caption, color: '#C7D5E8', textTransform: 'capitalize' },
  clockTime: { fontSize: 35, lineHeight: 41, color: colors.primaryText, fontWeight: '800', letterSpacing: 1.6, fontVariant: ['tabular-nums'] },
  clockHint: { ...typography.caption, color: '#A9BAD0' },
  heroFooter: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: radii.pill },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusDotActive: { backgroundColor: '#55E9A7' },
  statusDotIdle: { backgroundColor: colors.accent },
  heroFooterText: { ...typography.caption, color: colors.primaryText, fontWeight: '700' },
  promptCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.lg },
  promptIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetSoft },
  promptIconText: { color: colors.violet, fontSize: 20, fontWeight: '800' },
  promptText: { flex: 1, gap: 3 },
  promptEyebrow: { ...typography.caption, color: colors.violet, fontWeight: '700', letterSpacing: 0.8 },
  promptTitle: { ...typography.bodyStrong, color: colors.text },
  promptBody: { ...typography.small, color: colors.textMuted },
  actionBlock: { gap: spacing.sm },
  actionHint: { ...typography.caption, color: colors.textSubtle, textAlign: 'center', paddingHorizontal: spacing.lg },
  metrics: { flexDirection: 'row', gap: spacing.md }
});
