import type { RequestHandler } from 'express';
import { hasAnyPermission, hasPermission, Permission, Role } from '@mym/shared';
import { User } from '../modules/users/user.model';
import { Salon } from '../modules/salons/salon.model';
import { ApiError } from './errorHandler';
import { verifyAccessToken } from '../utils/tokens';

const ALL_SALONS_CACHE_TTL_MS = 60_000;
let allSalonIdsCache: { ids: string[]; expiresAt: number } = { ids: [], expiresAt: 0 };

const backofficeOperationalPermissions = new Set<Permission>([
  Permission.USERS_READ,
  Permission.SALONS_READ, Permission.SALONS_CREATE, Permission.SALONS_UPDATE, Permission.SALONS_DELETE,
  Permission.LEADS_READ, Permission.LEADS_CREATE, Permission.LEADS_UPDATE, Permission.LEADS_ASSIGN, Permission.LEADS_CONVERT,
  Permission.QUOTES_READ, Permission.QUOTES_CREATE, Permission.QUOTES_UPDATE, Permission.QUOTES_APPROVE, Permission.QUOTES_DELETE,
  Permission.CUSTOMERS_READ, Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_UPDATE, Permission.CUSTOMERS_DELETE,
  Permission.EVENTS_READ, Permission.EVENTS_CREATE, Permission.EVENTS_UPDATE, Permission.EVENTS_CANCEL,
  Permission.CONTRACTS_READ, Permission.CONTRACTS_CREATE, Permission.CONTRACTS_UPDATE, Permission.CONTRACTS_APPROVE, Permission.CONTRACTS_CANCEL, Permission.CONTRACTS_DELETE,
  Permission.PAYMENTS_READ, Permission.PAYMENTS_CREATE, Permission.PAYMENTS_UPDATE, Permission.PAYMENTS_APPROVE,
  Permission.SUPPLIERS_READ, Permission.SUPPLIERS_CREATE, Permission.SUPPLIERS_UPDATE, Permission.SUPPLIERS_DELETE,
  Permission.EXPENSES_VIEW, Permission.EXPENSES_CREATE, Permission.EXPENSES_UPDATE, Permission.EXPENSES_DELETE
]);

function hasBackofficeOperationalPermission(user: NonNullable<Express.Request['user']>, permission: Permission): boolean {
  return user.canAccessBackoffice
    && backofficeOperationalPermissions.has(permission)
    && !user.permissionDeniedOverrides.includes(permission);
}

async function getAllActiveSalonIds(): Promise<string[] | null> {
  try {
    const now = Date.now();
    if (allSalonIdsCache.expiresAt > now) return allSalonIdsCache.ids;
    // Keep test/migration environments from failing authentication when the Salon
    // model is intentionally not available. Production uses the normal model query.
    if (typeof Salon?.find !== 'function') return null;
    const salons = await Salon.find({ active: true, deletedAt: null }).select('_id').lean();
    const ids = salons.map((salon: any) => salon._id.toString());
    allSalonIdsCache = { ids, expiresAt: now + ALL_SALONS_CACHE_TTL_MS };
    return ids;
  } catch (error) {
    console.warn(JSON.stringify({ event: 'auth_global_salon_scope_lookup_failed', errorName: error instanceof Error ? error.name : 'UnknownError' }));
    return null;
  }
}

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
    let salonIds = (user.salonIds ?? []).map(String);
    const managedSalonIds = (user.managedSalonIds ?? []).map(String);
    const hasAllSalonAccess = roles.some((role) =>
      role === Role.ADMIN || hasPermission(role, Permission.DASHBOARD_ALL_SALONS_VIEW, permissionOverrides, permissionDeniedOverrides)
    );

    // CRM list routes filter through salonIds. Hydrate global visibility here so the
    // existing Manager/all-salons assignments keep accessing all operational modules.
    // A lookup failure deliberately keeps the stored visibility instead of rejecting
    // the request or returning a 500.
    if (hasAllSalonAccess && !roles.includes(Role.ADMIN)) {
      const allSalonIds = await getAllActiveSalonIds();
      if (allSalonIds) salonIds = allSalonIds;
    }

    finishTiming();
    request.authUser = { ...user, salonIds };
    request.user = { id: user._id.toString(), roles, permissionOverrides, permissionDeniedOverrides, salonIds, managedSalonIds, active: user.active, canAccessBackoffice: user.canAccessBackoffice !== false };
    return next();
  } catch (error) {
    finishTiming();
    return next(error);
  }
};
export const requirePermission = (permission: Permission): RequestHandler => (request, _response, next) => { const user = request.user; const allowed = Boolean(user && (user.roles.some((role) => hasPermission(role, permission, user.permissionOverrides, user.permissionDeniedOverrides)) || hasBackofficeOperationalPermission(user, permission))); if (!allowed) return next(new ApiError(403, 'FORBIDDEN')); next(); };
export const requireAnyPermission = (permissions: Permission[]): RequestHandler => (request, _response, next) => { const allowed = request.user?.roles.some((role) => hasAnyPermission(role, permissions, request.user?.permissionOverrides, request.user?.permissionDeniedOverrides)); if (!allowed) return next(new ApiError(403, 'FORBIDDEN')); next(); };
export const requireRole = (...roles: Role[]): RequestHandler => (request, _response, next) => request.user?.roles.some((role) => roles.includes(role)) ? next() : next(new ApiError(403, 'FORBIDDEN'));
export function accessibleSalonIds(user: NonNullable<Express.Request['user']>): string[] { return [...new Set([...(user.salonIds ?? []), ...(user.managedSalonIds ?? [])].map(String))]; }
export function userHasPermission(user: NonNullable<Express.Request['user']>, permission: Permission): boolean { return user.roles.some((role) => hasPermission(role, permission, user.permissionOverrides, user.permissionDeniedOverrides)); }
export function canAccessAllSalons(user: NonNullable<Express.Request['user']>): boolean { return user.roles.includes(Role.ADMIN) || userHasPermission(user, Permission.DASHBOARD_ALL_SALONS_VIEW); }
// Backoffice permissions unlock the operational action; salon visibility remains the
// data boundary. A user can only manage records from assigned/managed salons unless
// their role has explicit all-salons visibility.
export function canAccessSalon(user: NonNullable<Express.Request['user']>, salonId: string): boolean {
  return canAccessAllSalons(user) || accessibleSalonIds(user).includes(String(salonId));
}
// A relation can be either its stored ObjectId or a populated document returned by
// Mongoose. Scope checks must always compare the underlying ID, never the document's
// default string representation ("[object Object]").
export function referenceId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && (value as { _id?: unknown })._id) return String((value as { _id: unknown })._id);
  return String(value);
}
export const requireSalonScope = (source: 'params' | 'body' | 'query' = 'params', key = 'salonId'): RequestHandler => (request, _response, next) => { const salonId = String(request[source][key] ?? ''); if (!request.user || !salonId || !canAccessSalon(request.user, salonId)) return next(new ApiError(403, 'SALON_SCOPE_FORBIDDEN')); next(); };
