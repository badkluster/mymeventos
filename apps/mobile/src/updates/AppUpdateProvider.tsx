import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren
} from 'react';
import {
  Alert,
  AppState,
  Linking,
  Platform,
  type AppStateStatus
} from 'react-native';
import { UPDATE_COPY } from './update.constants';
import {
  checkAndDownloadOtaUpdate,
  recordLaunchedOtaUpdate
} from './easUpdate';
import {
  storeUpdateService,
  type StoreUpdateResult
} from './storeUpdate';
import { updateStorage } from './update.storage';
import {
  shouldCheckOnAppStateChange,
  shouldRemindForStoreVersion,
  shouldRunUpdateCheck
} from './update.utils';

type UpdateCheckSource = 'launch' | 'foreground' | 'manual';

type AppUpdateContextValue = {
  checkForUpdates: (source?: UpdateCheckSource) => Promise<void>;
};

export const AppUpdateContext = createContext<AppUpdateContextValue>({
  checkForUpdates: async () => undefined
});

const ignoredStoreKinds = new Set<StoreUpdateResult['kind']>([
  'not-available',
  'failed',
  'skipped',
  'not-supported',
  'cancelled'
]);

export function AppUpdateProvider({
  children
}: PropsWithChildren): React.JSX.Element {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState || 'active');
  const visibleAlertRef = useRef(false);
  const checkInFlightRef = useRef<Promise<void> | null>(null);
  const sessionPromptedVersionsRef = useRef(new Set<string>());

  const dismissStoreVersion = useCallback(async (version: string) => {
    await updateStorage.dismissStoreVersion(version || 'unknown');
  }, []);

  const showDownloadedAndroidAlert = useCallback(() => {
    if (visibleAlertRef.current || Platform.OS !== 'android') return;

    visibleAlertRef.current = true;
    Alert.alert(UPDATE_COPY.availableTitle, UPDATE_COPY.readyMessage, [
      {
        text: UPDATE_COPY.restartAndUpdate,
        onPress: async () => {
          visibleAlertRef.current = false;
          await storeUpdateService.completeAndroidUpdate();
        }
      },
      {
        text: UPDATE_COPY.later,
        style: 'cancel',
        onPress: () => {
          visibleAlertRef.current = false;
        }
      }
    ]);
  }, []);

  const showStoreUpdate = useCallback(
    async (store: StoreUpdateResult) => {
      if (visibleAlertRef.current || ignoredStoreKinds.has(store.kind)) return;

      if (store.kind === 'in-progress') {
        await storeUpdateService.startAndroidUpdate(store.mode);
        return;
      }

      if (store.kind === 'downloaded') {
        showDownloadedAndroidAlert();
        return;
      }

      if (store.kind !== 'available') return;

      const version = store.version || 'unknown';

      if (Platform.OS === 'android') {
        const mode = store.mode || 'flexible';

        if (mode === 'immediate') {
          visibleAlertRef.current = true;
          Alert.alert(
            UPDATE_COPY.androidRequiredTitle,
            UPDATE_COPY.androidRequiredMessage,
            [
              {
                text: UPDATE_COPY.update,
                onPress: async () => {
                  visibleAlertRef.current = false;
                  await storeUpdateService.startAndroidUpdate('immediate');
                }
              }
            ],
            { cancelable: false }
          );
          return;
        }

        if (sessionPromptedVersionsRef.current.has(version)) return;
        const dismissal = await updateStorage.getStoreDismissal();
        if (
          !shouldRemindForStoreVersion(
            dismissal.version,
            dismissal.at,
            version
          )
        ) {
          return;
        }

        sessionPromptedVersionsRef.current.add(version);
        visibleAlertRef.current = true;
        Alert.alert(
          UPDATE_COPY.availableTitle,
          UPDATE_COPY.androidAvailableMessage,
          [
            {
              text: UPDATE_COPY.update,
              onPress: async () => {
                visibleAlertRef.current = false;
                const started =
                  await storeUpdateService.startAndroidUpdate('flexible');
                if (!started) await dismissStoreVersion(version);
              }
            },
            {
              text: UPDATE_COPY.later,
              style: 'cancel',
              onPress: async () => {
                visibleAlertRef.current = false;
                await dismissStoreVersion(version);
              }
            }
          ]
        );
        return;
      }

      if (Platform.OS === 'ios' && store.url) {
        if (sessionPromptedVersionsRef.current.has(version)) return;
        const dismissal = await updateStorage.getStoreDismissal();
        if (
          !shouldRemindForStoreVersion(
            dismissal.version,
            dismissal.at,
            version
          )
        ) {
          return;
        }

        sessionPromptedVersionsRef.current.add(version);
        visibleAlertRef.current = true;
        Alert.alert(
          UPDATE_COPY.iosAvailableTitle,
          UPDATE_COPY.iosAvailableMessage,
          [
            {
              text: UPDATE_COPY.updateNow,
              onPress: async () => {
                visibleAlertRef.current = false;
                try {
                  await Linking.openURL(store.url as string);
                } catch {
                  await dismissStoreVersion(version);
                }
              }
            },
            {
              text: UPDATE_COPY.remindLater,
              style: 'cancel',
              onPress: async () => {
                visibleAlertRef.current = false;
                await dismissStoreVersion(version);
              }
            }
          ]
        );
      }
    },
    [dismissStoreVersion, showDownloadedAndroidAlert]
  );

  const checkForUpdates = useCallback(
    async (_source: UpdateCheckSource = 'manual'): Promise<void> => {
      if (checkInFlightRef.current) return checkInFlightRef.current;

      const task = (async () => {
        const now = Date.now();
        const lastCheckAt = await updateStorage.getLastCheckAt();

        if (!shouldRunUpdateCheck(lastCheckAt, now)) return;
        await updateStorage.setLastCheckAt(now);

        await checkAndDownloadOtaUpdate();
        const store = await storeUpdateService.check();
        await showStoreUpdate(store);
      })();

      checkInFlightRef.current = task;

      try {
        await task;
      } finally {
        checkInFlightRef.current = null;
      }
    },
    [showStoreUpdate]
  );

  useEffect(() => {
    void recordLaunchedOtaUpdate();
    void checkForUpdates('launch');

    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        const previousState = appStateRef.current;
        appStateRef.current = nextState;

        if (shouldCheckOnAppStateChange(previousState, nextState)) {
          void checkForUpdates('foreground');
        }
      }
    );

    const unsubscribeStoreEvents = storeUpdateService.subscribe((event) => {
      if (event.kind === 'downloaded') {
        showDownloadedAndroidAlert();
      }
    });

    return () => {
      appStateSubscription.remove();
      unsubscribeStoreEvents();
    };
  }, [checkForUpdates, showDownloadedAndroidAlert]);

  const contextValue = useMemo<AppUpdateContextValue>(
    () => ({ checkForUpdates }),
    [checkForUpdates]
  );

  return (
    <AppUpdateContext.Provider value={contextValue}>
      {children}
    </AppUpdateContext.Provider>
  );
}
