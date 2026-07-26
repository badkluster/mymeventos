import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { StatusBadge, type StatusTone } from './StatusBadge';

const statusLabels: Record<string, { label: string; tone: StatusTone }> = {
  active: { label: 'Activa', tone: 'ok' },
  completed: { label: 'Completada', tone: 'ok' },
  incomplete: { label: 'Incompleta', tone: 'bad' },
  under_review: { label: 'En revisión', tone: 'warn' },
  adjusted: { label: 'Ajustada', tone: 'warn' },
  cancelled: { label: 'Cancelada', tone: 'neutral' }
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(value));
}
function formatTime(value?: string): string {
  return value ? new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
}
function formatDuration(minutes?: number): string {
  if (minutes === undefined || minutes === null) return 'Sin calcular';
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return `${hours}h ${remaining}m`;
}

export function HistoryItem({
  startedAt, endedAt, status, workedMinutes, salonName, onPress
}: { startedAt: string; endedAt?: string; status: string; workedMinutes?: number; salonName?: string; onPress?: () => void }) {
  const info = statusLabels[status] ?? { label: status, tone: 'neutral' as StatusTone };
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
      <View style={styles.left}>
        <Text style={styles.date}>{formatDate(startedAt)}</Text>
        <Text style={styles.time}>{formatTime(startedAt)} – {formatTime(endedAt)}{salonName ? ` · ${salonName}` : ''}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.duration}>{formatDuration(workedMinutes)}</Text>
        <StatusBadge label={info.label} tone={info.tone} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  left: { gap: 2, flex: 1 },
  date: { ...typography.bodyStrong, color: colors.text, textTransform: 'capitalize' },
  time: { ...typography.small, color: colors.textMuted },
  right: { alignItems: 'flex-end', gap: 4 },
  duration: { ...typography.bodyStrong, color: colors.text }
});
