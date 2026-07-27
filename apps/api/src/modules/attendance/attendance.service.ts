import { Types } from 'mongoose';
import { StaffEmploymentStatus, TimePunchType, TimePunchSource, WorkSessionStatus, LocationValidationStatus, AttendanceClassification, AttendanceIncidentStatus, AttendanceAdjustmentStatus } from '@mym/shared';
import { User } from '../users/user.model';
import { Salon } from '../salons/salon.model';
import { EventStaffAssignment } from '../crm/crm.models';
import { ApiError } from '../../middlewares/errorHandler';
import { haversineDistanceMeters } from '../../utils/geo';
import { getAttendanceSettings, type AttendanceSettings } from './attendance-settings.service';
import { TimePunch, WorkSession, AttendanceIncident, AttendanceAdjustmentRequest } from './attendance.models';

export interface PunchDeviceInput { installationId?: string; platform?: string; osVersion?: string; appVersion?: string; deviceModel?: string; manufacturer?: string; }
export interface PunchLocationInput { latitude: number; longitude: number; accuracy?: number; altitude?: number; heading?: number; speed?: number; }

export interface ClockInput {
  requestId: string;
  clientOccurredAt: Date;
  networkStatus: 'online' | 'offline_sync';
  location?: PunchLocationInput;
  locationPermissionStatus?: string;
  publicIp?: string;
  device?: PunchDeviceInput;
  notes?: string;
}
export interface CheckInInput extends ClockInput { salonId?: string; eventId?: string; }

interface PunchTiming { effectiveAt: Date; serverReceivedAt: Date; requiresReview: boolean; clockSkewMs: number; }

function resolvePunchTiming(clientOccurredAt: Date, networkStatus: string, settings: AttendanceSettings): PunchTiming {
  const serverReceivedAt = new Date();
  const clockSkewMs = serverReceivedAt.getTime() - clientOccurredAt.getTime();
  if (networkStatus === 'offline_sync') {
    const ageMinutes = clockSkewMs / 60_000;
    const maxAge = settings.offlinePunchMaxAgeMinutes;
    if (ageMinutes >= -2 && ageMinutes <= maxAge) {
      return { effectiveAt: clientOccurredAt, serverReceivedAt, requiresReview: ageMinutes > maxAge / 2, clockSkewMs };
    }
    return { effectiveAt: serverReceivedAt, serverReceivedAt, requiresReview: true, clockSkewMs };
  }
  return { effectiveAt: serverReceivedAt, serverReceivedAt, requiresReview: Math.abs(clockSkewMs) > 5 * 60_000, clockSkewMs };
}

interface LocationValidationResult {
  status: string;
  distanceMeters?: number;
  blocked: boolean;
  requiresReview: boolean;
  requiresReason: boolean;
}

async function validateLocation(salonId: string | undefined, location: PunchLocationInput | undefined, settings: AttendanceSettings): Promise<LocationValidationResult> {
  if (!salonId) return { status: LocationValidationStatus.NOT_CONFIGURED, blocked: false, requiresReview: false, requiresReason: false };
  const salon: any = await Salon.findOne({ _id: salonId, deletedAt: null }).select('attendanceLocationRule').lean();
  const rule = salon?.attendanceLocationRule;
  if (!rule || rule.latitude == null || rule.longitude == null) {
    return { status: LocationValidationStatus.NOT_CONFIGURED, blocked: false, requiresReview: false, requiresReason: false };
  }
  if (!location) {
    return { status: LocationValidationStatus.LOCATION_UNAVAILABLE, blocked: Boolean(rule.requireLocation), requiresReview: !rule.requireLocation, requiresReason: false };
  }
  const distanceMeters = haversineDistanceMeters(location, rule);
  const radius = rule.allowedRadiusMeters ?? settings.defaultGeofenceRadiusMeters;
  if (distanceMeters <= radius) return { status: LocationValidationStatus.INSIDE_ALLOWED_AREA, distanceMeters, blocked: false, requiresReview: false, requiresReason: false };
  const policy = rule.outsideAreaPolicy ?? 'flag';
  if (policy === 'allow') return { status: LocationValidationStatus.OUTSIDE_ALLOWED_AREA, distanceMeters, blocked: false, requiresReview: false, requiresReason: false };
  if (policy === 'block') return { status: LocationValidationStatus.OUTSIDE_ALLOWED_AREA, distanceMeters, blocked: true, requiresReview: false, requiresReason: false };
  if (policy === 'require_reason') return { status: LocationValidationStatus.OUTSIDE_ALLOWED_AREA, distanceMeters, blocked: false, requiresReview: false, requiresReason: true };
  return { status: LocationValidationStatus.OUTSIDE_ALLOWED_AREA, distanceMeters, blocked: false, requiresReview: true, requiresReason: false };
}

async function findTodayAssignment(userId: string, salonId: string): Promise<any> {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
  return EventStaffAssignment.findOne({
    staffUserId: userId,
    salonId,
    deletedAt: null,
    status: { $in: ['assigned', 'confirmed', 'checked_in'] },
    $or: [{ shiftStart: { $gte: startOfDay, $lte: endOfDay } }, { shiftStart: null }]
  }).sort({ shiftStart: 1 }).lean();
}

async function classifySession(session: any, settings: AttendanceSettings): Promise<string> {
  if (!session.assignmentId) return AttendanceClassification.NOT_SCHEDULED;
  const assignment: any = await EventStaffAssignment.findById(session.assignmentId).lean();
  if (!assignment?.shiftStart) return AttendanceClassification.NOT_SCHEDULED;
  const lateMs = new Date(session.startedAt).getTime() - new Date(assignment.shiftStart).getTime();
  if (lateMs > settings.lateToleranceMinutes * 60_000) return AttendanceClassification.LATE;
  return AttendanceClassification.ON_TIME;
}

async function assertMobileEligible(userId: string): Promise<any> {
  const user: any = await User.findOne({ _id: userId, deletedAt: null }).lean();
  if (!user || !user.active) throw new ApiError(403, 'ATTENDANCE_ACCOUNT_INACTIVE');
  if (user.staffProfile?.employmentStatus && user.staffProfile.employmentStatus !== StaffEmploymentStatus.ACTIVE) throw new ApiError(403, 'ATTENDANCE_ACCOUNT_INACTIVE');
  return user;
}

export async function checkIn(userId: string, input: CheckInInput) {
  const existing: any = await TimePunch.findOne({ requestId: input.requestId }).lean();
  if (existing) {
    if (existing.workSessionId) {
      const session = await WorkSession.findById(existing.workSessionId).lean();
      if (session) return { session, punch: existing, idempotentReplay: true };
    }
    if (existing.rejected) throw new ApiError(409, existing.rejectionReason === 'ALREADY_ACTIVE' ? 'ATTENDANCE_ALREADY_ACTIVE' : 'ATTENDANCE_DUPLICATE_REQUEST');
  }

  const settings = await getAttendanceSettings();
  const user = await assertMobileEligible(userId);
  const salonId: string | undefined = input.salonId || user.attendanceConfig?.defaultWorkLocationSalonId?.toString() || user.primarySalonId?.toString();

  if (user.attendanceConfig?.requiresGeolocation && !input.location) throw new ApiError(422, 'ATTENDANCE_LOCATION_REQUIRED');

  const timing = resolvePunchTiming(input.clientOccurredAt, input.networkStatus, settings);
  const locationResult = await validateLocation(salonId, input.location, settings);
  if (locationResult.blocked) throw new ApiError(403, 'ATTENDANCE_OUTSIDE_GEOFENCE');
  if (locationResult.requiresReason && !input.notes?.trim()) throw new ApiError(422, 'ATTENDANCE_REASON_REQUIRED_OUTSIDE_AREA');

  let punch: any;
  try {
    punch = await TimePunch.create({
      userId, type: TimePunchType.CHECK_IN, source: TimePunchSource.MOBILE,
      clientOccurredAt: input.clientOccurredAt, serverReceivedAt: timing.serverReceivedAt, effectiveAt: timing.effectiveAt,
      location: input.location, locationPermissionStatus: input.locationPermissionStatus,
      locationCapturedAt: input.location ? input.clientOccurredAt : undefined,
      publicIp: input.publicIp, device: input.device, networkStatus: input.networkStatus, requestId: input.requestId,
      salonId, salonDistanceMeters: locationResult.distanceMeters, locationValidationStatus: locationResult.status,
      clockSkewMs: timing.clockSkewMs, notes: input.notes, createdBy: userId
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const replay: any = await TimePunch.findOne({ requestId: input.requestId }).lean();
      if (replay?.workSessionId) {
        const session = await WorkSession.findById(replay.workSessionId).lean();
        if (session) return { session, punch: replay, idempotentReplay: true };
      }
      throw new ApiError(409, 'ATTENDANCE_DUPLICATE_REQUEST');
    }
    throw error;
  }

  const assignment = salonId ? await findTodayAssignment(userId, salonId) : null;

  let session: any;
  try {
    session = await WorkSession.create({
      userId, salonId, eventId: input.eventId || assignment?.eventId, assignmentId: assignment?._id,
      status: WorkSessionStatus.ACTIVE, checkInPunchId: punch._id, startedAt: timing.effectiveAt,
      requiresReview: timing.requiresReview || locationResult.requiresReview,
      createdBy: userId, updatedBy: userId
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      await TimePunch.updateOne({ _id: punch._id }, { rejected: true, rejectionReason: 'ALREADY_ACTIVE' });
      throw new ApiError(409, 'ATTENDANCE_ALREADY_ACTIVE');
    }
    throw error;
  }

  await TimePunch.updateOne({ _id: punch._id }, { workSessionId: session._id });
  return { session, punch, idempotentReplay: false };
}

export async function checkOut(userId: string, input: ClockInput) {
  const existing: any = await TimePunch.findOne({ requestId: input.requestId }).lean();
  if (existing?.workSessionId) {
    const session: any = await WorkSession.findById(existing.workSessionId).lean();
    if (session && session.status !== WorkSessionStatus.ACTIVE) return { session, punch: existing, idempotentReplay: true };
  }

  const settings = await getAttendanceSettings();
  await assertMobileEligible(userId);
  const activeSession: any = await WorkSession.findOne({ userId, status: WorkSessionStatus.ACTIVE });
  if (!activeSession) throw new ApiError(409, 'ATTENDANCE_NO_ACTIVE_SESSION');

  const timing = resolvePunchTiming(input.clientOccurredAt, input.networkStatus, settings);
  const startedAtMs = new Date(activeSession.startedAt).getTime();
  const clientPrecedesCheckIn = input.clientOccurredAt.getTime() <= startedAtMs;
  if (clientPrecedesCheckIn) timing.requiresReview = true;
  if (timing.effectiveAt.getTime() <= startedAtMs) {
    timing.effectiveAt = new Date(startedAtMs + 60_000);
    timing.requiresReview = true;
  }

  const locationResult = await validateLocation(activeSession.salonId?.toString(), input.location, settings);
  if (locationResult.blocked) throw new ApiError(403, 'ATTENDANCE_OUTSIDE_GEOFENCE');
  if (locationResult.requiresReason && !input.notes?.trim()) throw new ApiError(422, 'ATTENDANCE_REASON_REQUIRED_OUTSIDE_AREA');

  let punch: any;
  try {
    punch = await TimePunch.create({
      userId, workSessionId: activeSession._id, type: TimePunchType.CHECK_OUT, source: TimePunchSource.MOBILE,
      clientOccurredAt: input.clientOccurredAt, serverReceivedAt: timing.serverReceivedAt, effectiveAt: timing.effectiveAt,
      location: input.location, locationPermissionStatus: input.locationPermissionStatus,
      locationCapturedAt: input.location ? input.clientOccurredAt : undefined,
      publicIp: input.publicIp, device: input.device, networkStatus: input.networkStatus, requestId: input.requestId,
      salonId: activeSession.salonId, salonDistanceMeters: locationResult.distanceMeters, locationValidationStatus: locationResult.status,
      clockSkewMs: timing.clockSkewMs, notes: input.notes, createdBy: userId
    });
  } catch (error: any) {
    if (error?.code === 11000) {
      const replay: any = await TimePunch.findOne({ requestId: input.requestId }).lean();
      if (replay?.workSessionId) {
        const session = await WorkSession.findById(replay.workSessionId).lean();
        if (session) return { session, punch: replay, idempotentReplay: true };
      }
      throw new ApiError(409, 'ATTENDANCE_DUPLICATE_REQUEST');
    }
    throw error;
  }

  const workedMinutes = Math.max(0, Math.round((timing.effectiveAt.getTime() - startedAtMs) / 60_000));
  const requiresReview = activeSession.requiresReview || timing.requiresReview || locationResult.requiresReview;
  const attendanceClassification = await classifySession(activeSession, settings);

  const updated = await WorkSession.findOneAndUpdate(
    { _id: activeSession._id, status: WorkSessionStatus.ACTIVE },
    {
      status: requiresReview ? WorkSessionStatus.UNDER_REVIEW : WorkSessionStatus.COMPLETED,
      endedAt: timing.effectiveAt, checkOutPunchId: punch._id, workedMinutes,
      payableMinutes: Math.max(0, workedMinutes - (activeSession.breakMinutes ?? 0)),
      attendanceClassification, requiresReview, updatedBy: userId
    },
    { new: true }
  );
  if (!updated) {
    await TimePunch.updateOne({ _id: punch._id }, { rejected: true, rejectionReason: 'SESSION_ALREADY_CLOSED' });
    throw new ApiError(409, 'ATTENDANCE_NO_ACTIVE_SESSION');
  }
  await TimePunch.updateOne({ _id: punch._id }, { workSessionId: updated._id });
  return { session: updated, punch, idempotentReplay: false };
}

export async function getStatus(userId: string) {
  const session: any = await WorkSession.findOne({ userId, status: WorkSessionStatus.ACTIVE }).lean();
  const user: any = await User.findOne({ _id: userId, deletedAt: null }).select('salonIds primarySalonId').lean();
  const salonIds = [...new Set([...(user?.salonIds ?? []).map(String), user?.primarySalonId?.toString()].filter(Boolean))];
  const todayAssignment = salonIds.length ? await findTodayAssignment(userId, salonIds[0]) : null;
  return {
    activeSession: session,
    elapsedMinutes: session ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 60_000) : 0,
    todayAssignment
  };
}

export interface HistoryFilters { page?: number; limit?: number; from?: Date; to?: Date; }
export async function getHistory(userId: string, filters: HistoryFilters) {
  const page = Math.max(1, Number(filters.page) || 1); const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const query: any = { userId };
  if (filters.from || filters.to) query.startedAt = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) };
  const [items, totalItems] = await Promise.all([WorkSession.find(query).populate('salonId', 'name').populate('eventId', 'eventName eventType').sort({ startedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), WorkSession.countDocuments(query)]);
  return { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } };
}

export async function reportIncident(userId: string, input: { workSessionId?: string; type: string; description: string; occurredAt?: Date; attachments?: Array<Record<string, unknown>> }) {
  if (input.workSessionId) {
    const session = await WorkSession.findOne({ _id: input.workSessionId, userId }).lean();
    if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  }
  return AttendanceIncident.create({ userId, workSessionId: input.workSessionId, type: input.type, description: input.description, occurredAt: input.occurredAt ?? new Date(), attachments: input.attachments, status: AttendanceIncidentStatus.OPEN, createdBy: userId, updatedBy: userId });
}

export async function requestAdjustment(userId: string, input: { workSessionId: string; requestedStartedAt?: Date; requestedEndedAt?: Date; reason: string; attachments?: Array<Record<string, unknown>> }) {
  const session: any = await WorkSession.findOne({ _id: input.workSessionId, userId }).lean();
  if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  if (session.status === WorkSessionStatus.ACTIVE) throw new ApiError(409, 'ATTENDANCE_SESSION_ACTIVE');
  const existing = await AttendanceAdjustmentRequest.findOne({ workSessionId: input.workSessionId, userId, status: AttendanceAdjustmentStatus.PENDING }).lean();
  if (existing) throw new ApiError(409, 'ATTENDANCE_ADJUSTMENT_ALREADY_PENDING');
  return AttendanceAdjustmentRequest.create({ userId, workSessionId: input.workSessionId, originalStartedAt: session.startedAt, originalEndedAt: session.endedAt, requestedStartedAt: input.requestedStartedAt, requestedEndedAt: input.requestedEndedAt, reason: input.reason, attachments: input.attachments, status: AttendanceAdjustmentStatus.PENDING, createdBy: userId, updatedBy: userId });
}
