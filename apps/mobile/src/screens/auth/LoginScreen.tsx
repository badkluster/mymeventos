import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { PasswordInput } from '../../components/PasswordInput';
import { useAuthStore } from '../../state/authStore';
import { colors, spacing, typography } from '../../theme/tokens';
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
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Image source={require('../../../assets/icon.png')} style={styles.logo} accessibilityLabel="M&M Eventos" />
          <Text style={styles.title}>Hola de nuevo</Text>
          <Text style={styles.subtitle}>Ingresá con tu usuario para fichar y ver tu actividad.</Text>
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
        <Text style={styles.footer}>El registro de nuevos usuarios lo gestiona tu administrador.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: 'center', gap: spacing.xxl },
  brand: { alignItems: 'center', gap: spacing.xs },
  logo: { width: 72, height: 72, borderRadius: 18, marginBottom: spacing.md },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  form: { gap: spacing.lg },
  error: { ...typography.small, color: colors.danger, textAlign: 'center' },
  forgot: { ...typography.small, color: colors.text, fontWeight: '600', textAlign: 'center', textDecorationLine: 'underline' },
  footer: { ...typography.caption, color: colors.textSubtle, textAlign: 'center' }
});
