import { SystemSetting } from '../settings/systemSetting.model';
import { env } from '../../config/env';

// Global attendance defaults live as a single SystemSetting row (reusing the existing
// key/value settings module — apps/api/src/modules/settings/systemSetting.model.ts —
// instead of introducing a new settings collection). Per-salon geofence overrides live
// on `Salon.attendanceLocationRule` (see salon.model.ts).
export interface AttendanceSettings {
  timezone: string;
  offlinePunchMaxAgeMinutes: number;
  minLocationAccuracyMeters: number;
  defaultGeofenceRadiusMeters: number;
  lateToleranceMinutes: number;
  earlyCheckoutToleranceMinutes: number;
  maxShiftHours: number;
  requireShiftToClockIn: boolean;
  allowIncidents: boolean;
}

const SETTINGS_KEY = 'attendance.config';

function defaults(): AttendanceSettings {
  return {
    timezone: env.ATTENDANCE_DEFAULT_TIMEZONE,
    offlinePunchMaxAgeMinutes: env.MOBILE_OFFLINE_PUNCH_MAX_AGE_MINUTES,
    minLocationAccuracyMeters: env.ATTENDANCE_DEFAULT_LOCATION_ACCURACY_METERS,
    defaultGeofenceRadiusMeters: env.ATTENDANCE_DEFAULT_GEOFENCE_RADIUS_METERS,
    lateToleranceMinutes: 10,
    earlyCheckoutToleranceMinutes: 10,
    maxShiftHours: 14,
    requireShiftToClockIn: false,
    allowIncidents: true
  };
}

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const stored: any = await SystemSetting.findOne({ key: SETTINGS_KEY }).lean();
  return { ...defaults(), ...(stored?.value ?? {}) };
}

export async function updateAttendanceSettings(partial: Partial<AttendanceSettings>, actorId: string): Promise<AttendanceSettings> {
  const current = await getAttendanceSettings();
  const next = { ...current, ...partial };
  await SystemSetting.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { key: SETTINGS_KEY, value: next, description: 'Configuración global de asistencia/fichaje móvil', updatedBy: actorId, $setOnInsert: { createdBy: actorId } },
    { upsert: true }
  );
  return next;
}
