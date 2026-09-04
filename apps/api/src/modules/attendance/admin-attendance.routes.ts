import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, ObjectIdSchema, Role, WorkSessionStatus, AttendanceIncidentStatus, AttendanceAdjustmentStatus } from '@mym/shared';
import { accessibleSalonIds, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { writeAuditLog } from '../audit/audit.service';
import { getApiMessage } from '../../utils/messages';
import { WorkSession, AttendanceIncident, AttendanceAdjustmentRequest } from './attendance.models';
import * as attendanceService from './attendance.service';
import { getAttendanceSettings, updateAttendanceSettings } from './attendance-settings.service';

const router = Router();
const idParams = z.object({ body: z.unknown().optional(), params: z.object({ id: ObjectIdSchema }), query: z.object({}) });

function scopeFilter(request: Request): Record<string, unknown> {
  if (request.user!.roles.includes(Role.ADMIN)) return {};
  return { salonId: { $in: accessibleSalonIds(request.user!) } };
}

async function assertSessionInScope(request: Request, sessionId: string): Promise<void> {
  const session = await WorkSession.exists({ _id: sessionId, ...scopeFilter(request) });
  if (!session) throw new ApiError(404, 'ATTENDANCE_SESSION_NOT_FOUND');
}

const listSessionsSchema = z.object({
  body: z.unknown().optional(), params: z.object({}),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    userId: ObjectIdSchema.optional(),
    salonId: ObjectIdSchema.optional(),
    eventId: ObjectIdSchema.optional(),
    status: z.nativeEnum(WorkSessionStatus).optional(),
    requiresReview: z.enum(['true', 'false']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional()
  })
});
const closeSessionSchema = z.object({ body: z.object({ reason: z.string().trim().min(3).max(500) }), params: z.object({ id: ObjectIdSchema }), query: z.object({}) });
const reviewSessionSchema = z.object({
  body: z.object({
    status: z.enum([WorkSessionStatus.COMPLETED, WorkSessionStatus.INCOMPLETE, WorkSessionStatus.CANCELLED]),
    reviewNotes: z.string().trim().max(1000).optional()
  }),
  params: z.object({ id: ObjectIdSchema }), query: z.object({})
});
const listIncidentsSchema = z.object({
  body: z.unknown().optional(), params: z.object({}),
  query: z.object({ status: z.nativeEnum(AttendanceIncidentStatus).optional(), userId: ObjectIdSchema.optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(200).default(50) })
});
const resolveIncidentSchema = z.object({ body: z.object({ status: z.enum([AttendanceIncidentStatus.RESOLVED, AttendanceIncidentStatus.REJECTED, AttendanceIncidentStatus.IN_REVIEW]), resolution: z.string().trim().max(1000).optional() }), params: z.object({ id: ObjectIdSchema }), query: z.object({}) });
const listAdjustmentsSchema = z.object({
  body: z.unknown().optional(), params: z.object({}),
  query: z.object({ status: z.nativeEnum(AttendanceAdjustmentStatus).optional(), userId: ObjectIdSchema.optional(), page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(200).default(50) })
});
const reviewAdjustmentSchema = z.object({ body: z.object({ decision: z.enum(['approved', 'rejected']), reviewNotes: z.string().trim().max(1000).optional() }), params: z.object({ id: ObjectIdSchema }), query: z.object({}) });
const settingsSchema = z.object({
  body: z.object({
    timezone: z.string().trim().optional(),
    minLocationAccuracyMeters: z.coerce.number().positive().optional(),
    defaultGeofenceRadiusMeters: z.coerce.number().positive().optional(),
    lateToleranceMinutes: z.coerce.number().int().min(0).optional(),
    earlyCheckoutToleranceMinutes: z.coerce.number().int().min(0).optional(),
    maxShiftHours: z.coerce.number().positive().optional(),
    requireShiftToClockIn: z.boolean().optional(),
    allowIncidents: z.boolean().optional()
  }).refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'),
  params: z.object({}), query: z.object({})
});

router.use(requireAuth);

router.get('/sessions/active', requirePermission(Permission.ATTENDANCE_READ), asyncHandler(async (request, response) => {
  const sessions = await WorkSession.find({ status: WorkSessionStatus.ACTIVE, ...scopeFilter(request) })
    .sort({ startedAt: -1 })
    .populate('userId', 'firstName lastName fullName avatarUrl staffProfile.staffCode staffProfile.staffSubroles')
    .populate('salonId', 'name city')
    .populate('checkInPunchId', 'networkStatus clockSkewMs locationValidationStatus')
    .lean();
  return sendSuccess(response, {
    sessions: sessions.map(({ checkInPunchId, ...session }: any) => ({
      ...session,
      requiresReview: attendanceService.hasEffectiveReviewRequirement(session, checkInPunchId)
    }))
  });
}));

router.get('/sessions', requirePermission(Permission.ATTENDANCE_READ), validateRequest(listSessionsSchema), asyncHandler(async (request, response) => {
  const query = request.query as any;
  const filter: Record<string, unknown> = { ...scopeFilter(request) };
  if (query.userId) filter.userId = query.userId;
  if (query.salonId) filter.salonId = query.salonId;
  if (query.eventId) filter.eventId = query.eventId;
  if (query.status) filter.status = query.status;
  if (query.requiresReview) filter.requiresReview = query.requiresReview === 'true';
  if (query.from || query.to) filter.startedAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const [items, total] = await Promise.all([
    WorkSession.find(filter).sort({ startedAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('userId', 'firstName lastName fullName avatarUrl')
      .populate('salonId', 'name city')
      .lean(),
    WorkSession.countDocuments(filter)
  ]);
  return sendSuccess(response, { items, total, page, limit });
}));

router.get('/sessions/:id', requirePermission(Permission.ATTENDANCE_READ), validateRequest(idParams), asyncHandler(async (request, response) => {
  await assertSessionInScope(request, request.params.id);
  return sendSuccess(response, await attendanceService.getSessionDetail(request.user!.id, request.params.id, true));
}));

router.post('/sessions/:id/close', requirePermission(Permission.ATTENDANCE_MANAGE), validateRequest(closeSessionSchema), asyncHandler(async (request, response) => {
  await assertSessionInScope(request, request.params.id);
  const session = await attendanceService.adminCloseSession(request.params.id, request.user!.id, request.body.reason);
  await writeAuditLog(request, 'ATTENDANCE_SESSION_ADMIN_CLOSE', 'WorkSession', session._id.toString(), { reason: request.body.reason });
  return sendSuccess(response, { session }, 200, getApiMessage('ATTENDANCE_SESSION_CLOSED'));
}));

router.post('/sessions/:id/review', requirePermission(Permission.ATTENDANCE_MANAGE), validateRequest(reviewSessionSchema), asyncHandler(async (request, response) => {
  await assertSessionInScope(request, request.params.id);
  const session = await attendanceService.reviewSession(request.params.id, request.user!.id, request.body.status, request.body.reviewNotes);
  await writeAuditLog(request, 'ATTENDANCE_SESSION_REVIEW', 'WorkSession', session._id.toString(), { status: request.body.status, reviewNotes: request.body.reviewNotes });
  return sendSuccess(response, { session }, 200, getApiMessage('ATTENDANCE_SESSION_REVIEWED'));
}));

router.get('/incidents', requirePermission(Permission.ATTENDANCE_READ), validateRequest(listIncidentsSchema), asyncHandler(async (request, response) => {
  const query = request.query as any;
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.userId) filter.userId = query.userId;
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const [items, total] = await Promise.all([
    AttendanceIncident.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'firstName lastName fullName').lean(),
    AttendanceIncident.countDocuments(filter)
  ]);
  return sendSuccess(response, { items, total, page, limit });
}));

router.post('/incidents/:id/resolve', requirePermission(Permission.ATTENDANCE_MANAGE), validateRequest(resolveIncidentSchema), asyncHandler(async (request, response) => {
  const incident = await attendanceService.resolveIncident(request.params.id, request.user!.id, request.body.status, request.body.resolution);
  await writeAuditLog(request, 'ATTENDANCE_INCIDENT_RESOLVE', 'AttendanceIncident', incident._id.toString(), { status: request.body.status });
  return sendSuccess(response, { incident }, 200, getApiMessage('ATTENDANCE_INCIDENT_RESOLVED'));
}));

router.get('/adjustments', requirePermission(Permission.ATTENDANCE_READ), validateRequest(listAdjustmentsSchema), asyncHandler(async (request, response) => {
  const query = request.query as any;
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.userId) filter.userId = query.userId;
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  const [items, total] = await Promise.all([
    AttendanceAdjustmentRequest.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('userId', 'firstName lastName fullName').lean(),
    AttendanceAdjustmentRequest.countDocuments(filter)
  ]);
  return sendSuccess(response, { items, total, page, limit });
}));

router.post('/adjustments/:id/review', requirePermission(Permission.ATTENDANCE_MANAGE), validateRequest(reviewAdjustmentSchema), asyncHandler(async (request, response) => {
  const adjustment = await attendanceService.reviewAdjustmentRequest(request.params.id, request.user!.id, request.body.decision, request.body.reviewNotes);
  await writeAuditLog(request, 'ATTENDANCE_ADJUSTMENT_REVIEW', 'AttendanceAdjustmentRequest', adjustment._id.toString(), { decision: request.body.decision });
  return sendSuccess(response, { adjustment }, 200, getApiMessage('ATTENDANCE_ADJUSTMENT_REVIEWED'));
}));

router.get('/settings', requirePermission(Permission.ATTENDANCE_SETTINGS_MANAGE), asyncHandler(async (_request, response) => {
  return sendSuccess(response, { settings: await getAttendanceSettings() });
}));

router.patch('/settings', requirePermission(Permission.ATTENDANCE_SETTINGS_MANAGE), validateRequest(settingsSchema), asyncHandler(async (request, response) => {
  const settings = await updateAttendanceSettings(request.body, request.user!.id);
  await writeAuditLog(request, 'ATTENDANCE_SETTINGS_UPDATE', 'SystemSetting', undefined, request.body);
  return sendSuccess(response, { settings }, 200, getApiMessage('ATTENDANCE_SETTINGS_UPDATED'));
}));

export default router;
