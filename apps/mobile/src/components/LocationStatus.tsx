import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { StatusBadge, type StatusTone } from './StatusBadge';

export type LocationState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'low_accuracy';

const copy: Record<LocationState, { label: string; tone: StatusTone; description: string }> = {
  idle: { label: 'Ubicación', tone: 'neutral', description: 'Se solicitará para registrar el punto del fichaje.' },
  requesting: { label: 'Buscando ubicación…', tone: 'info', description: 'Esto puede tardar unos segundos.' },
  ready: { label: 'Ubicación lista', tone: 'ok', description: 'Este punto se registrará junto con el fichaje.' },
  denied: { label: 'Permiso denegado', tone: 'bad', description: 'Activá el permiso de ubicación para registrar el punto del fichaje.' },
  unavailable: { label: 'Ubicación no disponible', tone: 'warn', description: 'No se pudo registrar la ubicación; el fichaje quedará para revisión.' },
  low_accuracy: { label: 'Precisión baja', tone: 'warn', description: 'El punto se registrará con menor precisión.' }
};

export function LocationStatus({ state, onOpenSettings }: { state: LocationState; onOpenSettings?: () => void }) {
  const info = copy[state];
  return (
    <View style={styles.container}>
      <StatusBadge label={info.label} tone={info.tone} />
      <Text style={styles.description}>{info.description}</Text>
      {state === 'denied' && onOpenSettings ? (
        <Text onPress={onOpenSettings} style={styles.link}>Abrir configuración del dispositivo</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  description: { ...typography.small, color: colors.textMuted },
  link: { ...typography.small, color: colors.info, fontWeight: '600' }
});
