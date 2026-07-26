import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppCard } from '../../components/AppCard';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { authenticateWithBiometrics, isBiometricSupported } from '../../lib/biometrics';
import { useAuthStore } from '../../state/authStore';
import { colors, spacing, typography } from '../../theme/tokens';

export function BiometricSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const biometricEnabled = useAuthStore((state) => state.biometricEnabled);
  const updateBiometricPreference = useAuthStore((state) => state.updateBiometricPreference);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void isBiometricSupported().then(setSupported); }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const confirmed = await authenticateWithBiometrics('Confirmá tu identidad para activar el desbloqueo rápido');
        if (!confirmed) return showToast({ message: 'No pudimos verificar tu identidad.', variant: 'error' });
      }
      await updateBiometricPreference(next);
      showToast({ message: next ? 'Desbloqueo rápido activado.' : 'Desbloqueo rápido desactivado.', variant: 'success' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.lg }]}>
      <ScreenHeader title="Seguridad y biometría" description="Protegé el acceso local a tu sesión con huella digital o Face ID." />
      {supported === false ? (
        <AppCard><Text style={styles.body}>Este dispositivo no tiene biometría configurada. Activala en la configuración del sistema operativo para poder usarla acá.</Text></AppCard>
      ) : (
        <AppCard style={styles.row}>
          <View style={styles.textBlock}>
            <Text style={styles.title}>Desbloqueo con huella/Face ID</Text>
            <Text style={styles.body}>No reemplaza tu contraseña ni se envía al servidor. Solo protege el acceso local en este dispositivo.</Text>
          </View>
          <Switch value={biometricEnabled} onValueChange={(value) => void toggle(value)} disabled={busy} />
        </AppCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  textBlock: { flex: 1, gap: 4 },
  title: { ...typography.bodyStrong, color: colors.text },
  body: { ...typography.small, color: colors.textMuted }
});
