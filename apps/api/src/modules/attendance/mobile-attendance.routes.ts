import { Router } from 'express';
import { z } from 'zod';
import { Permission, ObjectIdSchema, AttendanceAdjustmentStatus } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { writeAuditLog } from '../audit/audit.service';
import { getApiMessage } from '../../utils/messages';
import { AttendanceIncident, AttendanceAdjustmentRequest } from './attendance.models';
import * as attendanceService from './attendance.service';

const router = Router();

const attachmentSchema = z.object({ url: z.string().url(), secureUrl: z.string().url().optional(), publicId: z.string().optional(), resourceType: z.enum(['image', 'video', 'raw']).optional(), format: z.string().optional(), bytes: z.number().optional() });
const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  altitude: z.number().optional(),
  heading: z.number().optional(),
  speed: z.number().optional()
});
const deviceFields = z.object({
  installationId: z.string().trim().optional(),
  platform: z.string().trim().optional(),
  osVersion: z.string().trim().optional(),
  appVersion: z.string().trim().optional(),
  deviceModel: z.string().trim().optional(),
  manufacturer: z.string().trim().optional()
});
const clockBaseFields = {
  requestId: z.string().trim().min(8).max(128),
  clientOccurredAt: z.coerce.date(),
  networkStatus: z.enum(['online', 'offline_sync']).default('online'),
  location: locationSchema.optional(),
  locationPermissionStatus: z.string().trim().optional(),
  device: deviceFields.optional(),
  notes: z.string().trim().max(500).optional()
};
const checkInSchema = z.object({ body: z.object({ ...clockBaseFields, salonId: ObjectIdSchema.optional(), eventId: ObjectIdSchema.optional() }), params: z.object({}), query: z.object({}) });
const checkOutSchema = z.object({ body: z.object(clockBaseFields), params: z.object({}), query: z.object({}) });
const idParams = z.object({ body: z.unknown().optional(), params: z.object({ id: ObjectIdSchema }), query: z.object({}) });
const historyQuerySchema = z.object({
  body: z.unknown().optional(), params: z.object({}),
  query: z.object({ page: z.coerce.number().int().positive().default(1), limit: z.coerce.number().int().positive().max(100).default(20), status: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() })
});
const summaryQuerySchema = z.object({ body: z.unknown().optional(), params: z.object({}), query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) });
const incidentSchema = z.object({
  body: z.object({ workSessionId: ObjectIdSchema.optional(), assignmentId: ObjectIdSchema.optional(), type: z.string().trim().min(1), description: z.string().trim().min(3).max(1000), attachments: z.array(attachmentSchema).optional() }),
  params: z.object({}), query: z.object({})
});
const adjustmentSchema = z.object({
  body: z.object({ workSessionId: ObjectIdSchema, requestedStartAt: z.coerce.date().optional(), requestedEndAt: z.coerce.date().optional(), reason: z.string().trim().min(3).max(1000), attachments: z.array(attachmentSchema).optional() }),
  params: z.object({}), query: z.object({})
});

router.use(requireAuth);

router.get('/status', requirePermission(Permission.ATTENDANCE_CLOCK), asyncHandler(async (request, response) => {
  return sendSuccess(response, await attendanceService.getStatus(request.user!.id));
}));

router.post('/check-in', requirePermission(Permission.ATTENDANCE_CLOCK), validateRequest(checkInSchema), asyncHandler(async (request, response) => {
  const result = await attendanceService.checkIn(request.user!.id, { ...request.body, publicIp: request.ip });
  await writeAuditLog(request, 'ATTENDANCE_CHECK_IN', 'WorkSession', result.session._id.toString(), { idempotentReplay: result.idempotentReplay, requestId: request.body.requestId });
  return sendSuccess(response, { session: result.session, punch: result.punch }, result.idempotentReplay ? 200 : 201, getApiMessage('ATTENDANCE_CHECK_IN_SUCCESS'));
}));

router.post('/check-out', requirePermission(Permission.ATTENDANCE_CLOCK), validateRequest(checkOutSchema), asyncHandler(async (request, response) => {
  const result = await attendanceService.checkOut(request.user!.id, { ...request.body, publicIp: request.ip });
  await writeAuditLog(request, 'ATTENDANCE_CHECK_OUT', 'WorkSession', result.session._id.toString(), { idempotentReplay: result.idempotentReplay, requestId: request.body.requestId });
  return sendSuccess(response, { session: result.session, punch: result.punch }, 200, getApiMessage('ATTENDANCE_CHECK_OUT_SUCCESS'));
}));

router.get('/history', requirePermission(Permission.ATTENDANCE_HISTORY_SELF), validateRequest(historyQuerySchema), asyncHandler(async (request, response) => {
  const { page, limit, status, from, to } = request.query as unknown as { page: number; limit: number; status?: string; from?: Date; to?: Date };
  return sendSuccess(response, await attendanceService.getHistory(request.user!.id, { page, limit, status, from, to }));
}));

router.get('/summary', requirePermission(Permission.ATTENDANCE_HISTORY_SELF), validateRequest(summaryQuerySchema), asyncHandler(async (request, response) => {
  const to = (request.query as any).to ?? new Date();
  const from = (request.query as any).from ?? new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  return sendSuccess(response, await attendanceService.getSummary(request.user!.id, from, to));
}));

router.get('/sessions/:id', requirePermission(Permission.ATTENDANCE_HISTORY_SELF), validateRequest(idParams), asyncHandler(async (request, response) => {
  return sendSuccess(response, await attendanceService.getSessionDetail(request.user!.id, request.params.id, false));
}));

router.get('/incidents', requirePermission(Permission.ATTENDANCE_INCIDENT_CREATE), asyncHandler(async (request, response) => {
  const incidents = await AttendanceIncident.find({ userId: request.user!.id }).sort({ createdAt: -1 }).limit(200).lean();
  return sendSuccess(response, { incidents });
}));

router.post('/incidents', requirePermission(Permission.ATTENDANCE_INCIDENT_CREATE), validateRequest(incidentSchema), asyncHandler(async (request, response) => {
  const incident = await attendanceService.createIncident(request.user!.id, request.body);
  await writeAuditLog(request, 'ATTENDANCE_INCIDENT_CREATE', 'AttendanceIncident', incident._id.toString());
  return sendSuccess(response, { incident }, 201, getApiMessage('ATTENDANCE_INCIDENT_CREATED'));
}));

router.get('/incidents/:id', requirePermission(Permission.ATTENDANCE_INCIDENT_CREATE), validateRequest(idParams), asyncHandler(async (request, response) => {
  const incident = await AttendanceIncident.findOne({ _id: request.params.id, userId: request.user!.id }).lean();
  if (!incident) throw new ApiError(404, 'ATTENDANCE_INCIDENT_NOT_FOUND');
  return sendSuccess(response, { incident });
}));

router.get('/adjustments', requirePermission(Permission.ATTENDANCE_ADJUSTMENT_REQUEST), asyncHandler(async (request, response) => {
  const adjustments = await AttendanceAdjustmentRequest.find({ userId: request.user!.id }).sort({ createdAt: -1 }).limit(200).lean();
  return sendSuccess(response, { adjustments });
}));

router.post('/adjustments', requirePermission(Permission.ATTENDANCE_ADJUSTMENT_REQUEST), validateRequest(adjustmentSchema), asyncHandler(async (request, response) => {
  const adjustment = await attendanceService.createAdjustmentRequest(request.user!.id, request.body);
  await writeAuditLog(request, 'ATTENDANCE_ADJUSTMENT_CREATE', 'AttendanceAdjustmentRequest', adjustment._id.toString());
  return sendSuccess(response, { adjustment }, 201, getApiMessage('ATTENDANCE_ADJUSTMENT_CREATED'));
}));

router.get('/adjustments/:id', requirePermission(Permission.ATTENDANCE_ADJUSTMENT_REQUEST), validateRequest(idParams), asyncHandler(async (request, response) => {
  const adjustment = await AttendanceAdjustmentRequest.findOne({ _id: request.params.id, userId: request.user!.id }).lean();
  if (!adjustment) throw new ApiError(404, 'ATTENDANCE_ADJUSTMENT_NOT_FOUND');
  return sendSuccess(response, { adjustment });
}));

router.post('/adjustments/:id/cancel', requirePermission(Permission.ATTENDANCE_ADJUSTMENT_REQUEST), validateRequest(idParams), asyncHandler(async (request, response) => {
  const adjustment = await AttendanceAdjustmentRequest.findOneAndUpdate(
    { _id: request.params.id, userId: request.user!.id, status: AttendanceAdjustmentStatus.PENDING },
    { status: AttendanceAdjustmentStatus.CANCELLED, updatedBy: request.user!.id },
    { new: true }
  );
  if (!adjustment) throw new ApiError(404, 'ATTENDANCE_ADJUSTMENT_NOT_PENDING');
  await writeAuditLog(request, 'ATTENDANCE_ADJUSTMENT_CANCEL', 'AttendanceAdjustmentRequest', adjustment._id.toString());
  return sendSuccess(response, { adjustment });
}));

export default router;
