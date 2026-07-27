import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import { User, buildUserFullName, normalizeUserEmail, normalizeUserPhone } from '../users/user.model';
import { sanitizeUser } from '../users/user.service';
import { RefreshToken } from '../auth/refreshToken.model';
import { MobileDevice } from './mobileDevice.model';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { writeAuditLog } from '../audit/audit.service';
import { getApiMessage } from '../../utils/messages';
import { ObjectIdSchema } from '@mym/shared';

const router = Router();
const devicePushRouter = Router();

const optionalText = z.string().trim().optional().or(z.literal(''));
const optionalDate = z.string().trim().optional().refine((value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Fecha inválida. Usá el formato AAAA-MM-DD.');
const profileSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.string().trim().email(),
    phone: optionalText,
    documentType: optionalText,
    documentNumber: optionalText,
    birthDate: optionalDate,
    address: optionalText,
    emergencyContactName: optionalText,
    emergencyContactPhone: optionalText
  }),
  params: z.object({}), query: z.object({})
});
const avatarSchema = z.object({ body: z.object({ avatarUrl: z.string().trim().url() }), params: z.object({}), query: z.object({}) });
const deviceParams = z.object({ body: z.unknown().optional(), params: z.object({ deviceId: ObjectIdSchema }), query: z.object({}) });
const pushTokenSchema = z.object({ body: z.object({ installationId: z.string().trim().min(1), pushToken: z.string().trim().min(1) }), params: z.object({}), query: z.object({}) });

router.use(requireAuth);

router.get('/', requirePermission(Permission.PROFILE_VIEW_SELF), asyncHandler(async (request, response) => {
  const user = await User.findById(request.user!.id).lean();
  return sendSuccess(response, { user: sanitizeUser(user) });
}));

router.patch('/', requirePermission(Permission.PROFILE_UPDATE_SELF), validateRequest(profileSchema), asyncHandler(async (request, response) => {
  const email = normalizeUserEmail(request.body.email);
  const currentUser: any = await User.findOne({ _id: request.user!.id, deletedAt: null }).lean();
  const currentEmail = normalizeUserEmail(currentUser?.email ?? currentUser?.normalizedEmail);
  if (email && email !== currentEmail) {
    const exists = await User.exists({ _id: { $ne: request.user!.id }, normalizedEmail: email });
    if (exists) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS');
  }
  const set: Record<string, unknown> = {
    firstName: request.body.firstName,
    lastName: request.body.lastName,
    fullName: buildUserFullName(request.body.firstName, request.body.lastName),
    email, normalizedEmail: email,
    updatedBy: request.user!.id
  };
  const unset: Record<string, 1> = {};
  const setOptionalText = (field: string, value?: string) => {
    if (value) set[field] = value;
    else unset[field] = 1;
  };
  setOptionalText('phone', request.body.phone);
  setOptionalText('normalizedPhone', normalizeUserPhone(request.body.phone || undefined));
  setOptionalText('documentType', request.body.documentType);
  setOptionalText('documentNumber', request.body.documentNumber);
  setOptionalText('address', request.body.address);
  setOptionalText('emergencyContactName', request.body.emergencyContactName);
  setOptionalText('emergencyContactPhone', request.body.emergencyContactPhone);
  if (request.body.birthDate) set.birthDate = new Date(`${request.body.birthDate}T12:00:00.000Z`);
  else unset.birthDate = 1;
  const user = await User.findOneAndUpdate(
    { _id: request.user!.id, deletedAt: null },
    { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { new: true, runValidators: true },
  ).lean();
  await writeAuditLog(request, 'MOBILE_PROFILE_UPDATE', 'User', request.user!.id);
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, 'Perfil actualizado correctamente.');
}));

// The upload itself reuses the existing generic POST /api/uploads (context=users), which
// already allows any authenticated user (Bearer or cookie) to upload — see
// apps/api/src/modules/uploads/uploads.routes.ts. This endpoint only persists the
// resulting URL onto the caller's own profile, mirroring the web's avatar flow exactly
// (apps/web/src/app/admin/profile/page.tsx: upload first, then PATCH the URL).
router.post('/avatar', requirePermission(Permission.PROFILE_UPDATE_SELF), validateRequest(avatarSchema), asyncHandler(async (request, response) => {
  const user = await User.findOneAndUpdate({ _id: request.user!.id, deletedAt: null }, { avatarUrl: request.body.avatarUrl, updatedBy: request.user!.id }, { new: true }).lean();
  await writeAuditLog(request, 'MOBILE_AVATAR_UPDATE', 'User', request.user!.id);
  return sendSuccess(response, { user: sanitizeUser(user) });
}));

router.delete('/avatar', requirePermission(Permission.PROFILE_UPDATE_SELF), asyncHandler(async (request, response) => {
  const user = await User.findOneAndUpdate({ _id: request.user!.id, deletedAt: null }, { $unset: { avatarUrl: 1 }, updatedBy: request.user!.id }, { new: true }).lean();
  await writeAuditLog(request, 'MOBILE_AVATAR_DELETE', 'User', request.user!.id);
  return sendSuccess(response, { user: sanitizeUser(user) });
}));

router.get('/devices', asyncHandler(async (request, response) => {
  const devices = await MobileDevice.find({ userId: request.user!.id }).sort({ lastUsedAt: -1 }).lean();
  return sendSuccess(response, { devices });
}));

router.delete('/devices/:deviceId', validateRequest(deviceParams), asyncHandler(async (request, response) => {
  const device: any = await MobileDevice.findOneAndUpdate(
    { _id: request.params.deviceId, userId: request.user!.id },
    { isActive: false, revokedAt: new Date(), revokedBy: request.user!.id },
    { new: true }
  );
  if (!device) throw new ApiError(404, 'MOBILE_DEVICE_NOT_FOUND');
  await RefreshToken.updateMany({ userId: request.user!.id, installationId: device.installationId, revokedAt: null }, { revokedAt: new Date() });
  await writeAuditLog(request, 'MOBILE_DEVICE_REVOKE', 'MobileDevice', device._id.toString());
  return sendSuccess(response, { revoked: true }, 200, getApiMessage('MOBILE_DEVICE_REVOKED'));
}));

devicePushRouter.use(requireAuth);
devicePushRouter.post('/push-token', validateRequest(pushTokenSchema), asyncHandler(async (request, response) => {
  const device = await MobileDevice.findOneAndUpdate(
    { userId: request.user!.id, installationId: request.body.installationId },
    { pushToken: request.body.pushToken, lastUsedAt: new Date() },
    { new: true }
  );
  if (!device) throw new ApiError(404, 'MOBILE_DEVICE_NOT_FOUND');
  return sendSuccess(response, { updated: true });
}));

export default router;
export { devicePushRouter as mobileDevicePushRoutes };
