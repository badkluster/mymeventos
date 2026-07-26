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
const profileSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.string().trim().email().optional().or(z.literal('')),
    phone: optionalText,
    documentType: optionalText,
    documentNumber: optionalText
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
  const email = normalizeUserEmail(request.body.email || undefined);
  if (email) {
    const exists = await User.exists({ _id: { $ne: request.user!.id }, normalizedEmail: email, deletedAt: null });
    if (exists) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS');
  }
  const update = {
    firstName: request.body.firstName,
    lastName: request.body.lastName,
    fullName: buildUserFullName(request.body.firstName, request.body.lastName),
    email, normalizedEmail: email,
    phone: request.body.phone || undefined,
    normalizedPhone: normalizeUserPhone(request.body.phone || undefined),
    documentType: request.body.documentType || undefined,
    documentNumber: request.body.documentNumber || undefined,
    updatedBy: request.user!.id
  };
  const user = await User.findOneAndUpdate({ _id: request.user!.id, deletedAt: null }, update, { new: true, runValidators: true }).lean();
  await writeAuditLog(request, 'MOBILE_PROFILE_UPDATE', 'User', request.user!.id);
  return sendSuccess(response, { user: sanitizeUser(user) }, 200, 'Perfil actualizado correctamente.');
}));

// The upload itself reuses the existing generic POST /api/uploads (context=users), which
// already allows any authenticated user (Bearer or cookie) to upload — see
// apps/api/src/modules/uploads/uploads.routes.ts. This endpoint only persists the
// resulting URL onto the caller's own profile, mirroring the web's avatar flow exactly
// (apps/web/src/app/admin/profile/page.tsx: upload first, then PATCH the URL).
router.post('/avatar', requirePermission(Permission.PROFILE_AVATAR_UPDATE), validateRequest(avatarSchema), asyncHandler(async (request, response) => {
  const user = await User.findOneAndUpdate({ _id: request.user!.id, deletedAt: null }, { avatarUrl: request.body.avatarUrl, updatedBy: request.user!.id }, { new: true }).lean();
  await writeAuditLog(request, 'MOBILE_AVATAR_UPDATE', 'User', request.user!.id);
  return sendSuccess(response, { user: sanitizeUser(user) });
}));

router.delete('/avatar', requirePermission(Permission.PROFILE_AVATAR_UPDATE), asyncHandler(async (request, response) => {
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
