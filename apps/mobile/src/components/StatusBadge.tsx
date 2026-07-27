import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';

export type StatusTone = 'ok' | 'warn' | 'bad' | 'neutral' | 'info';

const toneStyles: Record<StatusTone, { bg: string; fg: string }> = {
  ok: { bg: colors.successBg, fg: colors.success },
  warn: { bg: colors.warningBg, fg: colors.warning },
  bad: { bg: colors.dangerBg, fg: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info },
  neutral: { bg: colors.surfaceMuted, fg: colors.textMuted }
};

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  const palette = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.label, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radii.pill, alignSelf: 'flex-start' },
  label: { ...typography.caption, fontWeight: '700', letterSpacing: 0.25 }
});
