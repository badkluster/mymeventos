import { Permission, RolePresets } from '../constants/permissions';
import { Role } from '../constants/roles';

export function hasPermission(
  userRole: Role, 
  permission: Permission, 
  customOverrides?: Permission[]
): boolean {
  if (userRole === Role.ADMIN) return true;
  
  if (customOverrides) {
    return customOverrides.includes(permission);
  }

  const preset = RolePresets[userRole] || [];
  return preset.includes(permission);
}

export function hasAnyPermission(
  userRole: Role,
  permissions: Permission[],
  customOverrides?: Permission[]
): boolean {
  return permissions.some(perm => hasPermission(userRole, perm, customOverrides));
}

export function hasAllPermissions(
  userRole: Role,
  permissions: Permission[],
  customOverrides?: Permission[]
): boolean {
  return permissions.every(perm => hasPermission(userRole, perm, customOverrides));
}
