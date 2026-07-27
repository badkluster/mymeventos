import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { colors, radii, shadow, spacing, typography } from '../theme/tokens';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function AppButton({
  title, onPress, variant = 'primary', loading = false, disabled = false, icon, fullWidth = true, testID
}: {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  testID?: string;
}) {
  const isDisabled = disabled || loading;
  const pressScale = useRef(new Animated.Value(1)).current;
  const animatePress = (toValue: number) => {
    Animated.spring(pressScale, { toValue, speed: 34, bounciness: 3, useNativeDriver: true }).start();
  };
  return (
    <Animated.View style={[fullWidth && styles.fullWidth, { transform: [{ scale: pressScale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        testID={testID}
        onPress={isDisabled ? undefined : onPress}
        onPressIn={() => !isDisabled && animatePress(0.975)}
        onPressOut={() => animatePress(1)}
        style={[styles.base, variantStyles[variant], isDisabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? colors.primaryText : colors.text} />
        ) : (
          <View style={styles.content}>
            {icon}
            <Text style={[styles.label, labelStyles[variant]]}>{title}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  fullWidth: { width: '100%' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.bodyStrong },
  disabled: { opacity: 0.5 }
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary, ...shadow.card },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.danger, ...shadow.card },
  ghost: { backgroundColor: 'transparent' }
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.primaryText },
  secondary: { color: colors.text },
  danger: { color: colors.primaryText },
  ghost: { color: colors.text }
});
