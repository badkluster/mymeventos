import * as SecureStore from 'expo-secure-store';
import { UPDATE_STORAGE_KEYS } from './update.constants';

async function getString(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setString(key: string, value: string | number): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, String(value));
  } catch {
    // Update metadata must never block the app if persistence fails.
  }
}

export const updateStorage = {
  async getLastCheckAt(): Promise<number> {
    return Number((await getString(UPDATE_STORAGE_KEYS.lastCheckAt)) || 0);
  },

  setLastCheckAt(value: number): Promise<void> {
    return setString(UPDATE_STORAGE_KEYS.lastCheckAt, value);
  },

  setLastOtaAppliedId(value: string): Promise<void> {
    return setString(UPDATE_STORAGE_KEYS.lastOtaAppliedId, value);
  },

  setLastOtaDownloadId(value: string): Promise<void> {
    return setString(UPDATE_STORAGE_KEYS.lastOtaDownloadId, value);
  },

  setLastOtaFailureAt(value: number): Promise<void> {
    return setString(UPDATE_STORAGE_KEYS.lastOtaFailureAt, value);
  },

  async getStoreDismissal(): Promise<{ version: string | null; at: number }> {
    return {
      version: await getString(UPDATE_STORAGE_KEYS.dismissedStoreVersion),
      at: Number((await getString(UPDATE_STORAGE_KEYS.dismissedStoreAt)) || 0)
    };
  },

  async dismissStoreVersion(
    version: string,
    at = Date.now()
  ): Promise<void> {
    await Promise.all([
      setString(UPDATE_STORAGE_KEYS.dismissedStoreVersion, version),
      setString(UPDATE_STORAGE_KEYS.dismissedStoreAt, at)
    ]);
  }
};
