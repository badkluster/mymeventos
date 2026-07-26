import { describe, expect, it } from 'vitest';
import { Permission, Role, RolePresets, hasPermission } from '../src';

describe('managerial module permissions', () => {
  it('keeps ADMIN unrestricted and STAFF outside the backoffice modules', () => {
    expect(hasPermission(Role.ADMIN, Permission.ANALYTICS_SETTINGS_MANAGE)).toBe(true);
    expect(hasPermission(Role.ADMIN, Permission.IMPORTS_EXECUTE)).toBe(true);
    expect(RolePresets[Role.STAFF]).not.toContain(Permission.DASHBOARD_VIEW);
    expect(RolePresets[Role.STAFF]).not.toContain(Permission.REPORTS_READ);
    expect(RolePresets[Role.STAFF]).not.toContain(Permission.EXPENSES_VIEW);
  });

  it('lets a salon manager operate production without granting global financial visibility', () => {
    expect(hasPermission(Role.SALON_MANAGER, Permission.PRODUCTION_VIEW)).toBe(true);
    expect(hasPermission(Role.SALON_MANAGER, Permission.PRODUCTION_UPDATE)).toBe(true);
    expect(hasPermission(Role.SALON_MANAGER, Permission.DASHBOARD_ALL_SALONS_VIEW)).toBe(false);
    expect(hasPermission(Role.SALON_MANAGER, Permission.DASHBOARD_FINANCIAL_VIEW)).toBe(false);
  });

  it('honors explicit grants and denials for non-admin roles', () => {
    expect(hasPermission(Role.STAFF, Permission.ANALYTICS_VIEW, [Permission.ANALYTICS_VIEW])).toBe(true);
    expect(hasPermission(
      Role.MANAGER,
      Permission.REPORTS_EXPORT,
      [],
      [Permission.REPORTS_EXPORT],
    )).toBe(false);
  });
});
