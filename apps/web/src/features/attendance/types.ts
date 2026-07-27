export type AttendancePerson = { _id: string; firstName?: string; lastName?: string; fullName?: string; avatarUrl?: string };
export type AttendanceSalon = { _id: string; name?: string; city?: string };

export type WorkSessionStatus = 'active' | 'completed' | 'incomplete' | 'under_review' | 'adjusted' | 'cancelled';
export type AttendanceIncidentStatus = 'pending' | 'in_review' | 'resolved' | 'rejected';
export type AttendanceAdjustmentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type AttendanceIncidentType = 'missed_check_in' | 'missed_check_out' | 'location_issue' | 'offline_app' | 'wrong_shift' | 'forgot_to_clock' | 'wrong_schedule' | 'other';

export type WorkSession = {
  _id: string;
  userId: AttendancePerson | string;
  salonId?: AttendanceSalon | string;
  eventId?: string;
  status: WorkSessionStatus;
  startedAt: string;
  endedAt?: string;
  workedMinutes?: number;
  payableMinutes?: number;
  requiresReview?: boolean;
  hasIncident?: boolean;
  attendanceClassification?: string;
  closeReason?: string;
  notes?: string;
};

export type PunchLocation = { latitude: number; longitude: number; accuracy?: number };
export type PunchDevice = {
  installationId?: string;
  platform?: string;
  isPhysicalDevice?: boolean;
  deviceType?: string;
  brand?: string;
  manufacturer?: string;
  deviceModel?: string;
  modelId?: string;
  deviceName?: string;
  designName?: string;
  productName?: string;
  deviceYearClass?: number;
  osName?: string;
  osVersion?: string;
  osBuildId?: string;
  osInternalBuildId?: string;
  osBuildFingerprint?: string;
  platformApiLevel?: number;
  appVersion?: string;
  appBuildVersion?: string;
  applicationId?: string;
  rooted?: boolean;
  appInstalledAt?: string;
  appLastUpdatedAt?: string;
};
export type PunchNetwork = { connectionType?: string; isConnected?: boolean; isInternetReachable?: boolean; reportedIp?: string; airplaneMode?: boolean };

export type TimePunch = {
  _id: string;
  type: 'check_in' | 'check_out' | 'break_start' | 'break_end';
  effectiveAt: string;
  clientOccurredAt?: string;
  serverReceivedAt?: string;
  source?: string;
  networkStatus?: string;
  publicIp?: string;
  device?: PunchDevice;
  network?: PunchNetwork;
  location?: PunchLocation;
  locationValidationStatus?: string;
  salonDistanceMeters?: number;
  clockSkewMs?: number;
  rejected?: boolean;
  rejectionReason?: string;
  notes?: string;
};

export type AttendanceIncident = {
  _id: string;
  userId: AttendancePerson | string;
  workSessionId?: string;
  type: AttendanceIncidentType;
  description: string;
  status: AttendanceIncidentStatus;
  resolution?: string;
  resolvedAt?: string;
  createdAt: string;
};

export type AttendanceAdjustmentRequest = {
  _id: string;
  userId: AttendancePerson | string;
  workSessionId: string;
  requestedStartAt?: string;
  requestedEndAt?: string;
  reason: string;
  status: AttendanceAdjustmentStatus;
  reviewNotes?: string;
  createdAt: string;
};

export type AttendanceSettings = {
  timezone: string;
  minLocationAccuracyMeters: number;
  defaultGeofenceRadiusMeters: number;
  lateToleranceMinutes: number;
  earlyCheckoutToleranceMinutes: number;
  maxShiftHours: number;
  requireShiftToClockIn: boolean;
  allowIncidents: boolean;
};

export const workSessionStatusLabels: Record<WorkSessionStatus, string> = {
  active: 'Activa',
  completed: 'Completada',
  incomplete: 'Incompleta',
  under_review: 'En revisión',
  adjusted: 'Ajustada',
  cancelled: 'Cancelada'
};

export const attendanceIncidentStatusLabels: Record<AttendanceIncidentStatus, string> = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  resolved: 'Resuelta',
  rejected: 'Rechazada'
};

export const attendanceAdjustmentStatusLabels: Record<AttendanceAdjustmentStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada'
};

export const attendanceIncidentTypeLabels: Record<AttendanceIncidentType, string> = {
  missed_check_in: 'No pudo marcar entrada',
  missed_check_out: 'No pudo marcar salida',
  location_issue: 'Problema con la ubicación',
  offline_app: 'Aplicación sin conexión',
  wrong_shift: 'Turno incorrecto',
  forgot_to_clock: 'Olvidó marcar',
  wrong_schedule: 'Horario incorrecto',
  other: 'Otro'
};

export const locationValidationLabels: Record<string, string> = {
  inside_allowed_area: 'Dentro del área permitida',
  outside_allowed_area: 'Fuera del área permitida',
  not_configured: 'Salón sin geocerca configurada',
  location_unavailable: 'Sin ubicación disponible',
  under_review: 'Ubicación en revisión'
};

export function googleMapsUrl(location: PunchLocation): string {
  return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
}

export function personName(value?: AttendancePerson | string): string {
  if (!value) return 'Sin asignar';
  if (typeof value === 'string') return value;
  return value.fullName || [value.firstName, value.lastName].filter(Boolean).join(' ') || 'Sin nombre';
}

export function salonName(value?: AttendanceSalon | string): string {
  if (!value) return 'Sin salón';
  if (typeof value === 'string') return value;
  return value.name || 'Sin salón';
}

export function formatMinutes(minutes?: number): string {
  if (minutes === undefined || minutes === null) return 'Sin calcular';
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return `${hours}h ${remaining}m`;
}
