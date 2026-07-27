import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadow, spacing, typography } from '../theme/tokens';
import { AppButton } from './AppButton';

export function ConfirmationSheet({
  visible, title, description, confirmLabel, cancelLabel = 'Cancelar', onConfirm, onCancel, loading, danger, children
}: {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cerrar" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={[styles.icon, danger ? styles.iconDanger : styles.iconPrimary]}><Text style={[styles.iconText, danger ? styles.iconTextDanger : styles.iconTextPrimary]}>{danger ? '!' : '◈'}</Text></View>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
          {children}
          <View style={styles.actions}>
            <View style={styles.actionItem}><AppButton title={cancelLabel} variant="secondary" onPress={onCancel} /></View>
            <View style={styles.actionItem}><AppButton title={confirmLabel} variant={danger ? 'danger' : 'primary'} onPress={onConfirm} loading={loading} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: spacing.xl, gap: spacing.md, ...shadow.card },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: colors.surfaceStrong, marginBottom: spacing.sm },
  icon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  iconPrimary: { backgroundColor: colors.accentSoft },
  iconDanger: { backgroundColor: colors.dangerBg },
  iconText: { fontSize: 20, fontWeight: '800' },
  iconTextPrimary: { color: colors.primarySoft },
  iconTextDanger: { color: colors.danger },
  title: { ...typography.h2, color: colors.text },
  description: { ...typography.body, color: colors.textMuted },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  actionItem: { flex: 1 }
});
