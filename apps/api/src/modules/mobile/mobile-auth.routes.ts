import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { Permission, StaffEmploymentStatus } from '@mym/shared';
import { User } from '../users/user.model';
import { sanitizeUser } from '../users/user.service';
import { RefreshToken } from '../auth/refreshToken.model';
import { MobileDevice } from './mobileDevice.model';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, hashToken } from '../../utils/tokens';
import { hashPassword, verifyPassword } from '../../utils/password';
import { parseDurationMs } from '../../utils/duration';
import { env } from '../../config/env';
import { sendSuccess } from '../../utils/api';
import { requireAuth, requirePermission, userHasPermission } from '../../middlewares/auth';
import { writeAuditLog } from '../audit/audit.service';
import { sendEmail } from '../email/email.service';
import { getApiMessage } from '../../utils/messages';

const router = Router();

const deviceFields = z.object({
  installationId: z.string().trim().min(1),
  platform: z.enum(['ios', 'android', 'web']),
  isPhysicalDevice: z.boolean().optional(),
  deviceType: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  osVersion: z.string().trim().optional(),
  osName: z.string().trim().optional(),
  osBuildId: z.string().trim().optional(),
  osInternalBuildId: z.string().trim().optional(),
  osBuildFingerprint: z.string().trim().optional(),
  platformApiLevel: z.number().int().nonnegative().optional(),
  appVersion: z.string().trim().optional(),
  appBuildVersion: z.string().trim().optional(),
  applicationId: z.string().trim().optional(),
  deviceModel: z.string().trim().optional(),
  modelId: z.string().trim().optional(),
  deviceName: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  designName: z.string().trim().optional(),
  productName: z.string().trim().optional(),
  deviceYearClass: z.number().int().positive().optional(),
  rooted: z.boolean().optional(),
  appInstalledAt: z.coerce.date().optional(),
  appLastUpdatedAt: z.coerce.date().optional(),
  network: z.object({ connectionType: z.string().trim().optional(), reportedIp: z.string().trim().max(128).optional() }).optional()
});

const loginSchema = z.object({
  body: z.object({ username: z.string().trim().min(3).max(100), password: z.string().min(1).max(256), device: deviceFields, pushToken: z.string().trim().optional() }),
  params: z.object({}), query: z.object({})
});
const refreshSchema = z.object({ body: z.object({ refreshToken: z.string().min(10) }), params: z.object({}), query: z.object({}) });
const forgotSchema = z.object({ body: z.object({ username: z.string().trim().min(1) }), params: z.object({}), query: z.object({}) });
const resetSchema = z.object({ body: z.object({ token: z.string().min(10), newPassword: z.string().min(8) }), params: z.object({}), query: z.object({}) });
const changePasswordSchema = z.object({ body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }), params: z.object({}), query: z.object({}) });

function toPseudoAuthUser(user: any) {
  return { id: user._id.toString(), roles: user.roles ?? [], permissionOverrides: user.permissionOverrides ?? [], permissionDeniedOverrides: user.permissionDeniedOverrides ?? [], salonIds: [], managedSalonIds: [], active: Boolean(user.active) };
}

function isMobileEligible(user: any): boolean {
  if (!user?.active) return false;
  if (user.staffProfile?.employmentStatus && user.staffProfile.employmentStatus !== StaffEmploymentStatus.ACTIVE) return false;
  // Two independent gates, both required: the role/override-level permission (coarse —
  // "this kind of user may use the mobile app at all") AND the existing per-user
  // attendanceConfig.canUseMobileApp toggle already exposed in the backoffice's
  // "Asistencia" tab (fine-grained — an admin must explicitly turn the app on for THIS
  // person). Without the second check the admin toggle would be cosmetic.
  if (!user.attendanceConfig?.canUseMobileApp) return false;
  return userHasPermission(toPseudoAuthUser(user), Permission.MOBILE_ACCESS);
}

async function issueMobileTokens(user: any, installationId: string | undefined, request: any) {
  const payload = { sub: user._id.toString(), username: user.username };
  const accessToken = generateAccessToken(payload, env.MOBILE_ACCESS_TOKEN_TTL);
  const refreshToken = generateRefreshToken(payload, env.MOBILE_REFRESH_TOKEN_TTL);
  await RefreshToken.create({
    userId: user._id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + parseDurationMs(env.MOBILE_REFRESH_TOKEN_TTL)),
    createdByIp: request.ip, userAgent: request.get('user-agent'), channel: 'mobile', installationId
  });
  return { accessToken, refreshToken, accessTokenExpiresIn: env.MOBILE_ACCESS_TOKEN_TTL };
}

async function upsertDevice(userId: string, device: z.infer<typeof deviceFields>, request: any, pushToken?: string) {
  return MobileDevice.findOneAndUpdate(
    { userId, installationId: device.installationId },
    {
      $set: {
        platform: device.platform, isPhysicalDevice: device.isPhysicalDevice, deviceType: device.deviceType, brand: device.brand,
        osVersion: device.osVersion, osName: device.osName, osBuildId: device.osBuildId, osInternalBuildId: device.osInternalBuildId, osBuildFingerprint: device.osBuildFingerprint, platformApiLevel: device.platformApiLevel,
        appVersion: device.appVersion, appBuildVersion: device.appBuildVersion, applicationId: device.applicationId,
        deviceModel: device.deviceModel, modelId: device.modelId, deviceName: device.deviceName, manufacturer: device.manufacturer, designName: device.designName, productName: device.productName,
        deviceYearClass: device.deviceYearClass, rooted: device.rooted, appInstalledAt: device.appInstalledAt, appLastUpdatedAt: device.appLastUpdatedAt,
        lastPublicIp: request.ip, lastReportedIp: device.network?.reportedIp, lastConnectionType: device.network?.connectionType, lastUserAgent: request.get('user-agent'),
        ...(pushToken ? { pushToken } : {}), lastLoginAt: new Date(), lastUsedAt: new Date(), isActive: true
      },
      $unset: { revokedAt: 1, revokedBy: 1 },
      $setOnInsert: { userId, installationId: device.installationId }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

router.post('/login', validateRequest(loginSchema), asyncHandler(async (request, response) => {
  const user: any = await User.findOne({ username: request.body.username.toLowerCase(), deletedAt: null }).select('+passwordHash');
  const credentialsValid = user?.passwordHash ? await verifyPassword(request.body.password, user.passwordHash) : false;
  const locked = Boolean(user?.lockedUntil && user.lockedUntil > new Date());
  if (!user || !credentialsValid || locked) {
    if (user) await User.updateOne({ _id: user._id }, { $inc: { failedLoginAttempts: 1 } });
    await writeAuditLog(request, 'AUTH_MOBILE_LOGIN_FAILURE', 'User', user?._id?.toString(), { username: request.body.username });
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  }
  if (!isMobileEligible(user)) {
    await writeAuditLog(request, 'AUTH_MOBILE_LOGIN_DENIED', 'User', user._id.toString());
    throw new ApiError(403, 'MOBILE_ACCESS_DENIED');
  }
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date(), failedLoginAttempts: 0, $unset: { lockedUntil: 1 } });
  await upsertDevice(user._id.toString(), request.body.device, request, request.body.pushToken);
  const tokens = await issueMobileTokens(user, request.body.device.installationId, request);
  await writeAuditLog(request, 'AUTH_MOBILE_LOGIN_SUCCESS', 'User', user._id.toString(), {
    channel: 'mobile', installationId: request.body.device.installationId, platform: request.body.device.platform,
    appVersion: request.body.device.appVersion, deviceModel: request.body.device.deviceModel
  }, user._id.toString());
  return sendSuccess(response, { ...tokens, user: sanitizeUser(user) });
}));

router.post('/refresh', validateRequest(refreshSchema), asyncHandler(async (request, response) => {
  const token = request.body.refreshToken;
  let payload;
  try { payload = verifyRefreshToken(token); } catch { throw new ApiError(401, 'UNAUTHENTICATED'); }
  const stored: any = await RefreshToken.findOne({ tokenHash: hashToken(token), userId: payload.sub, revokedAt: null });
  if (!stored) throw new ApiError(401, 'UNAUTHENTICATED');
  const user: any = await User.findOne({ _id: payload.sub, deletedAt: null });
  if (!user || !isMobileEligible(user)) throw new ApiError(401, 'UNAUTHENTICATED');
  await RefreshToken.updateOne({ _id: stored._id }, { revokedAt: new Date() });
  const tokens = await issueMobileTokens(user, stored.installationId, request);
  if (stored.installationId) await MobileDevice.updateOne({ userId: user._id, installationId: stored.installationId }, { lastUsedAt: new Date() });
  await writeAuditLog(request, 'AUTH_MOBILE_REFRESH_ROTATION', 'User', user._id.toString());
  return sendSuccess(response, tokens);
}));

router.post('/logout', validateRequest(refreshSchema), asyncHandler(async (request, response) => {
  await RefreshToken.updateOne({ tokenHash: hashToken(request.body.refreshToken), revokedAt: null }, { revokedAt: new Date() });
  await writeAuditLog(request, 'AUTH_MOBILE_LOGOUT', 'User', request.user?.id);
  return sendSuccess(response, { loggedOut: true });
}));

router.post('/logout-all', requireAuth, asyncHandler(async (request, response) => {
  await RefreshToken.updateMany({ userId: request.user!.id, revokedAt: null, channel: 'mobile' }, { revokedAt: new Date() });
  await writeAuditLog(request, 'AUTH_MOBILE_LOGOUT_ALL', 'User', request.user!.id);
  return sendSuccess(response, { loggedOut: true });
}));

router.get('/session', requireAuth, asyncHandler(async (request, response) => {
  const user = await User.findById(request.user!.id).lean();
  return sendSuccess(response, { user: sanitizeUser(user) });
}));

router.post('/forgot-password', validateRequest(forgotSchema), asyncHandler(async (request, response) => {
  const identifier = request.body.username.toLowerCase().trim();
  const user: any = await User.findOne({ deletedAt: null, $or: [{ username: identifier }, { normalizedEmail: identifier }] });
  if (user && isMobileEligible(user)) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    await User.updateOne({ _id: user._id }, { passwordResetTokenHash: hashToken(rawToken), passwordResetExpiresAt: new Date(Date.now() + 30 * 60_000) });
    const deepLink = `${env.MOBILE_DEEP_LINK_SCHEME}://reset-password?token=${rawToken}`;
    await sendEmail({
      to: user.email || user.username,
      subject: 'Restablecer contraseña — M&M Eventos',
      text: `Usá este código en la app para restablecer tu contraseña: ${rawToken}\n\nSi tenés la app instalada, también podés abrir este enlace: ${deepLink}\n\nEste código vence en 30 minutos. Si no lo solicitaste, ignorá este mensaje.`
    });
    await writeAuditLog(request, 'AUTH_MOBILE_PASSWORD_RESET_REQUESTED', 'User', user._id.toString());
  }
  return sendSuccess(response, { requested: true }, 200, getApiMessage('PASSWORD_RESET_REQUESTED'));
}));

router.post('/reset-password', validateRequest(resetSchema), asyncHandler(async (request, response) => {
  const tokenHash = hashToken(request.body.token);
  const user: any = await User.findOne({ passwordResetTokenHash: tokenHash, passwordResetExpiresAt: { $gt: new Date() }, deletedAt: null });
  if (!user) throw new ApiError(400, 'PASSWORD_RESET_TOKEN_INVALID');
  await User.updateOne({ _id: user._id }, {
    $set: { passwordHash: await hashPassword(request.body.newPassword), mustChangePassword: false, lastPasswordChangeAt: new Date(), failedLoginAttempts: 0 },
    $unset: { lockedUntil: 1, passwordResetTokenHash: 1, passwordResetExpiresAt: 1 }
  });
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { revokedAt: new Date() });
  await writeAuditLog(request, 'AUTH_MOBILE_PASSWORD_RESET_SUCCESS', 'User', user._id.toString());
  return sendSuccess(response, { reset: true }, 200, getApiMessage('PASSWORD_RESET_SUCCESS'));
}));

router.post('/change-password', requireAuth, requirePermission(Permission.SECURITY_PASSWORD_CHANGE), validateRequest(changePasswordSchema), asyncHandler(async (request, response) => {
  if (request.body.currentPassword === request.body.newPassword) throw new ApiError(400, 'PASSWORD_REUSED');
  const user: any = await User.findOne({ _id: request.user!.id, deletedAt: null }).select('+passwordHash');
  if (!user?.passwordHash || !(await verifyPassword(request.body.currentPassword, user.passwordHash))) throw new ApiError(401, 'INVALID_CURRENT_PASSWORD');
  await User.updateOne({ _id: request.user!.id }, {
    $set: { passwordHash: await hashPassword(request.body.newPassword), mustChangePassword: false, lastPasswordChangeAt: new Date(), failedLoginAttempts: 0, updatedBy: request.user!.id },
    $unset: { lockedUntil: 1 }
  });
  await writeAuditLog(request, 'AUTH_MOBILE_PASSWORD_CHANGE', 'User', request.user!.id);
  return sendSuccess(response, { changed: true }, 200, 'Contraseña actualizada correctamente.');
}));

export default router;
