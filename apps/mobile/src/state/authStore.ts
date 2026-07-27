import { create } from 'zustand';
import { api, ApiClientError, setUnauthorizedHandler } from '../lib/api';
import { clearTokens, loadTokens, saveTokens, isBiometricEnabled, setBiometricEnabled as persistBiometricEnabled } from '../lib/secureStorage';
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
  bootstrap: () => Promise<void>;
  login: (input: { username: string; password: string }) => Promise<void>;
  unlockWithBiometrics: () => Promise<boolean>;
  fallbackToPassword: () => void;
  logout: () => Promise<void>;
  logoutAllDevices: () => Promise<void>;
  refreshSessionUser: () => Promise<void>;
  updateBiometricPreference: (enabled: boolean) => Promise<void>;
  dismissBiometricPrompt: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'booting',
  user: null,
  biometricEnabled: false,
  justLoggedIn: false,
  loading: false,
  error: null,

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
      set({ status: 'signedIn', user: response.user, loading: false, justLoggedIn: true });
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'No se pudo iniciar sesión. Revisá tu conexión e intentá de nuevo.';
      set({ loading: false, error: message });
      throw error;
    }
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
    set({ status: 'signedOut', user: null });
  },

  refreshSessionUser: async () => {
    const { user } = await api.get<{ user: SessionUser }>('/mobile/auth/session');
    set({ user });
  },

  updateBiometricPreference: async (enabled) => {
    await persistBiometricEnabled(enabled);
    set({ biometricEnabled: enabled });
  },

  dismissBiometricPrompt: () => set({ justLoggedIn: false }),

  clearError: () => set({ error: null })
}));
