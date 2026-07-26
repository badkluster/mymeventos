import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image source={require('../../../assets/icon.png')} style={styles.logo} accessibilityLabel="M&M Eventos" />
      <Text style={styles.title}>M&M Eventos</Text>
      <ActivityIndicator color="#FFFFFF" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  logo: { width: 96, height: 96, borderRadius: 24 },
  title: { ...typography.h2, color: colors.primaryText },
  spinner: { marginTop: spacing.xl }
});
