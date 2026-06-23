import { describe, it, expect } from 'vitest';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '../src/utils/permissionHelpers';
import { Role } from '../src/constants/roles';
import { Permission } from '../src/constants/permissions';

describe('Permission Helpers', () => {
  describe('hasPermission', () => {
    it('should grant everything to ADMIN', () => {
      expect(hasPermission(Role.ADMIN, Permission.SETTINGS_UPDATE)).toBe(true);
      expect(hasPermission(Role.ADMIN, Permission.USERS_DELETE)).toBe(true);
    });

    it('should grant based on RolePresets', () => {
      expect(hasPermission(Role.VALIDATOR, Permission.TICKETS_VALIDATE)).toBe(true);
      expect(hasPermission(Role.VALIDATOR, Permission.SETTINGS_UPDATE)).toBe(false);
    });

    it('should respect customOverrides if provided', () => {
      // Overrides replace the preset logic completely based on our implementation
      expect(hasPermission(Role.VALIDATOR, Permission.TICKETS_VALIDATE, [Permission.SETTINGS_UPDATE])).toBe(false);
      expect(hasPermission(Role.VALIDATOR, Permission.SETTINGS_UPDATE, [Permission.SETTINGS_UPDATE])).toBe(true);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true if user has at least one permission', () => {
      expect(hasAnyPermission(Role.SALES, [Permission.LEADS_CREATE, Permission.SETTINGS_UPDATE])).toBe(true);
    });

    it('should return false if user has none of the permissions', () => {
      expect(hasAnyPermission(Role.SALES, [Permission.SETTINGS_UPDATE, Permission.USERS_DELETE])).toBe(false);
    });
  });

  describe('hasAllPermissions', () => {
    it('should return true if user has all permissions', () => {
      expect(hasAllPermissions(Role.SALON_MANAGER, [Permission.LEADS_READ, Permission.EVENTS_CREATE])).toBe(true);
    });

    it('should return false if user is missing one permission', () => {
      expect(hasAllPermissions(Role.SALON_MANAGER, [Permission.LEADS_READ, Permission.SETTINGS_UPDATE])).toBe(false);
    });
  });
});
