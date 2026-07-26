import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export function ScreenHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.lg },
  textBlock: { flex: 1, gap: 4 },
  title: { ...typography.h1, color: colors.text },
  description: { ...typography.body, color: colors.textMuted }
});
