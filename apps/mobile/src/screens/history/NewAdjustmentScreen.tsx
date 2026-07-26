import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { api, ApiClientError } from '../../lib/api';
import { spacing } from '../../theme/tokens';
import type { HistoryStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'NewAdjustment'>;

function parseDateTime(date: string, time: string): string | undefined {
  if (!date.trim() || !time.trim()) return undefined;
  const iso = new Date(`${date.trim()}T${time.trim()}:00`);
  return Number.isNaN(iso.getTime()) ? undefined : iso.toISOString();
}

export function NewAdjustmentScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { workSessionId } = route.params;
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
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Solicitar corrección" description="Indicá el horario correcto y el motivo. Un administrador la va a revisar." />
      <AppTextInput label="Fecha de entrada correcta (AAAA-MM-DD)" value={startDate} onChangeText={setStartDate} placeholder="2026-07-25" />
      <AppTextInput label="Hora de entrada correcta (HH:MM)" value={startTime} onChangeText={setStartTime} placeholder="21:00" />
      <AppTextInput label="Fecha de salida correcta (AAAA-MM-DD)" value={endDate} onChangeText={setEndDate} placeholder="2026-07-26" />
      <AppTextInput label="Hora de salida correcta (HH:MM)" value={endTime} onChangeText={setEndTime} placeholder="05:00" />
      <AppTextInput label="Motivo" value={reason} onChangeText={setReason} multiline numberOfLines={4} style={styles.textarea} placeholder="Explicá qué pasó con la marcación" />
      <AppButton title="Enviar solicitud" onPress={() => void submit()} loading={loading} disabled={reason.trim().length < 3} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, gap: spacing.md },
  textarea: { minHeight: 100, textAlignVertical: 'top', paddingTop: spacing.md }
});
