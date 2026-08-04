import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { AppTextInput } from '../../components/AppTextInput';
import { DatePickerField } from '../../components/DatePickerField';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { api, ApiClientError } from '../../lib/api';
import { useAuthStore } from '../../state/authStore';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ProfileStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;

function dateInputValue(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

export function EditProfileScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const user = useAuthStore((state) => state.user);
  const refreshSessionUser = useAuthStore((state) => state.refreshSessionUser);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [documentType, setDocumentType] = useState(user?.documentType || user?.staffProfile?.documentType || 'DNI');
  const [documentNumber, setDocumentNumber] = useState(user?.documentNumber || user?.staffProfile?.documentNumber || '');
  const [birthDate, setBirthDate] = useState(dateInputValue(user?.birthDate || user?.staffProfile?.birthDate));
  const [address, setAddress] = useState(user?.address || user?.staffProfile?.address || '');
  const [emergencyContactName, setEmergencyContactName] = useState(user?.emergencyContactName || user?.staffProfile?.emergencyContactName || '');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(user?.emergencyContactPhone || user?.staffProfile?.emergencyContactPhone || '');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true);
    try {
      await api.patch('/mobile/me', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        documentType: documentType.trim(),
        documentNumber: documentNumber.trim(),
        birthDate,
        address: address.trim(),
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim()
      });
      await refreshSessionUser();
      showToast({ message: 'Perfil actualizado correctamente.', variant: 'success' });
      navigation.goBack();
    } catch (error) {
      showToast({ message: error instanceof ApiClientError ? error.message : 'No se pudo actualizar el perfil.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Editar perfil" description="Actualizá tus datos personales y de contacto." />
        <AppCard style={styles.section}>
          <Text style={styles.sectionTitle}>Datos personales</Text>
          <AppTextInput label="Usuario" value={user?.username ?? ''} editable={false} hint="El usuario de acceso se administra desde Administración." />
          <AppTextInput label="Nombre" value={firstName} onChangeText={setFirstName} />
          <AppTextInput label="Apellido" value={lastName} onChangeText={setLastName} />
          <AppTextInput label="Tipo de documento" value={documentType} onChangeText={setDocumentType} placeholder="DNI" autoCapitalize="characters" />
          <AppTextInput label="DNI / número de documento" value={documentNumber} onChangeText={setDocumentNumber} keyboardType="number-pad" />
          <DatePickerField label="Fecha de nacimiento" value={birthDate} onChange={setBirthDate} hint="Elegí la fecha desde el calendario." />
        </AppCard>
        <AppCard style={styles.section}>
          <Text style={styles.sectionTitle}>Contacto</Text>
          <AppTextInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <AppTextInput label="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <AppTextInput label="Dirección" value={address} onChangeText={setAddress} multiline style={styles.addressInput} textAlignVertical="top" />
        </AppCard>
        <AppCard style={styles.section}>
          <Text style={styles.sectionTitle}>Contacto de emergencia</Text>
          <AppTextInput label="Nombre y vínculo" value={emergencyContactName} onChangeText={setEmergencyContactName} placeholder="Por ejemplo: María Pérez · madre" />
          <AppTextInput label="Teléfono de emergencia" value={emergencyContactPhone} onChangeText={setEmergencyContactPhone} keyboardType="phone-pad" />
        </AppCard>
        <AppButton title="Guardar cambios" onPress={() => void submit()} loading={loading} disabled={!firstName.trim() || !lastName.trim()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: spacing.xl, gap: spacing.md },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.text },
  addressInput: { minHeight: 84, paddingTop: spacing.md }
});
