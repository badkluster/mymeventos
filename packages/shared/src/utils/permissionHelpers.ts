import { Permission, RolePresets } from '../constants/permissions';
import { Role } from '../constants/roles';

export function hasPermission(
  userRole: Role, 
  permission: Permission, 
  customOverrides?: Permission[],
  deniedOverrides?: Permission[]
): boolean {
  if (userRole === Role.ADMIN) return true;
  if (deniedOverrides?.includes(permission)) return false;

  const preset = RolePresets[userRole] || [];
  return preset.includes(permission) || Boolean(customOverrides?.includes(permission));
}

export function hasAnyPermission(
  userRole: Role,
  permissions: Permission[],
  customOverrides?: Permission[],
  deniedOverrides?: Permission[]
): boolean {
  return permissions.some(perm => hasPermission(userRole, perm, customOverrides, deniedOverrides));
}

export function hasAllPermissions(
  userRole: Role,
  permissions: Permission[],
  customOverrides?: Permission[],
  deniedOverrides?: Permission[]
): boolean {
  return permissions.every(perm => hasPermission(userRole, perm, customOverrides, deniedOverrides));
}
