import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { UPDATE_REQUEST_TIMEOUT_MS } from './update.constants';
import { withTimeout } from './update.utils';

export type AndroidUpdateMode = 'flexible' | 'immediate';

export type StoreUpdateResult =
  | { kind: 'skipped' }
  | { kind: 'not-supported' }
  | { kind: 'not-available' }
  | { kind: 'failed' }
  | { kind: 'cancelled' }
  | { kind: 'downloaded' }
  | { kind: 'in-progress'; mode: 'immediate' }
  | {
      kind: 'available';
      mode?: AndroidUpdateMode;
      version: string;
      url?: string;
    };

export type StoreUpdateEvent =
  | { kind: 'downloaded' }
  | { kind: 'cancelled' }
  | { kind: 'failed' };

type InAppUpdatesInstance = {
  checkNeedsUpdate: (options?: Record<string, unknown>) => Promise<any>;
  startUpdate: (options: Record<string, unknown>) => Promise<void>;
  installUpdate: () => void;
  addStatusUpdateListener: (listener: (event: any) => void) => void;
  removeStatusUpdateListener: (listener: (event: any) => void) => void;
  addIntentSelectionListener: (listener: (result: number) => void) => void;
  removeIntentSelectionListener: (listener: (result: number) => void) => void;
};

let instance: InAppUpdatesInstance | null = null;
let library: any = null;

function storeChecksEnabled(): boolean {
  return (
    Constants.expoConfig?.extra?.appUpdates?.enabled !== false &&
    !__DEV__ &&
    Platform.OS !== 'web'
  );
}

function getLibrary(): any {
  if (!library) {
    // Deferred require is intentional: the package contains native code and must
    // never be loaded inside Expo Go/development mode.
    library = require('sp-react-native-in-app-updates');
  }
  return library;
}

function getInstance(): InAppUpdatesInstance {
  if (!instance) {
    const module = getLibrary();
    const SpInAppUpdates = module.default || module;
    instance = new SpInAppUpdates(false) as InAppUpdatesInstance;
  }
  return instance;
}

async function checkStore(): Promise<StoreUpdateResult> {
  if (!storeChecksEnabled()) return { kind: 'skipped' };

  try {
    const appUpdates = getInstance();
    const installedVersion =
      Application.nativeApplicationVersion ||
      Constants.expoConfig?.version ||
      '0.0.0';

    const options =
      Platform.OS === 'android'
        ? {
            curVersion: installedVersion,
            // Android Play Core already tells us whether an update is available.
            // Its storeVersion is versionCode, not the public semantic version.
            customVersionComparator: () => 1 as const
          }
        : {
            curVersion: installedVersion,
            country: String(
              Constants.expoConfig?.extra?.appUpdates?.appStoreCountry || 'AR'
            ).toLowerCase(),
            iosStrategy: 'itunes'
          };

    const result = await withTimeout(
      appUpdates.checkNeedsUpdate(options),
      UPDATE_REQUEST_TIMEOUT_MS,
      Platform.OS === 'android'
        ? 'consulta de Google Play'
        : 'consulta de App Store'
    );

    if (Platform.OS === 'android') {
      const other = result?.other || {};

      if (other.updateAvailability === 3) {
        return { kind: 'in-progress', mode: 'immediate' };
      }

      if (!result?.shouldUpdate) return { kind: 'not-available' };

      const immediateAllowed = other.isImmediateUpdateAllowed === true;
      const flexibleAllowed = other.isFlexibleUpdateAllowed === true;
      const priority = Number(other.updatePriority || 0);
      const version = String(
        result?.storeVersion || other.versionCode || 'unknown'
      );

      if (immediateAllowed && priority >= 4) {
        return { kind: 'available', mode: 'immediate', version };
      }

      if (flexibleAllowed) {
        return { kind: 'available', mode: 'flexible', version };
      }

      if (immediateAllowed) {
        return { kind: 'available', mode: 'immediate', version };
      }

      return { kind: 'not-available' };
    }

    if (!result?.shouldUpdate) return { kind: 'not-available' };

    return {
      kind: 'available',
      version: String(result?.storeVersion || 'unknown'),
      url: String(result?.other?.trackViewUrl || '')
    };
  } catch {
    return { kind: 'failed' };
  }
}

export const storeUpdateService = {
  check: checkStore,

  subscribe(listener: (event: StoreUpdateEvent) => void): () => void {
    if (!storeChecksEnabled() || Platform.OS !== 'android') {
      return () => undefined;
    }

    try {
      const appUpdates = getInstance();
      const module = getLibrary();
      const downloadedStatus = module.IAUInstallStatus?.DOWNLOADED ?? 11;
      const cancelledStatus = module.IAUInstallStatus?.CANCELED ?? 6;

      const statusListener = (event: any) => {
        if (Number(event?.status) === downloadedStatus) {
          listener({ kind: 'downloaded' });
        }
      };

      const intentListener = (result: number) => {
        if (Number(result) === cancelledStatus) {
          listener({ kind: 'cancelled' });
        }
      };

      appUpdates.addStatusUpdateListener(statusListener);
      appUpdates.addIntentSelectionListener(intentListener);

      return () => {
        appUpdates.removeStatusUpdateListener(statusListener);
        appUpdates.removeIntentSelectionListener(intentListener);
      };
    } catch {
      return () => undefined;
    }
  },

  async startAndroidUpdate(mode: AndroidUpdateMode): Promise<boolean> {
    if (!storeChecksEnabled() || Platform.OS !== 'android') return false;

    try {
      const appUpdates = getInstance();
      const module = getLibrary();
      const updateType =
        mode === 'immediate'
          ? module.IAUUpdateKind.IMMEDIATE
          : module.IAUUpdateKind.FLEXIBLE;

      await appUpdates.startUpdate({ updateType });
      return true;
    } catch {
      return false;
    }
  },

  async completeAndroidUpdate(): Promise<boolean> {
    if (!storeChecksEnabled() || Platform.OS !== 'android') return false;

    try {
      getInstance().installUpdate();
      return true;
    } catch {
      return false;
    }
  }
};
