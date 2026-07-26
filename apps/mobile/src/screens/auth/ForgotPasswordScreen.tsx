import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { api, ApiClientError } from '../../lib/api';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AuthStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!username.trim()) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/mobile/auth/forgot-password', { username: username.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'No se pudo enviar la solicitud.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Recuperar contraseña" description="Te enviamos un código para restablecerla si tu usuario tiene acceso a la app." />
      {sent ? (
        <View style={styles.sent}>
          <Text style={styles.sentTitle}>Revisá tu email</Text>
          <Text style={styles.sentBody}>Si el usuario existe vas a recibir instrucciones. Abrí el enlace o pegá el código en la siguiente pantalla.</Text>
          <AppButton title="Ya tengo el código" variant="secondary" onPress={() => navigation.navigate('ResetPassword')} />
        </View>
      ) : (
        <View style={styles.form}>
          <AppTextInput label="Usuario o email" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton title="Enviar instrucciones" onPress={() => void submit()} loading={loading} disabled={!username.trim()} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, padding: spacing.xl, gap: spacing.xl },
  form: { gap: spacing.lg },
  sent: { gap: spacing.md },
  sentTitle: { ...typography.h3, color: colors.text },
  sentBody: { ...typography.body, color: colors.textMuted },
  error: { ...typography.small, color: colors.danger }
});
