import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { WorkSession } from '../types/attendance';

const NOTIFICATION_ID = 'active-work-session';
const ANDROID_CHANNEL_ID = 'attendance-active-session';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false
  })
});

let androidChannelReady = false;

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android' || androidChannelReady) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Jornada en curso',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: null,
    sound: null
  });
  androidChannelReady = true;
}

function formatStartedAt(startedAt: string) {
  return new Date(startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// Keeps a non-dismissable local notification visible while a WorkSession is ACTIVE, so the
// status bar still shows "jornada en curso" even if the user closes the app — Android keeps
// posted notifications independent of the app process, it doesn't need a foreground service.
export async function showActiveSessionNotification(session: WorkSession): Promise<void> {
  try {
    const current = await Notifications.getPermissionsAsync();
    const granted = current.status === 'granted' || (await Notifications.requestPermissionsAsync()).status === 'granted';
    if (!granted) return;
    await ensureAndroidChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title: 'Jornada en curso',
        body: `Fichaje activo desde las ${formatStartedAt(session.startedAt)}`,
        sticky: true,
        autoDismiss: false,
        ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {})
      },
      trigger: null
    });
  } catch {
    // Best-effort: a missing/denied notification permission must never block clocking in.
  }
}

export async function hideActiveSessionNotification(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch {
    // best-effort
  }
}
