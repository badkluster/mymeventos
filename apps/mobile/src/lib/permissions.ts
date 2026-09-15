import { hasPermission, Permission, type Role } from '@mym/shared';
import type { SessionUser } from '../types/user';

export function canValidateTickets(user: SessionUser | null): boolean {
  if (!user) return false;
  return user.roles.some((role) => hasPermission(
    role as Role,
    Permission.TICKETS_VALIDATE,
    (user.permissionOverrides ?? []) as Permission[],
    (user.permissionDeniedOverrides ?? []) as Permission[]
  ));
}
