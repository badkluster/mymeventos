// Mobile staff attendance/clock-in domain constants.
// Note: packages/shared/src/constants/statuses.ts already declares an `AttendanceStatus`
// enum (PRESENT/ABSENT/LATE/EXCUSED) that was scaffolded early on and never consumed
// anywhere in the codebase. It is left untouched (not deleted) but is superseded by
// `AttendanceClassification` below for the real implementation — see
// docs/ATTENDANCE_ARCHITECTURE.md for the documented decision.

export enum WorkSessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  INCOMPLETE = 'incomplete',
  UNDER_REVIEW = 'under_review',
  ADJUSTED = 'adjusted',
  CANCELLED = 'cancelled'
}

export enum TimePunchType {
  CHECK_IN = 'check_in',
  CHECK_OUT = 'check_out',
  BREAK_START = 'break_start',
  BREAK_END = 'break_end'
}

export enum TimePunchSource {
  MOBILE = 'mobile',
  BACKOFFICE = 'backoffice',
  SYSTEM = 'system'
}

export enum LocationValidationStatus {
  INSIDE_ALLOWED_AREA = 'inside_allowed_area',
  OUTSIDE_ALLOWED_AREA = 'outside_allowed_area',
  NOT_CONFIGURED = 'not_configured',
  LOCATION_UNAVAILABLE = 'location_unavailable',
  UNDER_REVIEW = 'under_review'
}

export enum AttendanceAdjustmentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled'
}

export enum AttendanceIncidentType {
  MISSED_CHECK_IN = 'missed_check_in',
  MISSED_CHECK_OUT = 'missed_check_out',
  LOCATION_ISSUE = 'location_issue',
  OFFLINE_APP = 'offline_app',
  WRONG_SHIFT = 'wrong_shift',
  FORGOT_TO_CLOCK = 'forgot_to_clock',
  WRONG_SCHEDULE = 'wrong_schedule',
  OTHER = 'other'
}

export enum AttendanceIncidentStatus {
  PENDING = 'pending',
  IN_REVIEW = 'in_review',
  RESOLVED = 'resolved',
  REJECTED = 'rejected'
}

export enum AttendanceClassification {
  ON_TIME = 'on_time',
  LATE = 'late',
  ABSENT = 'absent',
  INCOMPLETE = 'incomplete',
  JUSTIFIED = 'justified',
  NOT_SCHEDULED = 'not_scheduled',
  UNDER_REVIEW = 'under_review'
}

export const WorkSessionStatusLabels: Record<WorkSessionStatus, string> = {
  [WorkSessionStatus.ACTIVE]: 'Activa',
  [WorkSessionStatus.COMPLETED]: 'Completada',
  [WorkSessionStatus.INCOMPLETE]: 'Incompleta',
  [WorkSessionStatus.UNDER_REVIEW]: 'En revisión',
  [WorkSessionStatus.ADJUSTED]: 'Ajustada',
  [WorkSessionStatus.CANCELLED]: 'Cancelada'
};

export const AttendanceIncidentTypeLabels: Record<AttendanceIncidentType, string> = {
  [AttendanceIncidentType.MISSED_CHECK_IN]: 'No pude marcar entrada',
  [AttendanceIncidentType.MISSED_CHECK_OUT]: 'No pude marcar salida',
  [AttendanceIncidentType.LOCATION_ISSUE]: 'Problema con la ubicación',
  [AttendanceIncidentType.OFFLINE_APP]: 'Aplicación sin conexión',
  [AttendanceIncidentType.WRONG_SHIFT]: 'Turno incorrecto',
  [AttendanceIncidentType.FORGOT_TO_CLOCK]: 'Olvidé marcar',
  [AttendanceIncidentType.WRONG_SCHEDULE]: 'Horario incorrecto',
  [AttendanceIncidentType.OTHER]: 'Otro'
};
