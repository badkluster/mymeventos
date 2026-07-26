import * as LocalAuthentication from 'expo-local-authentication';

// Biometrics never touch the backend and nothing biometric is stored anywhere (see
// docs/MOBILE_AUTHENTICATION.md §Biometría) — this module only gates local access to
// the already-issued refresh token sitting in secure storage.
export async function isBiometricSupported(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync()
  ]);
  return hasHardware && isEnrolled;
}

export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancelar', disableDeviceFallback: false });
  return result.success;
}
