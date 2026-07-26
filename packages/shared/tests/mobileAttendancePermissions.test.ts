import { describe, it, expect } from 'vitest';
import { hasPermission } from '../src/utils/permissionHelpers';
import { Role } from '../src/constants/roles';
import { Permission } from '../src/constants/permissions';

describe('Mobile staff app permissions', () => {
  it('grants STAFF mobile access and self-service attendance permissions out of the box', () => {
    for (const permission of [
      Permission.MOBILE_ACCESS,
      Permission.ATTENDANCE_CLOCK,
      Permission.ATTENDANCE_HISTORY_SELF,
      Permission.ATTENDANCE_SCHEDULE_SELF,
      Permission.ATTENDANCE_INCIDENT_CREATE,
      Permission.ATTENDANCE_ADJUSTMENT_REQUEST,
      Permission.PROFILE_VIEW_SELF,
      Permission.PROFILE_UPDATE_SELF,
      Permission.PROFILE_AVATAR_UPDATE,
      Permission.SECURITY_PASSWORD_CHANGE
    ]) {
      expect(hasPermission(Role.STAFF, permission)).toBe(true);
    }
  });

  it('does not grant STAFF admin-only attendance permissions', () => {
    expect(hasPermission(Role.STAFF, Permission.ATTENDANCE_READ)).toBe(false);
    expect(hasPermission(Role.STAFF, Permission.ATTENDANCE_MANAGE)).toBe(false);
    expect(hasPermission(Role.STAFF, Permission.ATTENDANCE_SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(Role.STAFF, Permission.MOBILE_DEVICES_MANAGE)).toBe(false);
  });

  it('mobile access is NOT tied exclusively to the STAFF role — MANAGER/SALON_MANAGER can be granted it via overrides', () => {
    expect(hasPermission(Role.MANAGER, Permission.MOBILE_ACCESS)).toBe(false);
    expect(hasPermission(Role.MANAGER, Permission.MOBILE_ACCESS, [Permission.MOBILE_ACCESS])).toBe(true);
  });

  it('grants MANAGER and SALON_MANAGER attendance oversight permissions', () => {
    expect(hasPermission(Role.MANAGER, Permission.ATTENDANCE_READ)).toBe(true);
    expect(hasPermission(Role.MANAGER, Permission.ATTENDANCE_MANAGE)).toBe(true);
    expect(hasPermission(Role.MANAGER, Permission.ATTENDANCE_SETTINGS_MANAGE)).toBe(true);
    expect(hasPermission(Role.SALON_MANAGER, Permission.ATTENDANCE_READ)).toBe(true);
    expect(hasPermission(Role.SALON_MANAGER, Permission.ATTENDANCE_MANAGE)).toBe(true);
  });

  it('a denied override blocks mobile access even for STAFF', () => {
    expect(hasPermission(Role.STAFF, Permission.MOBILE_ACCESS, [], [Permission.MOBILE_ACCESS])).toBe(false);
  });

  it('ADMIN has every mobile/attendance permission', () => {
    expect(hasPermission(Role.ADMIN, Permission.ATTENDANCE_SETTINGS_MANAGE)).toBe(true);
    expect(hasPermission(Role.ADMIN, Permission.MOBILE_DEVICES_MANAGE)).toBe(true);
  });
});
