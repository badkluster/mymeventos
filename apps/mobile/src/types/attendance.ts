import type { AttendanceIncidentType, WorkSessionStatus } from '@mym/shared';

export interface WorkSession {
  _id: string;
  userId: string;
  salonId?: string;
  eventId?: string;
  assignmentId?: string;
  status: WorkSessionStatus;
  startedAt: string;
  endedAt?: string;
  workedMinutes?: number;
  payableMinutes?: number;
  requiresReview?: boolean;
  hasIncident?: boolean;
  attendanceClassification?: string;
}

export interface TimePunch {
  _id: string;
  type: 'check_in' | 'check_out';
  effectiveAt: string;
}

export interface AttendanceStatusResponse {
  activeSession: WorkSession | null;
  elapsedMinutes: number;
  todayAssignment: ScheduleAssignment | null;
}

export interface ScheduleAssignment {
  _id: string;
  eventId?: { _id: string; eventName?: string; eventDate?: string; startTime?: string; endTime?: string; status?: string };
  salonId?: { _id: string; name?: string; city?: string };
  roleLabel?: string;
  staffSubrole?: string;
  shiftStart?: string;
  shiftEnd?: string;
  status: string;
  notes?: string;
}

export interface HistoryResponse {
  items: WorkSession[];
  total: number;
  page: number;
  limit: number;
}

export interface SessionDetailResponse {
  session: WorkSession;
  punches: TimePunch[];
  incidents: AttendanceIncident[];
  adjustments: AttendanceAdjustmentRequest[];
}

export interface SummaryResponse {
  days: { _id: string; workedMinutes: number; sessions: number }[];
  totalMinutes: number;
  totalHours: number;
}

export interface AttendanceIncident {
  _id: string;
  type: AttendanceIncidentType;
  description: string;
  status: string;
  resolution?: string;
  createdAt: string;
  workSessionId?: string;
}

export interface AttendanceAdjustmentRequest {
  _id: string;
  workSessionId: string;
  requestedStartAt?: string;
  requestedEndAt?: string;
  reason: string;
  status: string;
  reviewNotes?: string;
  createdAt: string;
}
