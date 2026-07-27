import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AmbientBackdrop } from '../../components/AmbientBackdrop';
import { AnimatedEntrance } from '../../components/AnimatedEntrance';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { PasswordInput } from '../../components/PasswordInput';
import { useAuthStore } from '../../state/authStore';
import { colors, radii, shadow, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const login = useAuthStore((state) => state.login);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit() {
    if (!username.trim() || !password) return;
    try {
      await login({ username: username.trim(), password });
    } catch {
      // error is surfaced via the store's `error` field
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AmbientBackdrop dark />
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <AnimatedEntrance distance={22}>
          <View style={styles.brand}>
            <View style={styles.logoRing}>
              <Image source={require('../../../assets/icon.png')} style={styles.logo} accessibilityLabel="M&M Eventos" />
            </View>
            <Text style={styles.eyebrow}>M&M EVENTOS · STAFF</Text>
            <Text style={styles.title}>Tu jornada,{`\n`}siempre en orden.</Text>
            <Text style={styles.subtitle}>Ingresá para registrar tu horario y seguir toda tu actividad.</Text>
          </View>
        </AnimatedEntrance>

        <AnimatedEntrance delay={110} distance={18}>
          <View style={styles.formShell}>
            <View style={styles.formHeading}>
              <View style={styles.liveDot} />
              <Text style={styles.formTitle}>Acceso seguro</Text>
            </View>
            <View style={styles.form}>
              <AppTextInput
                label="Usuario o email"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="username"
                value={username}
                onChangeText={(value) => { setUsername(value); if (error) clearError(); }}
                returnKeyType="next"
              />
              <PasswordInput
                value={password}
                onChangeText={(value) => { setPassword(value); if (error) clearError(); }}
                returnKeyType="done"
                onSubmitEditing={() => void handleSubmit()}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <AppButton title="Ingresar" onPress={() => void handleSubmit()} loading={loading} disabled={!username.trim() || !password} />
              <Text style={styles.forgot} onPress={() => navigation.navigate('ForgotPassword')}>¿Olvidaste tu contraseña?</Text>
            </View>
          </View>
        </AnimatedEntrance>

        <AnimatedEntrance delay={200} distance={12}>
          <Text style={styles.footer}>El registro de nuevos usuarios lo gestiona tu administrador.</Text>
        </AnimatedEntrance>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.backgroundDark },
  container: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: 'center', gap: spacing.xxl },
  brand: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  logoRing: { width: 92, height: 92, borderRadius: radii.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.4)', marginBottom: spacing.sm, ...shadow.glow },
  logo: { width: 72, height: 72, borderRadius: 20 },
  eyebrow: { ...typography.caption, fontWeight: '700', color: colors.accent, letterSpacing: 1.4 },
  title: { ...typography.display, color: colors.primaryText, textAlign: 'center', lineHeight: 39 },
  subtitle: { ...typography.body, color: '#B6C7DD', textAlign: 'center', lineHeight: 22, maxWidth: 290 },
  formShell: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.lg, ...shadow.card },
  formHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  formTitle: { ...typography.bodyStrong, color: colors.text },
  form: { gap: spacing.lg },
  error: { ...typography.small, color: colors.danger, textAlign: 'center' },
  forgot: { ...typography.small, color: colors.primarySoft, fontWeight: '700', textAlign: 'center' },
  footer: { ...typography.caption, color: '#A9BAD0', textAlign: 'center', paddingHorizontal: spacing.lg }
});
