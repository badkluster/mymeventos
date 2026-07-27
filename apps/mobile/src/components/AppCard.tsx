import { StyleSheet, View, type ViewProps } from 'react-native';
import { colors, radii, spacing, shadow } from '../theme/tokens';

export function AppCard({ style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: '#E6EDF7',
    padding: spacing.lg,
    ...shadow.card
  }
});
