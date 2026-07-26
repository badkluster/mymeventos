import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INSTALLATION_ID_KEY = 'mym.installationId';

// A per-install random id, persisted in AsyncStorage (non-sensitive — it is not a
// credential). Falls back to Application.androidId / iOS identifierForVendor when
// available, otherwise a generated UUID that survives app restarts (but not reinstalls).
export async function getInstallationId(): Promise<string> {
  const stored = await AsyncStorage.getItem(INSTALLATION_ID_KEY);
  if (stored) return stored;
  const fallback = Platform.OS === 'android' ? Application.getAndroidId() : await Application.getIosIdForVendorAsync();
  const id = fallback ?? Crypto.randomUUID();
  await AsyncStorage.setItem(INSTALLATION_ID_KEY, id);
  return id;
}

export interface DeviceInfo {
  installationId: string;
  platform: 'ios' | 'android' | 'web';
  osVersion?: string;
  appVersion?: string;
  deviceModel?: string;
  manufacturer?: string;
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const installationId = await getInstallationId();
  return {
    installationId,
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    osVersion: Device.osVersion ?? undefined,
    appVersion: Application.nativeApplicationVersion ?? undefined,
    deviceModel: Device.modelName ?? undefined,
    manufacturer: Device.manufacturer ?? undefined
  };
}
