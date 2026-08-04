import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppTextInput } from '../../components/AppTextInput';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { api, ApiClientError } from '../../lib/api';
import { attendanceIncidentTypeLabels } from '../../lib/attendanceLabels';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { HistoryStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HistoryStackParamList, 'NewIncident'>;

const types = Object.entries(attendanceIncidentTypeLabels);

export function NewIncidentScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [type, setType] = useState(types[0][0]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (description.trim().length < 3) return;
    setLoading(true);
    try {
      await api.post('/mobile/attendance/incidents', { type, description: description.trim(), workSessionId: route.params?.workSessionId });
      showToast({ message: 'Incidencia registrada correctamente.', variant: 'success' });
      navigation.goBack();
    } catch (error) {
      showToast({ message: error instanceof ApiClientError ? error.message : 'No se pudo registrar la incidencia.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Reportar incidencia" description="Contanos qué pasó para poder revisarlo." />
        <Text style={styles.label}>Tipo</Text>
        <View style={styles.chips}>
          {types.map(([value, label]) => (
            <Pressable key={value} onPress={() => setType(value)} style={[styles.chip, type === value && styles.chipActive]}>
              <Text style={[styles.chipText, type === value && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <AppTextInput label="Descripción" value={description} onChangeText={setDescription} multiline numberOfLines={4} style={styles.textarea} placeholder="Contá brevemente qué ocurrió" />
        <AppButton title="Enviar incidencia" onPress={() => void submit()} loading={loading} disabled={description.trim().length < 3} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: spacing.xl, gap: spacing.md },
  label: { ...typography.small, color: colors.textMuted, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { ...typography.small, color: colors.text },
  chipTextActive: { color: colors.primaryText },
  textarea: { minHeight: 120, textAlignVertical: 'top', paddingTop: spacing.md }
});
