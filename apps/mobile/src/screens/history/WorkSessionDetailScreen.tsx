import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { api, ApiClientError } from '../../lib/api';
import { openLocationInMaps } from '../../lib/geo';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatMinutes, locationValidationLabels, workSessionStatusLabels } from '../../lib/attendanceLabels';
import type { SessionDetailResponse } from '../../types/attendance';
import type { HistoryStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'WorkSessionDetail'>;

function formatDateTime(value?: string): string {
  return value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registrar';
}

export function WorkSessionDetailScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { sessionId } = route.params;
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDetail(await api.get<SessionDetailResponse>(`/mobile/attendance/sessions/${sessionId}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo cargar el detalle de la jornada.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <LoadingState />;
  if (error || !detail) return <ErrorState message={error || 'Jornada no encontrada.'} onRetry={() => void load()} />;

  const { session, punches, incidents, adjustments } = detail;
  const canRequestAdjustment = session.status !== 'active' && !adjustments.some((item) => item.status === 'pending');

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}>
      <ScreenHeader title="Detalle de jornada" description={formatDateTime(session.startedAt)} />

      <AppCard style={styles.card}>
        <View style={styles.row}><Text style={styles.label}>Estado</Text><StatusBadge label={workSessionStatusLabels[session.status] ?? session.status} tone={session.status === 'completed' ? 'ok' : session.status === 'active' ? 'ok' : 'warn'} /></View>
        <View style={styles.row}><Text style={styles.label}>Entrada</Text><Text style={styles.value}>{formatDateTime(session.startedAt)}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Salida</Text><Text style={styles.value}>{formatDateTime(session.endedAt)}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Horas</Text><Text style={styles.value}>{formatMinutes(session.workedMinutes)}</Text></View>
      </AppCard>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Marcaciones</Text>
        {punches.map((punch) => (
          <View key={punch._id} style={styles.punchRow}>
            <View style={styles.punchHeaderRow}>
              <Text style={styles.punchType}>{punch.type === 'check_in' ? 'Entrada' : 'Salida'}</Text>
              <Text style={styles.value}>{formatDateTime(punch.effectiveAt)}</Text>
            </View>
            <View style={styles.punchMetaRow}>
              <Text style={styles.punchMeta}>
                {locationValidationLabels[punch.locationValidationStatus ?? ''] ?? 'Sin ubicación'}
                {typeof punch.salonDistanceMeters === 'number' ? ` · ${Math.round(punch.salonDistanceMeters)} m del salón` : ''}
              </Text>
              {punch.location ? (
                <Pressable onPress={() => openLocationInMaps(punch.location!)} hitSlop={8}>
                  <Text style={styles.mapLink}>Ver en el mapa</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </View>

      {incidents.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Incidencias reportadas</Text>
          {incidents.map((incident) => <Text key={incident._id} style={styles.listText}>• {incident.description}</Text>)}
        </View>
      ) : null}

      {adjustments.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Correcciones solicitadas</Text>
          {adjustments.map((adjustment) => <Text key={adjustment._id} style={styles.listText}>• {adjustment.reason} ({adjustment.status})</Text>)}
        </View>
      ) : null}

      <View style={styles.actions}>
        <AppButton title="Reportar un problema" variant="secondary" onPress={() => navigation.navigate('NewIncident', { workSessionId: session._id })} />
        {canRequestAdjustment ? <AppButton title="Solicitar corrección" variant="secondary" onPress={() => navigation.navigate('NewAdjustment', { workSessionId: session._id })} /> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  card: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.small, color: colors.textMuted },
  value: { ...typography.bodyStrong, color: colors.text },
  section: { gap: spacing.xs },
  sectionTitle: { ...typography.h3, color: colors.text },
  punchRow: { paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 },
  punchHeaderRow: { flexDirection: 'row', justifyContent: 'space-between' },
  punchMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  punchType: { ...typography.body, color: colors.text },
  punchMeta: { ...typography.caption, color: colors.textSubtle, flex: 1, marginRight: spacing.sm },
  mapLink: { ...typography.small, color: colors.info, fontWeight: '600' },
  listText: { ...typography.small, color: colors.textMuted },
  actions: { gap: spacing.sm }
});
