import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { useAuthStore } from '../../state/authStore';
import { colors, spacing, typography } from '../../theme/tokens';

export function BiometricUnlockScreen() {
  const unlockWithBiometrics = useAuthStore((state) => state.unlockWithBiometrics);
  const fallbackToPassword = useAuthStore((state) => state.fallbackToPassword);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function tryUnlock() {
    setChecking(true);
    setError('');
    const success = await unlockWithBiometrics();
    setChecking(false);
    if (!success) setError('No pudimos verificar tu identidad. Intentá de nuevo o ingresá con tu contraseña.');
  }

  useEffect(() => { void tryUnlock(); }, []);

  return (
    <View style={styles.container}>
      <Image source={require('../../../assets/icon.png')} style={styles.logo} accessibilityLabel="M&M Eventos" />
      <Text style={styles.icon}>🔒</Text>
      <Text style={styles.title}>Sesión bloqueada</Text>
      <Text style={styles.subtitle}>Verificá tu identidad para continuar.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <AppButton title="Intentar de nuevo" onPress={() => void tryUnlock()} loading={checking} />
        <AppButton title="Ingresar con contraseña" variant="ghost" onPress={fallbackToPassword} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  logo: { width: 72, height: 72, borderRadius: 18, marginBottom: spacing.lg },
  icon: { fontSize: 40 },
  title: { ...typography.h2, color: colors.primaryText },
  subtitle: { ...typography.body, color: '#D4D4D8', textAlign: 'center' },
  error: { ...typography.small, color: '#FCA5A5', textAlign: 'center' },
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.xl }
});
