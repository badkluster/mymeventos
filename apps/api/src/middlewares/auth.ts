import type { RequestHandler } from 'express';
import { hasAnyPermission, hasPermission, Permission, Role } from '@mym/shared';
import { User } from '../modules/users/user.model';
import { ApiError } from './errorHandler';
import { verifyAccessToken } from '../utils/tokens';

// Web (backoffice) auth reads the httpOnly `accessToken` cookie and keeps the exact
// pre-existing `canAccessBackoffice !== false` gate. The mobile staff app authenticates
// via `Authorization: Bearer <token>` instead (native clients don't share the browser
// cookie jar) and is NOT gated by `canAccessBackoffice` — mobile access is instead
// granted through the granular `Permission.MOBILE_ACCESS` permission, checked at
// /api/mobile/auth/login time and re-checked on every mobile-only route. See
// docs/MOBILE_AUTHENTICATION.md.
function extractAccessToken(request: Parameters<RequestHandler>[0]): { token?: string; viaCookie: boolean } {
  const cookieToken = request.cookies?.accessToken;
  if (cookieToken) return { token: cookieToken, viaCookie: true };
  const header = request.get('authorization');
  if (header?.startsWith('Bearer ')) return { token: header.slice(7).trim(), viaCookie: false };
  return { viaCookie: false };
}

export const requireAuth: RequestHandler = async (request, _response, next) => {
  try {
    const { token, viaCookie } = extractAccessToken(request);
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED');
    const payload = verifyAccessToken(token);
    const filter: Record<string, unknown> = { _id: payload.sub, active: true, deletedAt: null };
    if (viaCookie) filter.canAccessBackoffice = { $ne: false };
    const userQuery = User.findOne(filter);
    const projectedUserQuery = typeof userQuery.select === 'function'
      ? userQuery.select('_id username email phone documentType documentNumber avatarUrl firstName lastName fullName roles permissionOverrides permissionDeniedOverrides salonIds managedSalonIds active canAccessBackoffice')
      : userQuery;
    const user: any = await projectedUserQuery.lean();
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED');
    request.authUser = user;
    request.user = { id: user._id.toString(), roles: user.roles, permissionOverrides: user.permissionOverrides ?? [], permissionDeniedOverrides: user.permissionDeniedOverrides ?? [], salonIds: (user.salonIds ?? []).map(String), managedSalonIds: (user.managedSalonIds ?? []).map(String), active: user.active };
    next();
  } catch { next(new ApiError(401, 'UNAUTHENTICATED')); }
};
export const requirePermission = (permission: Permission): RequestHandler => (request, _response, next) => { const allowed = request.user?.roles.some((role) => hasPermission(role, permission, request.user?.permissionOverrides, request.user?.permissionDeniedOverrides)); if (!allowed) return next(new ApiError(403, 'FORBIDDEN')); next(); };
export const requireAnyPermission = (permissions: Permission[]): RequestHandler => (request, _response, next) => { const allowed = request.user?.roles.some((role) => hasAnyPermission(role, permissions, request.user?.permissionOverrides, request.user?.permissionDeniedOverrides)); if (!allowed) return next(new ApiError(403, 'FORBIDDEN')); next(); };
export const requireRole = (...roles: Role[]): RequestHandler => (request, _response, next) => request.user?.roles.some((role) => roles.includes(role)) ? next() : next(new ApiError(403, 'FORBIDDEN'));
export function accessibleSalonIds(user: NonNullable<Express.Request['user']>): string[] { return [...new Set([...(user.salonIds ?? []), ...(user.managedSalonIds ?? [])].map(String))]; }
export function userHasPermission(user: NonNullable<Express.Request['user']>, permission: Permission): boolean { return user.roles.some((role) => hasPermission(role, permission, user.permissionOverrides, user.permissionDeniedOverrides)); }
export function canAccessSalon(user: NonNullable<Express.Request['user']>, salonId: string): boolean { return user.roles.includes(Role.ADMIN) || accessibleSalonIds(user).includes(String(salonId)); }
export const requireSalonScope = (source: 'params' | 'body' | 'query' = 'params', key = 'salonId'): RequestHandler => (request, _response, next) => { const salonId = String(request[source][key] ?? ''); if (!request.user || !salonId || !canAccessSalon(request.user, salonId)) return next(new ApiError(403, 'SALON_SCOPE_FORBIDDEN')); next(); };
