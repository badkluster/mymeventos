import { Router } from 'express';
import { z } from 'zod';
import { User, buildUserFullName, normalizeUserEmail, normalizeUserPhone } from '../users/user.model'; import { RefreshToken } from './refreshToken.model'; import { validateRequest } from '../../middlewares/validateRequest'; import { asyncHandler } from '../../utils/asyncHandler'; import { ApiError } from '../../middlewares/errorHandler'; import { hashToken, generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/tokens'; import { hashPassword, verifyPassword } from '../../utils/password'; import { parseDurationMs as duration } from '../../utils/duration'; import { env } from '../../config/env'; import { sendSuccess } from '../../utils/api'; import { loginSchema } from './auth.schemas'; import { requireAuth } from '../../middlewares/auth'; import { writeAuditLog } from '../audit/audit.service'; import { registerFailedLoginAttempt } from '../../utils/account-lockout';
const router = Router(); const cookieBase = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none', path: '/', ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}) };
const optionalText = z.string().trim().optional().or(z.literal(''));
const profileSchema = z.object({ body: z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().min(1), email: z.string().trim().email(), phone: optionalText, documentType: optionalText, documentNumber: optionalText, avatarUrl: z.string().trim().url().optional().or(z.literal('')) }), params: z.object({}), query: z.object({}) });
const passwordSchema = z.object({ body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }), params: z.object({}), query: z.object({}) });
function safeUser(user: any) { const { passwordHash, passwordResetTokenHash, passwordResetExpiresAt, ...safe } = user.toObject ? user.toObject() : user; return safe; }
async function issueTokens(request: any, response: any, user: any) { const payload = { sub: user._id.toString(), username: user.username }; const accessToken = generateAccessToken(payload); const refreshToken = generateRefreshToken(payload); await RefreshToken.create({ userId: user._id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + duration(env.REFRESH_TOKEN_EXPIRES_IN)), createdByIp: request.ip, userAgent: request.get('user-agent') }); response.cookie('accessToken', accessToken, { ...cookieBase, maxAge: duration(env.ACCESS_TOKEN_EXPIRES_IN) }); response.cookie('refreshToken', refreshToken, { ...cookieBase, maxAge: duration(env.REFRESH_TOKEN_EXPIRES_IN) }); }
function clearTokens(response: any) { response.clearCookie('accessToken', cookieBase); response.clearCookie('refreshToken', cookieBase); }
router.post('/login', validateRequest(loginSchema), asyncHandler(async (request, response) => {
  const identifier = request.body.username.trim().toLowerCase();
  const user = await User.findOne({ deletedAt: null, $or: [{ username: identifier }, { normalizedEmail: identifier }] }).select('+passwordHash');
  const invalidCredentials = !user
    || !user.passwordHash
    || user.canAccessBackoffice === false
    || !(await verifyPassword(request.body.password, user.passwordHash))
    || !user.active
    || (user.lockedUntil && user.lockedUntil > new Date());

  if (invalidCredentials) {
    await Promise.all([
      user ? registerFailedLoginAttempt(user._id.toString()) : Promise.resolve(),
      writeAuditLog(request, 'AUTH_LOGIN_FAILURE', 'User', user?._id?.toString(), { username: request.body.username, channel: 'web' })
    ]);
    throw new ApiError(401, 'INVALID_CREDENTIALS');
  }

  await Promise.all([
    User.updateOne({ _id: user._id }, { lastLoginAt: new Date(), failedLoginAttempts: 0, $unset: { lockedUntil: 1 } }),
    issueTokens(request, response, user),
    writeAuditLog(request, 'AUTH_LOGIN_SUCCESS', 'User', user._id.toString(), { channel: 'web' }, user._id.toString())
  ]);
  return sendSuccess(response, { user: safeUser(user) });
}));
router.post('/refresh', asyncHandler(async (request, response) => { const token = request.cookies.refreshToken; if (!token) throw new ApiError(401, 'UNAUTHENTICATED'); const payload = verifyRefreshToken(token); const stored = await RefreshToken.findOne({ tokenHash: hashToken(token), userId: payload.sub, revokedAt: null }); if (!stored) throw new ApiError(401, 'UNAUTHENTICATED'); const user = await User.findOne({ _id: payload.sub, active: true, canAccessBackoffice: { $ne: false }, deletedAt: null }); if (!user) throw new ApiError(401, 'UNAUTHENTICATED'); await RefreshToken.updateOne({ _id: stored._id }, { revokedAt: new Date() }); await issueTokens(request, response, user); await writeAuditLog(request, 'AUTH_REFRESH_ROTATION', 'User', user._id.toString()); return sendSuccess(response, { refreshed: true }); }));
router.post('/logout', asyncHandler(async (request, response) => { const token = request.cookies.refreshToken; if (token) await RefreshToken.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { revokedAt: new Date() }); clearTokens(response); await writeAuditLog(request, 'AUTH_LOGOUT', 'User', request.user?.id); return sendSuccess(response, { loggedOut: true }); }));
router.post('/logout-all', requireAuth, asyncHandler(async (request, response) => { await RefreshToken.updateMany({ userId: request.user!.id, revokedAt: null }, { revokedAt: new Date() }); clearTokens(response); await writeAuditLog(request, 'AUTH_LOGOUT_ALL', 'User', request.user!.id); return sendSuccess(response, { loggedOut: true }); }));
router.get('/me', requireAuth, asyncHandler(async (request, response) => sendSuccess(response, { user: safeUser(request.authUser) })));
router.patch('/profile', requireAuth, validateRequest(profileSchema), asyncHandler(async (request, response) => {
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
    updatedBy: request.user!.id
  };
  const unset: Record<string, 1> = {};
  const setOptionalText = (field: string, value?: string) => {
    if (value) set[field] = value;
    else unset[field] = 1;
  };
  set.email = email;
  set.normalizedEmail = email;
  setOptionalText('phone', request.body.phone);
  setOptionalText('normalizedPhone', normalizeUserPhone(request.body.phone || undefined));
  setOptionalText('documentType', request.body.documentType);
  setOptionalText('documentNumber', request.body.documentNumber);
  setOptionalText('avatarUrl', request.body.avatarUrl);
  const user = await User.findOneAndUpdate({ _id: request.user!.id, deletedAt: null }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true, runValidators: true }).lean();
  await writeAuditLog(request, 'AUTH_PROFILE_UPDATE', 'User', request.user!.id);
  return sendSuccess(response, { user: safeUser(user) }, 200, 'Perfil actualizado correctamente.');
}));
router.patch('/password', requireAuth, validateRequest(passwordSchema), asyncHandler(async (request, response) => {
  if (request.body.currentPassword === request.body.newPassword) throw new ApiError(400, 'PASSWORD_REUSED');
  const user = await User.findOne({ _id: request.user!.id, deletedAt: null }).select('+passwordHash');
  if (!user?.passwordHash || !(await verifyPassword(request.body.currentPassword, user.passwordHash))) throw new ApiError(401, 'INVALID_CURRENT_PASSWORD');
  await User.updateOne({ _id: request.user!.id, deletedAt: null }, {
    $set: {
      passwordHash: await hashPassword(request.body.newPassword),
      mustChangePassword: false,
      lastPasswordChangeAt: new Date(),
      failedLoginAttempts: 0,
      updatedBy: request.user!.id
    },
    $unset: { lockedUntil: 1 }
  });
  await writeAuditLog(request, 'AUTH_PASSWORD_CHANGE', 'User', request.user!.id);
  return sendSuccess(response, { changed: true }, 200, 'Contraseña actualizada correctamente.');
}));
export default router;
