import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { StatusBadge } from './StatusBadge';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function WorkStatusCard({ startedAt, salonName, eventName }: { startedAt: string; salonName?: string; eventName?: string }) {
  const [elapsed, setElapsed] = useState(() => Date.now() - new Date(startedAt).getTime());

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - new Date(startedAt).getTime()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <StatusBadge label="Jornada activa" tone="ok" />
        <Text style={styles.since}>Desde las {new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(startedAt))}</Text>
      </View>
      <Text style={styles.timer} accessibilityLabel={`Tiempo trabajado: ${formatElapsed(elapsed)}`}>{formatElapsed(elapsed)}</Text>
      <Text style={styles.hint}>El tiempo es informativo — el cálculo oficial de horas lo hace el servidor al finalizar.</Text>
      {(salonName || eventName) ? (
        <View style={styles.meta}>
          {salonName ? <Text style={styles.metaText}>{salonName}</Text> : null}
          {eventName ? <Text style={styles.metaText}>{eventName}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.text, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  since: { ...typography.small, color: '#D4D4D8' },
  timer: { fontSize: 44, fontWeight: '700', color: colors.primaryText, letterSpacing: 1, fontVariant: ['tabular-nums'] },
  hint: { ...typography.caption, color: '#A1A1AA' },
  meta: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  metaText: { ...typography.small, color: '#E4E4E7' }
});
