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

export const requireAuth: RequestHandler = async (request, response, next) => {
  const startedAt = Date.now();
  const finishTiming = () => { response.locals.authMs = Date.now() - startedAt; };

  let token: string | undefined;
  let viaCookie = false;
  let payload: ReturnType<typeof verifyAccessToken>;

  // Token/cookie failures are authentication failures. Database failures are not: keep
  // them separate so a transient Atlas problem returns 503 instead of a misleading 401.
  try {
    ({ token, viaCookie } = extractAccessToken(request));
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED');
    payload = verifyAccessToken(token);
  } catch {
    finishTiming();
    return next(new ApiError(401, 'UNAUTHENTICATED'));
  }

  try {
    const filter: Record<string, unknown> = { _id: payload.sub, active: true, deletedAt: null };
    if (viaCookie) filter.canAccessBackoffice = { $ne: false };
    const userQuery = User.findOne(filter);
    const projectedUserQuery = typeof userQuery.select === 'function'
      ? userQuery.select('_id username email phone documentType documentNumber avatarUrl firstName lastName fullName roles permissionOverrides permissionDeniedOverrides salonIds managedSalonIds active canAccessBackoffice')
      : userQuery;
    const user: any = await projectedUserQuery.lean();
    if (!user) {
      finishTiming();
      return next(new ApiError(401, 'UNAUTHENTICATED'));
    }

    const roles = (user.roles ?? []) as Role[];
    const permissionOverrides = user.permissionOverrides ?? [];
    const permissionDeniedOverrides = user.permissionDeniedOverrides ?? [];
    const salonIds = (user.salonIds ?? []).map(String);
    const managedSalonIds = (user.managedSalonIds ?? []).map(String);

    // Authentication must only load the authenticated user's assigned visibility.
    // Global access is resolved by canAccessAllSalons() in scope checks, so a transient
    // Salon query can never turn a valid request into a 500 or modify stored visibility.

    finishTiming();
    request.authUser = { ...user, salonIds };
    request.user = { id: user._id.toString(), roles, permissionOverrides, permissionDeniedOverrides, salonIds, managedSalonIds, active: user.active };
    return next();
  } catch (error) {
    finishTiming();
    return next(error);
  }
};
export const requirePermission = (permission: Permission): RequestHandler => (request, _response, next) => { const allowed = request.user?.roles.some((role) => hasPermission(role, permission, request.user?.permissionOverrides, request.user?.permissionDeniedOverrides)); if (!allowed) return next(new ApiError(403, 'FORBIDDEN')); next(); };
export const requireAnyPermission = (permissions: Permission[]): RequestHandler => (request, _response, next) => { const allowed = request.user?.roles.some((role) => hasAnyPermission(role, permissions, request.user?.permissionOverrides, request.user?.permissionDeniedOverrides)); if (!allowed) return next(new ApiError(403, 'FORBIDDEN')); next(); };
export const requireRole = (...roles: Role[]): RequestHandler => (request, _response, next) => request.user?.roles.some((role) => roles.includes(role)) ? next() : next(new ApiError(403, 'FORBIDDEN'));
export function accessibleSalonIds(user: NonNullable<Express.Request['user']>): string[] { return [...new Set([...(user.salonIds ?? []), ...(user.managedSalonIds ?? [])].map(String))]; }
export function userHasPermission(user: NonNullable<Express.Request['user']>, permission: Permission): boolean { return user.roles.some((role) => hasPermission(role, permission, user.permissionOverrides, user.permissionDeniedOverrides)); }
export function canAccessAllSalons(user: NonNullable<Express.Request['user']>): boolean { return user.roles.includes(Role.ADMIN) || userHasPermission(user, Permission.DASHBOARD_ALL_SALONS_VIEW); }
// Salon access is explicit unless the account has the dedicated multi-salon permission.
// The Manager role inherits that permission through its preset, while a Salon Manager
// only becomes global when an administrator explicitly grants "Ver todos los salones".
export function canAccessSalon(user: NonNullable<Express.Request['user']>, salonId: string): boolean { return canAccessAllSalons(user) || accessibleSalonIds(user).includes(String(salonId)); }
// A relation can be either its stored ObjectId or a populated document returned by
// Mongoose. Scope checks must always compare the underlying ID, never the document's
// default string representation ("[object Object]").
export function referenceId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && (value as { _id?: unknown })._id) return String((value as { _id: unknown })._id);
  return String(value);
}
export const requireSalonScope = (source: 'params' | 'body' | 'query' = 'params', key = 'salonId'): RequestHandler => (request, _response, next) => { const salonId = String(request[source][key] ?? ''); if (!request.user || !salonId || !canAccessSalon(request.user, salonId)) return next(new ApiError(403, 'SALON_SCOPE_FORBIDDEN')); next(); };
