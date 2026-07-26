import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { AppButton } from './AppButton';

export function EmptyState({ title, description, actionLabel, onAction }: { title: string; description?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? <View style={styles.action}><AppButton title={actionLabel} variant="secondary" onPress={onAction} fullWidth={false} /></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.xs },
  title: { ...typography.bodyStrong, color: colors.text, textAlign: 'center' },
  description: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
  action: { marginTop: spacing.md }
});
