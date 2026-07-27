import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadow, spacing, typography } from '../theme/tokens';

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
      <View style={styles.glow} />
      <View style={styles.header}>
        <View style={styles.statusGroup}>
          <View style={styles.pulse} />
          <Text style={styles.statusText}>JORNADA ACTIVA</Text>
        </View>
        <Text style={styles.since}>Desde las {new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(startedAt))}</Text>
      </View>
      <View style={styles.timerBlock}>
        <Text style={styles.timerLabel}>TIEMPO TRANSCURRIDO</Text>
        <Text style={styles.timer} accessibilityLabel={`Tiempo trabajado: ${formatElapsed(elapsed)}`}>{formatElapsed(elapsed)}</Text>
      </View>
      <Text style={styles.hint}>El tiempo es informativo — el cálculo oficial de horas lo hace el servidor al finalizar.</Text>
      {(salonName || eventName) ? (
        <View style={styles.meta}>
          {salonName ? <Text style={styles.metaText}>◈ {salonName}</Text> : null}
          {eventName ? <Text style={styles.metaText}>· {eventName}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', backgroundColor: colors.backgroundDark, borderRadius: radii.xl, padding: spacing.xl, gap: spacing.md, ...shadow.card },
  glow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -70, top: -80, backgroundColor: 'rgba(124,92,252,0.34)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#55E9A7', shadowColor: '#55E9A7', shadowOpacity: 0.8, shadowRadius: 7, elevation: 4 },
  statusText: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 1 },
  since: { ...typography.small, color: '#C7D5E8' },
  timerBlock: { gap: 2 },
  timerLabel: { ...typography.caption, color: '#A9BAD0', fontWeight: '700', letterSpacing: 1 },
  timer: { fontSize: 45, fontWeight: '800', color: colors.primaryText, letterSpacing: 1.2, fontVariant: ['tabular-nums'] },
  hint: { ...typography.caption, color: '#A9BAD0', lineHeight: 17 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  metaText: { ...typography.small, color: '#DDE8F8' }
});
