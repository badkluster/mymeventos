import { Types } from 'mongoose';
import { StaffEmploymentStatus, TimePunchType, TimePunchSource, WorkSessionStatus, LocationValidationStatus, AttendanceClassification, AttendanceIncidentStatus, AttendanceAdjustmentStatus } from '@mym/shared';
import { User } from '../users/user.model';
import { Salon } from '../salons/salon.model';
import { EventStaffAssignment } from '../crm/crm.models';
import { ApiError } from '../../middlewares/errorHandler';
import { haversineDistanceMeters } from '../../utils/geo';
import { getAttendanceSettings, type AttendanceSettings } from './attendance-settings.service';
import { TimePunch, WorkSession, AttendanceIncident, AttendanceAdjustmentRequest } from './attendance.models';

export interface PunchDeviceInput {
  installationId?: string; platform?: string; isPhysicalDevice?: boolean; deviceType?: string; brand?: string;
  osVersion?: string; osName?: string; osBuildId?: string; osInternalBuildId?: string; osBuildFingerprint?: string; platformApiLevel?: number;
  appVersion?: string; appBuildVersion?: string; applicationId?: string;
  deviceModel?: string; modelId?: string; deviceName?: string; manufacturer?: string; designName?: string; productName?: string; deviceYearClass?: number;
  rooted?: boolean; appInstalledAt?: Date; appLastUpdatedAt?: Date;
}
export interface PunchNetworkInput { connectionType?: string; isConnected?: boolean; isInternetReachable?: boolean; reportedIp?: string; airplaneMode?: boolean; }
export interface PunchLocationInput { latitude: number; longitude: number; accuracy?: number; altitude?: number; heading?: number; speed?: number; }

export interface ClockInput {
  requestId: string;
  clientOccurredAt: Date;
  networkStatus: 'online' | 'offline_sync';
  location?: PunchLocationInput;
  locationPermissionStatus?: string;
  publicIp?: string;
  device?: PunchDeviceInput;
  network?: PunchNetworkInput;
  notes?: string;
}
export interface CheckInInput extends ClockInput { salonId?: string; eventId?: string; }

interface PunchTiming { effectiveAt: Date; serverReceivedAt: Date; requiresReview: boolean; clockSkewMs: number; }

function resolvePunchTiming(clientOccurredAt: Date, networkStatus: string): PunchTiming {
  const serverReceivedAt = new Date();
  const clockSkewMs = serverReceivedAt.getTime() - clientOccurredAt.getTime();
  // The phone timestamp is audit-only. The server is the sole authority for
  // the official punch time, preventing a modified device clock from changing
  // worked hours. An offline-sync payload is never accepted (see checkIn/out).
  return { effectiveAt: serverReceivedAt, serverReceivedAt, requiresReview: networkStatus !== 'online' || Math.abs(clockSkewMs) > 5 * 60_000, clockSkewMs };
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

  if (input.networkStatus !== 'online') throw new ApiError(422, 'ATTENDANCE_ONLINE_REQUIRED');
  const settings = await getAttendanceSettings();
  const user = await assertMobileEligible(userId);
  const salonId: string | undefined = input.salonId || user.attendanceConfig?.defaultWorkLocationSalonId?.toString() || user.primarySalonId?.toString();

  if (user.attendanceConfig?.requiresGeolocation && !input.location) throw new ApiError(422, 'ATTENDANCE_LOCATION_REQUIRED');

  const timing = resolvePunchTiming(input.clientOccurredAt, input.networkStatus);
  const locationResult = await validateLocation(salonId, input.location, settings);
  if (locationResult.blocked) throw new ApiError(403, 'ATTENDANCE_OUTSIDE_GEOFENCE');
  if (locationResult.requiresReason && !input.notes?.trim()) throw new ApiError(422, 'ATTENDANCE_REASON_REQUIRED_OUTSIDE_AREA');

  let punch: any;
  try {
    punch = await TimePunch.create({
      userId, type: TimePunchType.CHECK_IN, source: TimePunchSource.MOBILE,
      clientOccurredAt: input.clientOccurredAt, serverReceivedAt: timing.serverReceivedAt, effectiveAt: timing.effectiveAt,
      location: input.location, locationPermissionStatus: input.locationPermissionStatus,
      locationCapturedAt: input.location ? timing.serverReceivedAt : undefined,
      publicIp: input.publicIp, device: input.device, network: input.network, networkStatus: input.networkStatus, requestId: input.requestId,
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

  if (input.networkStatus !== 'online') throw new ApiError(422, 'ATTENDANCE_ONLINE_REQUIRED');
  const settings = await getAttendanceSettings();
  await assertMobileEligible(userId);
  const activeSession: any = await WorkSession.findOne({ userId, status: WorkSessionStatus.ACTIVE });
  if (!activeSession) throw new ApiError(409, 'ATTENDANCE_NO_ACTIVE_SESSION');

  const timing = resolvePunchTiming(input.clientOccurredAt, input.networkStatus);
  const startedAtMs = new Date(activeSession.startedAt).getTime();
  if (input.clientOccurredAt.getTime() <= startedAtMs) timing.requiresReview = true;
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
      locationCapturedAt: input.location ? timing.serverReceivedAt : undefined,
      publicIp: input.publicIp, device: input.device, network: input.network, networkStatus: input.networkStatus, requestId: input.requestId,
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

export interface HistoryFilters { page?: number; limit?: number; status?: string; from?: Date; to?: Date; }

export async function getHistory(userId: string, filters: HistoryFilters) {
  const query: Record<string, unknown> = { userId };
  if (filters.status) query.status = filters.status;
  if (filters.from || filters.to) query.startedAt = { ...(filters.from ? { $gte: filters.from } : {}), ...(filters.to ? { $lte: filters.to } : {}) };
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const [items, total] = await Promise.all([
    WorkSession.find(query).sort({ startedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    WorkSession.countDocuments(query)
  ]);
  return { items, total, page, limit };
}

export async function getSessionDetail(requesterId: string, sessionId: string, isAdmin: boolean) {
  const session: any = await WorkSession.findById(sessionId).lean();
  if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  if (!isAdmin && session.userId.toString() !== requesterId) throw new ApiError(403, 'FORBIDDEN');
  // A worker only needs their entry/exit timestamps. Location, distance,
  // validation outcome and technical evidence are reserved for backoffice.
  const punchesQuery = TimePunch.find({ workSessionId: sessionId }).sort({ effectiveAt: 1 });
  if (!isAdmin) punchesQuery.select('_id type effectiveAt');
  const [punches, incidents, adjustments] = await Promise.all([
    punchesQuery.lean(),
    AttendanceIncident.find({ workSessionId: sessionId }).sort({ createdAt: -1 }).lean(),
    AttendanceAdjustmentRequest.find({ workSessionId: sessionId }).sort({ createdAt: -1 }).lean()
  ]);
  return { session, punches, incidents, adjustments };
}

export async function getSummary(userId: string, from: Date, to: Date) {
  const settings = await getAttendanceSettings();
  const rows = await WorkSession.aggregate([
    { $match: { userId: new Types.ObjectId(userId), startedAt: { $gte: from, $lte: to } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: settings.timezone } }, workedMinutes: { $sum: { $ifNull: ['$workedMinutes', 0] } }, sessions: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  const totalMinutes = rows.reduce((sum: number, row: any) => sum + row.workedMinutes, 0);
  return { days: rows, totalMinutes, totalHours: Math.round((totalMinutes / 60) * 100) / 100 };
}

export interface IncidentInput { workSessionId?: string; assignmentId?: string; type: string; description: string; attachments?: unknown[]; }

export async function createIncident(userId: string, input: IncidentInput) {
  if (input.workSessionId) {
    const session = await WorkSession.exists({ _id: input.workSessionId, userId });
    if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  }
  const incident = await AttendanceIncident.create({ userId, ...input, createdBy: userId, updatedBy: userId });
  if (input.workSessionId) await WorkSession.updateOne({ _id: input.workSessionId }, { hasIncident: true });
  return incident;
}

export async function resolveIncident(id: string, actorId: string, status: string, resolution?: string) {
  const incident = await AttendanceIncident.findOneAndUpdate(
    { _id: id },
    { status, resolution, resolvedBy: actorId, resolvedAt: new Date(), updatedBy: actorId },
    { new: true }
  );
  if (!incident) throw new ApiError(404, 'ATTENDANCE_INCIDENT_NOT_FOUND');
  return incident;
}

export interface AdjustmentInput { workSessionId: string; requestedStartAt?: Date; requestedEndAt?: Date; reason: string; attachments?: unknown[]; }

export async function createAdjustmentRequest(userId: string, input: AdjustmentInput) {
  const session: any = await WorkSession.findOne({ _id: input.workSessionId, userId }).lean();
  if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  const pending = await AttendanceAdjustmentRequest.exists({ workSessionId: input.workSessionId, status: AttendanceAdjustmentStatus.PENDING });
  if (pending) throw new ApiError(409, 'ATTENDANCE_ADJUSTMENT_ALREADY_PENDING');
  return AttendanceAdjustmentRequest.create({
    userId, workSessionId: input.workSessionId, requestedStartAt: input.requestedStartAt, requestedEndAt: input.requestedEndAt,
    reason: input.reason, attachments: input.attachments ?? [],
    originalSnapshot: { startedAt: session.startedAt, endedAt: session.endedAt, workedMinutes: session.workedMinutes, status: session.status },
    createdBy: userId, updatedBy: userId
  });
}

export async function reviewAdjustmentRequest(id: string, actorId: string, decision: 'approved' | 'rejected', reviewNotes?: string) {
  const request: any = await AttendanceAdjustmentRequest.findOne({ _id: id, status: AttendanceAdjustmentStatus.PENDING });
  if (!request) throw new ApiError(404, 'ATTENDANCE_ADJUSTMENT_NOT_PENDING');

  if (decision === 'rejected') {
    request.status = AttendanceAdjustmentStatus.REJECTED;
    request.reviewedBy = actorId; request.reviewedAt = new Date(); request.reviewNotes = reviewNotes; request.updatedBy = actorId;
    await request.save();
    return request;
  }

  const session: any = await WorkSession.findById(request.workSessionId);
  if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
  const startedAt: Date = request.requestedStartAt ?? session.startedAt;
  const endedAt: Date | undefined = request.requestedEndAt ?? session.endedAt;
  if (endedAt && endedAt.getTime() <= startedAt.getTime()) throw new ApiError(422, 'ATTENDANCE_ADJUSTMENT_INVALID_RANGE');
  const workedMinutes = endedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000)) : session.workedMinutes;

  session.startedAt = startedAt;
  if (endedAt) session.endedAt = endedAt;
  session.workedMinutes = workedMinutes;
  session.payableMinutes = Math.max(0, (workedMinutes ?? 0) - (session.breakMinutes ?? 0));
  session.status = WorkSessionStatus.ADJUSTED;
  session.requiresReview = false;
  session.updatedBy = actorId;
  await session.save();

  request.status = AttendanceAdjustmentStatus.APPROVED;
  request.reviewedBy = actorId; request.reviewedAt = new Date(); request.reviewNotes = reviewNotes; request.appliedAt = new Date(); request.updatedBy = actorId;
  await request.save();
  return request;
}

export async function adminCloseSession(sessionId: string, actorId: string, reason?: string) {
  const session: any = await WorkSession.findOne({ _id: sessionId, status: WorkSessionStatus.ACTIVE });
  if (!session) throw new ApiError(409, 'ATTENDANCE_NO_ACTIVE_SESSION');
  const now = new Date();
  const punch = await TimePunch.create({
    userId: session.userId, workSessionId: session._id, type: TimePunchType.CHECK_OUT, source: TimePunchSource.BACKOFFICE,
    clientOccurredAt: now, serverReceivedAt: now, effectiveAt: now, requestId: `admin-close-${session._id.toString()}-${now.getTime()}`,
    networkStatus: 'online', notes: reason, createdBy: actorId
  });
  const workedMinutes = Math.max(0, Math.round((now.getTime() - session.startedAt.getTime()) / 60_000));
  session.status = WorkSessionStatus.INCOMPLETE;
  session.endedAt = now;
  session.checkOutPunchId = punch._id;
  session.workedMinutes = workedMinutes;
  session.payableMinutes = workedMinutes;
  session.closedBy = actorId;
  session.closeReason = reason;
  session.requiresReview = true;
  session.updatedBy = actorId;
  await session.save();
  return session;
}
