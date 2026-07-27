import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadow, spacing, typography } from '../theme/tokens';

export function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.container}>
      <View style={styles.marker} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden', flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#E6EDF7', borderRadius: radii.lg, padding: spacing.lg, gap: 4, ...shadow.card },
  marker: { position: 'absolute', width: 74, height: 74, borderRadius: 38, backgroundColor: colors.accentSoft, right: -26, top: -30 },
  label: { ...typography.caption, color: colors.primarySoft, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  value: { ...typography.h2, color: colors.text, fontVariant: ['tabular-nums'] },
  hint: { ...typography.small, color: colors.textSubtle }
});
