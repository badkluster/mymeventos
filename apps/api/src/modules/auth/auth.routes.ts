import { Router } from 'express';
import { z } from 'zod';
import { User, buildUserFullName, normalizeUserEmail, normalizeUserPhone } from '../users/user.model'; import { RefreshToken } from './refreshToken.model'; import { validateRequest } from '../../middlewares/validateRequest'; import { asyncHandler } from '../../utils/asyncHandler'; import { ApiError } from '../../middlewares/errorHandler'; import { hashToken, generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../utils/tokens'; import { hashPassword, verifyPassword } from '../../utils/password'; import { env } from '../../config/env'; import { sendSuccess } from '../../utils/api'; import { loginSchema } from './auth.schemas'; import { requireAuth } from '../../middlewares/auth'; import { writeAuditLog } from '../audit/audit.service';
const router = Router(); const cookieBase = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none', path: '/', ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}) }; const duration = (value: string) => { const match = /^(\d+)([smhd])$/.exec(value); if (!match) return 0; return Number(match[1]) * ({ s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as Record<string, number>)[match[2]]; };
const optionalText = z.string().trim().optional().or(z.literal(''));
const profileSchema = z.object({ body: z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().min(1), email: z.string().trim().email().optional().or(z.literal('')), phone: optionalText, documentType: optionalText, documentNumber: optionalText, avatarUrl: z.string().trim().url().optional().or(z.literal('')) }), params: z.object({}), query: z.object({}) });
const passwordSchema = z.object({ body: z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }), params: z.object({}), query: z.object({}) });
function safeUser(user: any) { const { passwordHash, passwordResetTokenHash, passwordResetExpiresAt, ...safe } = user.toObject ? user.toObject() : user; return safe; }
async function issueTokens(request: any, response: any, user: any) { const payload = { sub: user._id.toString(), username: user.username }; const accessToken = generateAccessToken(payload); const refreshToken = generateRefreshToken(payload); await RefreshToken.create({ userId: user._id, tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + duration(env.REFRESH_TOKEN_EXPIRES_IN)), createdByIp: request.ip, userAgent: request.get('user-agent') }); response.cookie('accessToken', accessToken, { ...cookieBase, maxAge: duration(env.ACCESS_TOKEN_EXPIRES_IN) }); response.cookie('refreshToken', refreshToken, { ...cookieBase, maxAge: duration(env.REFRESH_TOKEN_EXPIRES_IN) }); }
function clearTokens(response: any) { response.clearCookie('accessToken', cookieBase); response.clearCookie('refreshToken', cookieBase); }
router.post('/login', validateRequest(loginSchema), asyncHandler(async (request, response) => { const user = await User.findOne({ username: request.body.username.toLowerCase(), deletedAt: null }).select('+passwordHash'); if (!user || !user.passwordHash || user.canAccessBackoffice === false || !(await verifyPassword(request.body.password, user.passwordHash)) || !user.active || (user.lockedUntil && user.lockedUntil > new Date())) { if (user) await User.updateOne({ _id: user._id }, { $inc: { failedLoginAttempts: 1 } }); await writeAuditLog(request, 'AUTH_LOGIN_FAILURE', 'User', user?._id?.toString(), { username: request.body.username }); throw new ApiError(401, 'INVALID_CREDENTIALS'); } await User.updateOne({ _id: user._id }, { lastLoginAt: new Date(), failedLoginAttempts: 0, $unset: { lockedUntil: 1 } }); await issueTokens(request, response, user); await writeAuditLog(request, 'AUTH_LOGIN_SUCCESS', 'User', user._id.toString()); return sendSuccess(response, { user: safeUser(user) }); }));
router.post('/refresh', asyncHandler(async (request, response) => { const token = request.cookies.refreshToken; if (!token) throw new ApiError(401, 'UNAUTHENTICATED'); const payload = verifyRefreshToken(token); const stored = await RefreshToken.findOne({ tokenHash: hashToken(token), userId: payload.sub, revokedAt: null }); if (!stored) throw new ApiError(401, 'UNAUTHENTICATED'); const user = await User.findOne({ _id: payload.sub, active: true, canAccessBackoffice: { $ne: false }, deletedAt: null }); if (!user) throw new ApiError(401, 'UNAUTHENTICATED'); await RefreshToken.updateOne({ _id: stored._id }, { revokedAt: new Date() }); await issueTokens(request, response, user); await writeAuditLog(request, 'AUTH_REFRESH_ROTATION', 'User', user._id.toString()); return sendSuccess(response, { refreshed: true }); }));
router.post('/logout', asyncHandler(async (request, response) => { const token = request.cookies.refreshToken; if (token) await RefreshToken.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { revokedAt: new Date() }); clearTokens(response); await writeAuditLog(request, 'AUTH_LOGOUT', 'User', request.user?.id); return sendSuccess(response, { loggedOut: true }); }));
router.post('/logout-all', requireAuth, asyncHandler(async (request, response) => { await RefreshToken.updateMany({ userId: request.user!.id, revokedAt: null }, { revokedAt: new Date() }); clearTokens(response); await writeAuditLog(request, 'AUTH_LOGOUT_ALL', 'User', request.user!.id); return sendSuccess(response, { loggedOut: true }); }));
router.get('/me', requireAuth, asyncHandler(async (request, response) => { const user = await User.findById(request.user!.id).lean(); return sendSuccess(response, { user: safeUser(user) }); }));
router.patch('/profile', requireAuth, validateRequest(profileSchema), asyncHandler(async (request, response) => {
  const email = normalizeUserEmail(request.body.email || undefined);
  if (email) {
    const exists = await User.exists({ _id: { $ne: request.user!.id }, normalizedEmail: email, deletedAt: null });
    if (exists) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS');
  }
  const update = {
    firstName: request.body.firstName,
    lastName: request.body.lastName,
    fullName: buildUserFullName(request.body.firstName, request.body.lastName),
    email,
    normalizedEmail: email,
    phone: request.body.phone || undefined,
    normalizedPhone: normalizeUserPhone(request.body.phone || undefined),
    documentType: request.body.documentType || undefined,
    documentNumber: request.body.documentNumber || undefined,
    avatarUrl: request.body.avatarUrl || undefined,
    updatedBy: request.user!.id
  };
  const user = await User.findOneAndUpdate({ _id: request.user!.id, deletedAt: null }, update, { new: true, runValidators: true }).lean();
  await writeAuditLog(request, 'AUTH_PROFILE_UPDATE', 'User', request.user!.id);
  return sendSuccess(response, { user: safeUser(user) }, 200, 'Perfil actualizado correctamente.');
}));
router.patch('/password', requireAuth, validateRequest(passwordSchema), asyncHandler(async (request, response) => {
  if (request.body.currentPassword === request.body.newPassword) throw new ApiError(400, 'PASSWORD_REUSED');
  const user = await User.findOne({ _id: request.user!.id, deletedAt: null }).select('+passwordHash');
  if (!user?.passwordHash || !(await verifyPassword(request.body.currentPassword, user.passwordHash))) throw new ApiError(401, 'INVALID_CURRENT_PASSWORD');
  user.passwordHash = await hashPassword(request.body.newPassword);
  user.mustChangePassword = false;
  user.lastPasswordChangeAt = new Date();
  user.failedLoginAttempts = 0;
  user.updatedBy = request.user!.id;
  user.lockedUntil = undefined;
  await user.save();
  await writeAuditLog(request, 'AUTH_PASSWORD_CHANGE', 'User', request.user!.id);
  return sendSuccess(response, { changed: true }, 200, 'Contraseña actualizada correctamente.');
}));
export default router;
