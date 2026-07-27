import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
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
  isPhysicalDevice: boolean;
  deviceType?: string;
  brand?: string;
  osVersion?: string;
  osName?: string;
  osBuildId?: string;
  osInternalBuildId?: string;
  osBuildFingerprint?: string;
  platformApiLevel?: number;
  appVersion?: string;
  appBuildVersion?: string;
  applicationId?: string;
  deviceModel?: string;
  modelId?: string;
  deviceName?: string;
  manufacturer?: string;
  designName?: string;
  productName?: string;
  deviceYearClass?: number;
  rooted?: boolean;
  appInstalledAt?: string;
  appLastUpdatedAt?: string;
  network?: {
    connectionType?: string;
    isConnected?: boolean;
    isInternetReachable?: boolean;
    reportedIp?: string;
    airplaneMode?: boolean;
  };
}

function deviceTypeLabel(value: Device.DeviceType | null): string | undefined {
  if (value === Device.DeviceType.PHONE) return 'phone';
  if (value === Device.DeviceType.TABLET) return 'tablet';
  if (value === Device.DeviceType.DESKTOP) return 'desktop';
  if (value === Device.DeviceType.TV) return 'tv';
  return value === Device.DeviceType.UNKNOWN ? 'unknown' : undefined;
}

async function optionalValue<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try { return await operation(); } catch { return undefined; }
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  const [installationId, networkState, reportedIp, rooted, airplaneMode, installedAt, lastUpdatedAt] = await Promise.all([
    getInstallationId(),
    optionalValue(() => Network.getNetworkStateAsync()),
    optionalValue(() => Network.getIpAddressAsync()),
    optionalValue(() => Device.isRootedExperimentalAsync()),
    optionalValue(() => Network.isAirplaneModeEnabledAsync()),
    optionalValue(() => Application.getInstallationTimeAsync()),
    optionalValue(() => Application.getLastUpdateTimeAsync())
  ]);
  return {
    installationId,
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    isPhysicalDevice: Device.isDevice,
    deviceType: deviceTypeLabel(Device.deviceType),
    brand: Device.brand ?? undefined,
    osVersion: Device.osVersion ?? undefined,
    osName: Device.osName ?? undefined,
    osBuildId: Device.osBuildId ?? undefined,
    osInternalBuildId: Device.osInternalBuildId ?? undefined,
    osBuildFingerprint: Device.osBuildFingerprint ?? undefined,
    platformApiLevel: Device.platformApiLevel ?? undefined,
    appVersion: Application.nativeApplicationVersion ?? undefined,
    appBuildVersion: Application.nativeBuildVersion ?? undefined,
    applicationId: Application.applicationId ?? undefined,
    deviceModel: Device.modelName ?? undefined,
    modelId: Device.modelId ?? undefined,
    deviceName: Device.deviceName ?? undefined,
    manufacturer: Device.manufacturer ?? undefined,
    designName: Device.designName ?? undefined,
    productName: Device.productName ?? undefined,
    deviceYearClass: Device.deviceYearClass ?? undefined,
    rooted,
    appInstalledAt: installedAt?.toISOString(),
    appLastUpdatedAt: lastUpdatedAt?.toISOString(),
    network: {
      connectionType: networkState?.type?.toLowerCase(),
      isConnected: networkState?.isConnected,
      isInternetReachable: networkState?.isInternetReachable,
      reportedIp: reportedIp && reportedIp !== '0.0.0.0' ? reportedIp : undefined,
      airplaneMode
    }
  };
}
