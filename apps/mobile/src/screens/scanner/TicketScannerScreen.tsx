import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { AppTextInput } from '../../components/AppTextInput';
import { api, ApiClientError } from '../../lib/api';
import { colors, radii, shadow, spacing, typography } from '../../theme/tokens';
import type { ScannerStackParamList } from '../../navigation/types';
import type { TicketCheckInResponse, TicketCheckInStatus, TicketScanResult } from '../../types/tickets';

type Props = NativeStackScreenProps<ScannerStackParamList, 'TicketScanner'>;
type ResultTone = 'success' | 'warning' | 'danger';

const resultCopy: Record<TicketCheckInStatus, { title: string; description: string; tone: ResultTone }> = {
  valid: { title: 'Entrada válida', description: 'Revisá los datos y confirmá el ingreso.', tone: 'success' },
  accepted: { title: 'Ingreso registrado', description: 'La entrada quedó utilizada correctamente.', tone: 'success' },
  already_checked_in: { title: 'Entrada ya utilizada', description: 'Este código ya registró un ingreso y no puede volver a usarse.', tone: 'warning' },
  expired: { title: 'Entrada vencida', description: 'El código quedó fuera de la ventana de validez configurada.', tone: 'warning' },
  wrong_publication: { title: 'Entrada de otro evento', description: 'El QR no corresponde al evento seleccionado.', tone: 'danger' },
  cancelled: { title: 'Entrada cancelada', description: 'Esta entrada fue cancelada y no habilita el acceso.', tone: 'danger' },
  refunded: { title: 'Entrada reembolsada', description: 'Esta entrada fue reembolsada y no habilita el acceso.', tone: 'danger' },
  transferred: { title: 'Entrada transferida', description: 'Este código fue reemplazado al transferir la entrada.', tone: 'danger' },
  invalid: { title: 'Entrada inválida', description: 'No encontramos una entrada asociada a este código.', tone: 'danger' },
  error: { title: 'No se pudo validar', description: 'Revisá la conexión e intentá nuevamente.', tone: 'danger' }
};

const ticketStatusLabels: Record<string, string> = {
  issued: 'Emitida',
  checked_in: 'Utilizada',
  cancelled: 'Cancelada',
  refunded: 'Reembolsada',
  expired: 'Vencida',
  transferred: 'Transferida'
};

function formatDate(value?: string): string | undefined {
  return value
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(value))
    : undefined;
}

export function TicketScannerScreen({ route }: Props) {
  const { publication } = route.params;
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<TicketScanResult>();
  const busyRef = useRef(false);

  const accessPoint = `App móvil · ${publication.title}`.slice(0, 120);

  async function validateTicket(value: string) {
    const scanValue = value.trim();
    if (!scanValue || busyRef.current) return;
    busyRef.current = true;
    setWorking(true);
    setResult(undefined);
    setCameraEnabled(false);
    setTorchEnabled(false);
    try {
      const response = await api.post<TicketCheckInResponse>(`/tickets/publications/${publication._id}/check-in`, {
        token: scanValue,
        accessPoint,
        idempotencyKey: Crypto.randomUUID()
      });
      setResult({ status: response.result, ticket: response.ticket });
      setManualValue('');
      Vibration.vibrate(response.result === 'valid' ? 60 : 240);
    } catch (cause) {
      const message = cause instanceof ApiClientError ? cause.message : undefined;
      setResult({ status: 'error', message });
      Vibration.vibrate(240);
    } finally {
      setWorking(false);
      busyRef.current = false;
    }
  }

  function handleBarcode({ data }: BarcodeScanningResult) {
    if (!data || busyRef.current || result) return;
    void validateTicket(data);
  }

  async function confirmCheckIn() {
    if (!result?.ticket?._id || result.status !== 'valid' || busyRef.current) return;
    busyRef.current = true;
    setWorking(true);
    try {
      const response = await api.post<TicketCheckInResponse>(`/tickets/publications/${publication._id}/check-in/confirm`, {
        ticketId: result.ticket._id,
        accessPoint,
        idempotencyKey: Crypto.randomUUID()
      });
      setResult({ status: response.result, ticket: response.ticket ?? result.ticket });
      Vibration.vibrate(response.result === 'accepted' ? [0, 70, 60, 90] : 240);
    } catch (cause) {
      setResult((current) => ({
        status: 'error',
        ticket: current?.ticket,
        message: cause instanceof ApiClientError ? cause.message : undefined
      }));
      Vibration.vibrate(240);
    } finally {
      setWorking(false);
      busyRef.current = false;
    }
  }

  function scanNext() {
    setResult(undefined);
    setManualValue('');
    setCameraEnabled(true);
  }

  const permissionBlocked = permission && !permission.granted && !permission.canAskAgain;
  const presentation = result ? resultCopy[result.status] : undefined;
  const palette = presentation?.tone === 'success'
    ? { background: colors.successBg, foreground: colors.success }
    : presentation?.tone === 'warning'
      ? { background: colors.warningBg, foreground: colors.warning }
      : { background: colors.dangerBg, foreground: colors.danger };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.eventBar}>
          <View style={styles.eventIndicator} />
          <View style={styles.eventCopy}>
            <Text style={styles.eventEyebrow}>ESCANEANDO PARA</Text>
            <Text style={styles.eventTitle}>{publication.title}</Text>
            {publication.venueName ? <Text style={styles.eventVenue}>{publication.venueName}</Text> : null}
          </View>
        </View>

        {result && presentation ? (
          <View accessibilityRole="alert" style={[styles.resultCard, { backgroundColor: palette.background, borderColor: palette.foreground }]}>
            <View style={[styles.resultIcon, { borderColor: palette.foreground }]}>
              <Text style={[styles.resultIconText, { color: palette.foreground }]}>{presentation.tone === 'success' ? '✓' : '!'}</Text>
            </View>
            <View style={styles.resultCopy}>
              <Text style={[styles.resultTitle, { color: palette.foreground }]}>{presentation.title}</Text>
              <Text style={styles.resultDescription}>{result.message || presentation.description}</Text>
              {result.ticket ? (
                <View style={styles.ticketDetails}>
                  {result.ticket.attendeeName ? <Detail label="Asistente" value={result.ticket.attendeeName} /> : null}
                  {result.ticket.ticketTypeName ? <Detail label="Entrada" value={result.ticket.ticketTypeName} /> : null}
                  {result.ticket.ticketCode ? <Detail label="Código" value={result.ticket.ticketCode} mono /> : null}
                  {result.ticket.status ? <Detail label="Estado" value={ticketStatusLabels[result.ticket.status] ?? result.ticket.status} /> : null}
                  {result.ticket.checkedInAt ? <Detail label="Ingreso anterior" value={formatDate(result.ticket.checkedInAt) ?? ''} /> : null}
                </View>
              ) : null}
              <View style={styles.resultActions}>
                {result.status === 'valid' ? (
                  <>
                    <AppButton title="Confirmar ingreso" loading={working} onPress={() => void confirmCheckIn()} />
                    <AppButton title="Descartar" variant="ghost" disabled={working} onPress={scanNext} />
                  </>
                ) : (
                  <AppButton title={result.status === 'accepted' ? 'Escanear siguiente' : 'Intentar con otra entrada'} variant={result.status === 'accepted' ? 'primary' : 'secondary'} onPress={scanNext} />
                )}
              </View>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.cameraCard}>
              {permission?.granted ? (
                <View style={styles.cameraViewport}>
                  {cameraEnabled && isFocused ? (
                    <CameraView
                      style={StyleSheet.absoluteFill}
                      facing="back"
                      enableTorch={torchEnabled}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={!working ? handleBarcode : undefined}
                    />
                  ) : <View style={styles.cameraPaused} />}
                  <View pointerEvents="none" style={styles.cameraShade} />
                  <View pointerEvents="none" style={styles.scanFrame}>
                    <View style={[styles.scanCorner, styles.scanTopLeft]} />
                    <View style={[styles.scanCorner, styles.scanTopRight]} />
                    <View style={[styles.scanCorner, styles.scanBottomLeft]} />
                    <View style={[styles.scanCorner, styles.scanBottomRight]} />
                  </View>
                  <View style={styles.cameraCaption}><Text style={styles.cameraCaptionText}>{working ? 'Validando…' : 'Alineá el QR dentro del marco'}</Text></View>
                </View>
              ) : (
                <View style={styles.permissionPanel}>
                  <View style={styles.permissionIcon}><View style={styles.lens} /></View>
                  <Text style={styles.permissionTitle}>Habilitá la cámara</Text>
                  <Text style={styles.permissionText}>La usamos solamente para leer códigos QR. También podés ingresar el código manualmente.</Text>
                  <AppButton
                    title={permissionBlocked ? 'Abrir configuración' : 'Permitir cámara'}
                    variant="secondary"
                    onPress={() => permissionBlocked ? void Linking.openSettings() : void requestPermission()}
                  />
                </View>
              )}
              {permission?.granted ? (
                <View style={styles.cameraActions}>
                  <AppButton
                    title={torchEnabled ? 'Apagar luz' : 'Encender luz'}
                    variant="secondary"
                    fullWidth={false}
                    disabled={!cameraEnabled}
                    onPress={() => setTorchEnabled((current) => !current)}
                  />
                </View>
              ) : null}
            </View>

            <AppCard style={styles.manualCard}>
              <Text style={styles.manualTitle}>Ingreso manual</Text>
              <Text style={styles.manualDescription}>Pegá el enlace del QR o escribí el código impreso en la entrada.</Text>
              <AppTextInput
                value={manualValue}
                onChangeText={setManualValue}
                placeholder="TKT-2026-… o enlace del QR"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={() => void validateTicket(manualValue)}
                editable={!working}
              />
              <AppButton title="Validar código" variant="secondary" loading={working} disabled={!manualValue.trim()} onPress={() => void validateTicket(manualValue)} />
            </AppCard>
          </>
        )}

        <Text style={styles.securityNote}>La entrada sólo cambia a “utilizada” después de confirmar. No se admiten validaciones sin conexión.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable={mono} style={[styles.detailValue, mono && styles.detailValueMono]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  eventBar: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  eventIndicator: { width: 4, borderRadius: 3, backgroundColor: colors.accent },
  eventCopy: { flex: 1, gap: 2 },
  eventEyebrow: { ...typography.caption, color: colors.textSubtle, fontWeight: '800', letterSpacing: 0.9 },
  eventTitle: { ...typography.bodyStrong, color: colors.text },
  eventVenue: { ...typography.small, color: colors.textMuted },
  cameraCard: { overflow: 'hidden', backgroundColor: colors.backgroundDark, borderRadius: radii.xl, ...shadow.card },
  cameraViewport: { aspectRatio: 0.82, maxHeight: 470, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cameraPaused: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.backgroundDeep },
  cameraShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3,10,21,0.08)' },
  scanFrame: { width: '68%', aspectRatio: 1 },
  scanCorner: { position: 'absolute', width: 42, height: 42, borderColor: colors.accent },
  scanTopLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: radii.md },
  scanTopRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: radii.md },
  scanBottomLeft: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: radii.md },
  scanBottomRight: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: radii.md },
  cameraCaption: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, alignItems: 'center' },
  cameraCaptionText: { ...typography.small, color: colors.primaryText, fontWeight: '700', backgroundColor: 'rgba(3,10,21,0.75)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill },
  cameraActions: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.sm },
  permissionPanel: { minHeight: 310, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  permissionIcon: { width: 62, height: 50, borderWidth: 3, borderColor: colors.accent, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  lens: { width: 24, height: 24, borderWidth: 3, borderColor: colors.accent, borderRadius: 14 },
  permissionTitle: { ...typography.h2, color: colors.primaryText },
  permissionText: { ...typography.small, color: '#B6C7DD', lineHeight: 19, textAlign: 'center' },
  manualCard: { gap: spacing.md },
  manualTitle: { ...typography.h3, color: colors.text },
  manualDescription: { ...typography.small, color: colors.textMuted, marginTop: -spacing.sm },
  resultCard: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, borderRadius: radii.xl, borderWidth: 1, padding: spacing.lg },
  resultIcon: { width: 40, height: 40, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  resultIconText: { fontSize: 22, lineHeight: 25, fontWeight: '900' },
  resultCopy: { flex: 1, gap: spacing.sm },
  resultTitle: { ...typography.h2 },
  resultDescription: { ...typography.small, color: colors.text, lineHeight: 19 },
  ticketDetails: { marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: 'rgba(16,27,50,0.12)', paddingTop: spacing.sm, gap: spacing.sm },
  detailRow: { gap: 2 },
  detailLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { ...typography.bodyStrong, color: colors.text },
  detailValueMono: { fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  resultActions: { gap: spacing.xs, marginTop: spacing.sm },
  securityNote: { ...typography.caption, color: colors.textSubtle, textAlign: 'center', lineHeight: 17, paddingHorizontal: spacing.md }
});
