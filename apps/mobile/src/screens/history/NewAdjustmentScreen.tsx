import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { AppTextInput } from '../../components/AppTextInput';
import { DatePickerField } from '../../components/DatePickerField';
import { TimePickerField } from '../../components/TimePickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { api, ApiClientError } from '../../lib/api';
import { colors, spacing, typography } from '../../theme/tokens';
import type { HistoryStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'NewAdjustment'>;

function parseDateTime(date: string, time: string): string | undefined {
  if (!date.trim() || !time.trim()) return undefined;
  const iso = new Date(`${date.trim()}T${time.trim()}:00`);
  return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString();
}

function formatReference(value?: string): string {
  return value ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registrar';
}

export function NewAdjustmentScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { workSessionId, currentStartedAt, currentEndedAt } = route.params;
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (reason.trim().length < 3) return;
    setLoading(true);
    try {
      await api.post('/mobile/attendance/adjustments', {
        workSessionId,
        reason: reason.trim(),
        requestedStartAt: parseDateTime(startDate, startTime),
        requestedEndAt: parseDateTime(endDate, endTime)
      });
      showToast({ message: 'Solicitud de corrección enviada correctamente.', variant: 'success' });
      navigation.goBack();
    } catch (error) {
      showToast({ message: error instanceof ApiClientError ? error.message : 'No se pudo enviar la solicitud.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Solicitar corrección" description="Indicá el horario correcto y el motivo. Un administrador la va a revisar. Dejá una sección en blanco si no necesitás corregirla." />

        <AppCard style={styles.section}>
          <Text style={styles.sectionTitle}>Entrada</Text>
          <Text style={styles.reference}>Registrado: {formatReference(currentStartedAt)}</Text>
          <DatePickerField label="Fecha correcta" value={startDate} onChange={setStartDate} />
          <TimePickerField label="Hora correcta" value={startTime} onChange={setStartTime} />
        </AppCard>

        <AppCard style={styles.section}>
          <Text style={styles.sectionTitle}>Salida</Text>
          <Text style={styles.reference}>Registrado: {formatReference(currentEndedAt)}</Text>
          <DatePickerField label="Fecha correcta" value={endDate} onChange={setEndDate} />
          <TimePickerField label="Hora correcta" value={endTime} onChange={setEndTime} />
        </AppCard>

        <AppTextInput label="Motivo" value={reason} onChangeText={setReason} multiline numberOfLines={4} style={styles.textarea} placeholder="Explicá qué pasó con el registro de horario" />
        <AppButton title="Enviar solicitud" onPress={() => void submit()} loading={loading} disabled={reason.trim().length < 3} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, gap: spacing.md },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.text },
  reference: { ...typography.small, color: colors.textMuted, marginTop: -spacing.xs },
  textarea: { minHeight: 100, textAlignVertical: 'top', paddingTop: spacing.md }
});
