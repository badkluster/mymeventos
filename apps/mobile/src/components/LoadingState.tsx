import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.text} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  label: { ...typography.small, color: colors.textMuted }
});
