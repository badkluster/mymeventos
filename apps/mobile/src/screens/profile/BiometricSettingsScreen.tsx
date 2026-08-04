import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppCard } from '../../components/AppCard';
import { ConfirmationSheet } from '../../components/ConfirmationSheet';
import { PasswordInput } from '../../components/PasswordInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { authenticateWithBiometrics, isBiometricSupported } from '../../lib/biometrics';
import { useAuthStore } from '../../state/authStore';
import { colors, spacing, typography } from '../../theme/tokens';

export function BiometricSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const biometricEnabled = useAuthStore((state) => state.biometricEnabled);
  const confirmPasswordForBiometrics = useAuthStore((state) => state.confirmPasswordForBiometrics);
  const disableBiometric = useAuthStore((state) => state.disableBiometric);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => { void isBiometricSupported().then(setSupported); }, []);

  async function toggle(next: boolean) {
    if (!next) {
      setBusy(true);
      try {
        await disableBiometric();
        showToast({ message: 'Desbloqueo rápido desactivado.', variant: 'success' });
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const confirmed = await authenticateWithBiometrics('Confirmá tu identidad para activar el desbloqueo rápido');
      if (!confirmed) return showToast({ message: 'No pudimos verificar tu identidad.', variant: 'error' });
      setPassword('');
      setPasswordError('');
      setShowPasswordPrompt(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPassword() {
    if (!password) return;
    setBusy(true);
    setPasswordError('');
    try {
      const ok = await confirmPasswordForBiometrics(password);
      if (ok) {
        setShowPasswordPrompt(false);
        setPassword('');
        showToast({ message: 'Desbloqueo rápido activado. Ya podés ingresar con huella incluso después de cerrar sesión.', variant: 'success' });
      } else {
        setPasswordError('Contraseña incorrecta.');
      }
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
            <Text style={styles.body}>
              Te permite abrir la app e ingresar con huella incluso después de cerrar sesión. Tu contraseña queda
              cifrada solo en este dispositivo — nunca se envía ni se guarda en el servidor.
            </Text>
          </View>
          <Switch value={biometricEnabled} onValueChange={(value) => void toggle(value)} disabled={busy} />
        </AppCard>
      )}

      <ConfirmationSheet
        visible={showPasswordPrompt}
        title="Confirmá tu contraseña"
        description="Para activar el ingreso con huella necesitamos validar tu contraseña una sola vez."
        confirmLabel="Activar"
        onConfirm={() => void confirmPassword()}
        onCancel={() => { setShowPasswordPrompt(false); setPassword(''); setPasswordError(''); }}
        loading={busy}
      >
        <PasswordInput
          value={password}
          onChangeText={(value) => { setPassword(value); if (passwordError) setPasswordError(''); }}
          error={passwordError}
          onSubmitEditing={() => void confirmPassword()}
        />
      </ConfirmationSheet>
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
