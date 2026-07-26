import * as SecureStore from 'expo-secure-store';

// Tokens live exclusively in the OS-backed secure store (Keychain on iOS, EncryptedSharedPreferences
// on Android) — never in AsyncStorage, which is plain-text on disk. See docs/MOBILE_AUTHENTICATION.md.
const ACCESS_TOKEN_KEY = 'mym.accessToken';
const REFRESH_TOKEN_KEY = 'mym.refreshToken';
const BIOMETRIC_ENABLED_KEY = 'mym.biometricEnabled';

export interface StoredTokens { accessToken: string; refreshToken: string; }

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken)
  ]);
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
  ]);
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function isBiometricEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === 'true';
}
