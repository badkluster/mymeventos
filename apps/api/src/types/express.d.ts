import type { Permission, Role } from '@mym/shared';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; roles: Role[]; permissionOverrides: Permission[]; salonIds: string[]; active: boolean };
    }
  }
}
export {};
