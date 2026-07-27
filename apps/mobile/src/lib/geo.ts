import { Linking } from 'react-native';
import * as Location from 'expo-location';

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
}

export async function ensureLocationPermission(): Promise<LocationPermissionStatus> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  const requested = await Location.requestForegroundPermissionsAsync();
  if (requested.status === 'granted') return 'granted';
  return requested.canAskAgain ? 'undetermined' : 'denied';
}

// Captures location on demand only — never runs in the background and is only invoked
// right before a check-in/check-out confirmation (see docs/ATTENDANCE_ARCHITECTURE.md §Privacidad).
export async function captureLocation(): Promise<{ location?: CapturedLocation; permissionStatus: LocationPermissionStatus }> {
  const permissionStatus = await ensureLocationPermission();
  if (permissionStatus !== 'granted') return { permissionStatus };
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      permissionStatus,
      location: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? undefined,
        altitude: position.coords.altitude ?? undefined,
        heading: position.coords.heading ?? undefined,
        speed: position.coords.speed ?? undefined
      }
    };
  } catch {
    return { permissionStatus };
  }
}

export function openDeviceSettings(): void {
  void Linking.openSettings();
}
