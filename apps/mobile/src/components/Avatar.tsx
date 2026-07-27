import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, shadow, typography } from '../theme/tokens';

function initials(name?: string): string {
  if (!name) return 'MM';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'MM';
}

export function Avatar({ uri, name, size = 48 }: { uri?: string; name?: string; size?: number }) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={[styles.image, dimension]} accessibilityLabel={name ? `Avatar de ${name}` : 'Avatar'} />;
  return (
    <View style={[styles.fallback, dimension]}>
      <Text style={[typography.bodyStrong, styles.initials, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceMuted, borderWidth: 2, borderColor: colors.accentSoft, ...shadow.card },
  fallback: { backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  initials: { color: colors.primaryText }
});
