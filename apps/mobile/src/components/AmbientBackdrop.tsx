import { StyleSheet, View } from 'react-native';
import { colors } from '../theme/tokens';

export function AmbientBackdrop({ dark = false }: { dark?: boolean }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? colors.backgroundDeep : colors.background }]}>
      <View style={[styles.orb, styles.orbTop, { backgroundColor: dark ? '#12395F' : colors.accentSoft }]} />
      <View style={[styles.orb, styles.orbBottom, { backgroundColor: dark ? '#302262' : colors.violetSoft }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: { position: 'absolute', borderRadius: 999, opacity: 0.68 },
  orbTop: { width: 300, height: 300, right: -130, top: -115 },
  orbBottom: { width: 270, height: 270, left: -165, bottom: 80 }
});
