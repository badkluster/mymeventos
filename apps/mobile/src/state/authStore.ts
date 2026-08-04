import { create } from 'zustand';
import { api, ApiClientError, setUnauthorizedHandler } from '../lib/api';
import {
  clearTokens, loadTokens, saveTokens,
  isBiometricEnabled, setBiometricEnabled as persistBiometricEnabled,
  saveCachedCredentials, loadCachedCredentials, clearCachedCredentials,
  type CachedCredentials
} from '../lib/secureStorage';
import { getDeviceInfo } from '../lib/device';
import { authenticateWithBiometrics } from '../lib/biometrics';
import type { SessionUser } from '../types/user';

export type AuthStatus = 'booting' | 'signedOut' | 'locked' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  biometricEnabled: boolean;
  justLoggedIn: boolean;
  loading: boolean;
  error: string | null;
  pendingCredentials: CachedCredentials | null;
  bootstrap: () => Promise<void>;
  login: (input: { username: string; password: string }) => Promise<void>;
  loginWithBiometrics: () => Promise<boolean>;
  checkBiometricLoginAvailable: () => Promise<boolean>;
  unlockWithBiometrics: () => Promise<boolean>;
  fallbackToPassword: () => void;
  beginPasswordReset: () => Promise<void>;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  refreshSessionUser: () => Promise<void>;
  enableBiometricFromPendingLogin: () => Promise<void>;
  confirmPasswordForBiometrics: (password: string) => Promise<boolean>;
  disableBiometric: () => Promise<void>;
  refreshCachedCredentialsAfterPasswordChange: (newPassword: string) => Promise<void>;
  dismissBiometricPrompt: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'booting',
  user: null,
  biometricEnabled: false,
  justLoggedIn: false,
  loading: false,
  error: null,
  pendingCredentials: null,

  bootstrap: async () => {
    setUnauthorizedHandler(() => set({ status: 'signedOut', user: null }));
    let biometricEnabled = false;
    try {
      const [tokens, storedBiometricEnabled] = await Promise.all([loadTokens(), isBiometricEnabled()]);
      biometricEnabled = storedBiometricEnabled;
      if (!tokens) {
        set({ status: 'signedOut', biometricEnabled });
        return;
      }
      if (biometricEnabled) {
        set({ status: 'locked', biometricEnabled });
        return;
      }
      const { user } = await api.get<{ user: SessionUser }>('/mobile/auth/session');
      set({ status: 'signedIn', user, biometricEnabled });
    } catch {
      try { await clearTokens(); } catch { /* A storage failure must not leave the app on the splash screen. */ }
      set({ status: 'signedOut', biometricEnabled });
    }
  },

  login: async ({ username, password }) => {
    set({ loading: true, error: null });
    try {
      const device = await getDeviceInfo();
      const response = await api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>('/mobile/auth/login', { username, password, device });
      await saveTokens(response);
      const alreadyEnabled = get().biometricEnabled;
      if (alreadyEnabled) {
        // Keeps "Ingresar con huella" working after a password change made through another channel.
        try { await saveCachedCredentials({ username, password }); } catch { /* best-effort */ }
      }
      set({
        status: 'signedIn', user: response.user, loading: false, justLoggedIn: true,
        pendingCredentials: alreadyEnabled ? null : { username, password }
      });
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'No se pudo iniciar sesión. Revisá tu conexión e intentá de nuevo.';
      set({ loading: false, error: message });
      throw error;
    }
  },

  // Re-runs a real login using the credentials cached when biometrics was enabled. Used from the
  // login screen so "Ingresar con huella" also works after an explicit logout, not only to unlock
  // an already-open session (see unlockWithBiometrics for that other case).
  loginWithBiometrics: async () => {
    const success = await authenticateWithBiometrics('Ingresá con tu huella o Face ID');
    if (!success) return false;
    const credentials = await loadCachedCredentials();
    if (!credentials) return false;
    try {
      await get().login(credentials);
      return true;
    } catch (error) {
      if (error instanceof ApiClientError && (error.code === 'INVALID_CREDENTIALS' || error.code === 'MOBILE_ACCESS_DENIED')) {
        try { await clearCachedCredentials(); } catch { /* best-effort */ }
      }
      return false;
    }
  },

  checkBiometricLoginAvailable: async () => {
    const [enabled, credentials] = await Promise.all([isBiometricEnabled(), loadCachedCredentials()]);
    return enabled && credentials !== null;
  },

  unlockWithBiometrics: async () => {
    const success = await authenticateWithBiometrics('Desbloqueá tu sesión de M&M Eventos');
    if (!success) return false;
    try {
      const { user } = await api.get<{ user: SessionUser }>('/mobile/auth/session');
      set({ status: 'signedIn', user });
      return true;
    } catch {
      await clearTokens();
      set({ status: 'signedOut', user: null });
      return false;
    }
  },

  fallbackToPassword: () => set({ status: 'signedOut' }),

  beginPasswordReset: async () => {
    try { await clearTokens(); } catch { /* The reset flow must still be available if local storage is unavailable. */ }
    try { await clearCachedCredentials(); } catch { /* best-effort: the cached password is about to become invalid anyway */ }
    set({ status: 'signedOut', user: null, justLoggedIn: false, error: null });
  },

  logout: async () => {
    const tokens = await loadTokens();
    try {
      if (tokens) await api.post('/mobile/auth/logout', { refreshToken: tokens.refreshToken });
    } catch {
      // best-effort: still clear the local session even if the request fails offline
    }
    await clearTokens();
    set({ status: 'signedOut', user: null });
  },

  logoutAllDevices: async () => {
    try {
      await api.post('/mobile/auth/logout-all');
    } catch {
      // best-effort
    }
    await clearTokens();
    // Treated as a panic action (lost/stolen device): also drop the local biometric shortcut
    // so this device requires a fresh manual login too, not just the others.
    try { await clearCachedCredentials(); } catch { /* best-effort */ }
    try { await persistBiometricEnabled(false); } catch { /* best-effort */ }
    set({ status: 'signedOut', user: null, biometricEnabled: false });
  },

  refreshSessionUser: async () => {
    const { user } = await api.get<{ user: SessionUser }>('/mobile/auth/session');
    set({ user });
  },

  enableBiometricFromPendingLogin: async () => {
    const pending = get().pendingCredentials;
    await persistBiometricEnabled(true);
    if (pending) { try { await saveCachedCredentials(pending); } catch { /* best-effort */ } }
    set({ biometricEnabled: true, pendingCredentials: null });
  },

  // Enabling biometrics later, from Perfil > Seguridad, requires the user to re-type their
  // password (we don't have it in memory outside the login/setup flow) — this verifies it
  // against the backend (also rotates tokens, harmless) before trusting it enough to cache it.
  confirmPasswordForBiometrics: async (password) => {
    const username = get().user?.username;
    if (!username) return false;
    try {
      const device = await getDeviceInfo();
      const response = await api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>('/mobile/auth/login', { username, password, device });
      await saveTokens(response);
      await persistBiometricEnabled(true);
      await saveCachedCredentials({ username, password });
      set({ biometricEnabled: true, pendingCredentials: null });
      return true;
    } catch {
      return false;
    }
  },

  disableBiometric: async () => {
    await persistBiometricEnabled(false);
    try { await clearCachedCredentials(); } catch { /* best-effort */ }
    set({ biometricEnabled: false, pendingCredentials: null });
  },

  refreshCachedCredentialsAfterPasswordChange: async (newPassword) => {
    const username = get().user?.username;
    if (!username || !get().biometricEnabled) return;
    try { await saveCachedCredentials({ username, password: newPassword }); } catch { /* best-effort */ }
  },

  dismissBiometricPrompt: () => set({ justLoggedIn: false, pendingCredentials: null }),

  clearError: () => set({ error: null })
}));
