import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { useAuthStore } from '../../state/authStore';
import { colors, spacing, typography } from '../../theme/tokens';

export function BiometricSetupScreen() {
  const insets = useSafeAreaInsets();
  const enableBiometricFromPendingLogin = useAuthStore((state) => state.enableBiometricFromPendingLogin);
  const dismissBiometricPrompt = useAuthStore((state) => state.dismissBiometricPrompt);

  async function enable() {
    await enableBiometricFromPendingLogin();
    dismissBiometricPrompt();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.body}>
        <Text style={styles.icon}>🔐</Text>
        <Text style={styles.title}>Desbloqueo rápido</Text>
        <Text style={styles.description}>
          Activá la huella o Face ID de tu dispositivo para abrir la app sin escribir tu contraseña cada vez, incluso
          después de cerrar sesión. Nunca se envía ni se guarda información biométrica en el servidor: tu contraseña
          queda cifrada solo en este dispositivo, protegida por tu huella o Face ID.
        </Text>
      </View>
      <View style={styles.actions}>
        <AppButton title="Activar ahora" onPress={() => void enable()} />
        <AppButton title="Configurar más tarde" variant="ghost" onPress={dismissBiometricPrompt} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, justifyContent: 'space-between' },
  body: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xxl },
  icon: { fontSize: 48 },
  title: { ...typography.h1, color: colors.text },
  description: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  actions: { gap: spacing.sm }
});
