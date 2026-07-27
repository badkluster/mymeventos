import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export function OfflineBanner({ pendingCount }: { pendingCount?: number }) {
  return (
    <View style={styles.container} accessibilityRole="alert">
      <Text style={styles.text}>
        Sin conexión{pendingCount ? ` · ${pendingCount} registro${pendingCount === 1 ? '' : 's'} de horario pendiente${pendingCount === 1 ? '' : 's'} de sincronizar` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.warningBg, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, alignItems: 'center' },
  text: { ...typography.small, color: colors.warning, fontWeight: '600' }
});
