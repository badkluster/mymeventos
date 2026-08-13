import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { UPDATE_REQUEST_TIMEOUT_MS } from './update.constants';
import { withTimeout } from './update.utils';
import { updateStorage } from './update.storage';

export type OtaUpdateResult =
  | { status: 'skipped' }
  | { status: 'not-available' }
  | { status: 'downloaded'; updateId: string | null }
  | { status: 'failed' };

function isExpoGo(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient'
  );
}

function featureEnabled(): boolean {
  return Constants.expoConfig?.extra?.appUpdates?.enabled !== false;
}

function canUseOtaUpdates(): boolean {
  return Boolean(
    featureEnabled() &&
      !__DEV__ &&
      !isExpoGo() &&
      Updates.isEnabled === true
  );
}

export async function recordLaunchedOtaUpdate(): Promise<void> {
  if (!canUseOtaUpdates() || !Updates.updateId) return;
  await updateStorage.setLastOtaAppliedId(Updates.updateId);
}

export async function checkAndDownloadOtaUpdate(): Promise<OtaUpdateResult> {
  if (!canUseOtaUpdates()) return { status: 'skipped' };

  try {
    const check = await withTimeout(
      Updates.checkForUpdateAsync(),
      UPDATE_REQUEST_TIMEOUT_MS,
      'consulta de actualización OTA'
    );

    if (!check.isAvailable) return { status: 'not-available' };

    const download = await withTimeout(
      Updates.fetchUpdateAsync(),
      UPDATE_REQUEST_TIMEOUT_MS,
      'descarga de actualización OTA'
    );

    const manifest = download.manifest as { id?: string } | undefined;
    const checkedManifest = check.manifest as { id?: string } | undefined;
    const updateId = manifest?.id || checkedManifest?.id || null;

    await updateStorage.setLastOtaDownloadId(updateId || 'downloaded');

    // Intentionally do not reload here. The update is applied on the next safe
    // application launch so a clock-in, form or operational workflow is not cut.
    return { status: 'downloaded', updateId };
  } catch {
    await updateStorage.setLastOtaFailureAt(Date.now());
    return { status: 'failed' };
  }
}
