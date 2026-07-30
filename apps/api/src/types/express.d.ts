import type { Permission, Role } from '@mym/shared';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; roles: Role[]; permissionOverrides: Permission[]; permissionDeniedOverrides: Permission[]; salonIds: string[]; managedSalonIds: string[]; active: boolean };
      authUser?: Record<string, any>;
      rawBody?: Buffer;
    }
  }
}
export {};
