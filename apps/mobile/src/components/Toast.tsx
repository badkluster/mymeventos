import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';

type ToastVariant = 'success' | 'error' | 'info';
type ToastInput = { message: string; variant?: ToastVariant; durationMs?: number };
type ToastEntry = ToastInput & { id: string };

type ToastContextValue = { showToast: (input: ToastInput | string, variant?: ToastVariant) => void };

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const variantStyles: Record<ToastVariant, { bg: string; fg: string }> = {
  success: { bg: colors.successBg, fg: colors.success },
  error: { bg: colors.dangerBg, fg: colors.danger },
  info: { bg: colors.infoBg, fg: colors.info }
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: string) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const showToast = useCallback((input: ToastInput | string, fallbackVariant: ToastVariant = 'info') => {
    const normalized: ToastInput = typeof input === 'string' ? { message: input, variant: fallbackVariant } : input;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [...current.slice(-2), { ...normalized, id, variant: normalized.variant ?? fallbackVariant }]);
    setTimeout(() => dismiss(id), normalized.durationMs ?? (normalized.variant === 'error' ? 5000 : 3200));
  }, [dismiss]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="none" style={styles.overlay}>
        {toasts.map((toast) => {
          const palette = variantStyles[toast.variant ?? 'info'];
          return (
            <View key={toast.id} style={[styles.toast, { backgroundColor: palette.bg }]}>
              <Text style={[styles.text, { color: palette.fg }]}>{toast.message}</Text>
            </View>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider.');
  return context;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: spacing.xl, left: spacing.lg, right: spacing.lg, gap: spacing.sm },
  toast: { borderRadius: radii.md, padding: spacing.md },
  text: { ...typography.small, fontWeight: '600' }
});
