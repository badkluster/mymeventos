import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { AmbientBackdrop } from '../../components/AmbientBackdrop';
import { AnimatedEntrance } from '../../components/AnimatedEntrance';
import { colors, radii, shadow, spacing, typography } from '../../theme/tokens';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <AmbientBackdrop dark />
      <AnimatedEntrance distance={18}>
        <View style={styles.brand}>
          <View style={styles.logoRing}><Image source={require('../../../assets/icon.png')} style={styles.logo} accessibilityLabel="M&M Eventos" /></View>
          <Text style={styles.eyebrow}>M&M EVENTOS</Text>
          <Text style={styles.title}>Preparando tu jornada</Text>
          <ActivityIndicator color={colors.accent} style={styles.spinner} />
        </View>
      </AnimatedEntrance>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundDark, alignItems: 'center', justifyContent: 'center' },
  brand: { alignItems: 'center', gap: spacing.sm },
  logoRing: { width: 118, height: 118, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.42)', ...shadow.glow },
  logo: { width: 94, height: 94, borderRadius: 27 },
  eyebrow: { ...typography.caption, color: colors.accent, fontWeight: '700', letterSpacing: 1.5, marginTop: spacing.lg },
  title: { ...typography.h2, color: colors.primaryText },
  spinner: { marginTop: spacing.lg }
});
