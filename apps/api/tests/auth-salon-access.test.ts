import { describe, expect, it } from 'vitest';
import { Role } from '@mym/shared';
import { accessibleSalonIds, canAccessSalon } from '../src/middlewares/auth';

function authUser(overrides: Partial<NonNullable<Express.Request['user']>> = {}): NonNullable<Express.Request['user']> {
  return {
    id: 'user-1',
    roles: [Role.SALON_MANAGER],
    permissionOverrides: [],
    permissionDeniedOverrides: [],
    salonIds: [],
    managedSalonIds: [],
    active: true,
    ...overrides
  };
}

describe('salon access scope', () => {
  it('treats ADMIN and MANAGER as global salon roles', () => {
    expect(canAccessSalon(authUser({ roles: [Role.ADMIN] }), 'salon-a')).toBe(true);
    expect(canAccessSalon(authUser({ roles: [Role.MANAGER] }), 'salon-a')).toBe(true);
  });

  it('keeps SALON_MANAGER explicitly scoped', () => {
    const user = authUser({ roles: [Role.SALON_MANAGER], salonIds: ['salon-a'] });
    expect(canAccessSalon(user, 'salon-a')).toBe(true);
    expect(canAccessSalon(user, 'salon-b')).toBe(false);
  });

  it('accepts managed salons as part of the effective scope without duplicates', () => {
    const user = authUser({ salonIds: ['salon-a'], managedSalonIds: ['salon-a', 'salon-b'] });
    expect(accessibleSalonIds(user)).toEqual(['salon-a', 'salon-b']);
    expect(canAccessSalon(user, 'salon-b')).toBe(true);
  });
});
