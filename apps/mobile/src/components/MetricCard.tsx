import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';

export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, gap: 4 },
  label: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase' },
  value: { ...typography.h3, color: colors.text },
  hint: { ...typography.small, color: colors.textSubtle }
});
