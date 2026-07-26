import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { AppButton } from './AppButton';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>No pudimos completar la acción</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <View style={styles.action}><AppButton title="Reintentar" variant="secondary" onPress={onRetry} fullWidth={false} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.xs },
  title: { ...typography.bodyStrong, color: colors.danger, textAlign: 'center' },
  message: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  action: { marginTop: spacing.md }
});
