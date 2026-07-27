import { describe, expect, it } from 'vitest';
import { Role, StaffEmploymentStatus, StaffSubrole } from '@mym/shared';
import { User } from '../src/modules/users/user.model';

function baseUser(overrides: Record<string, unknown> = {}) {
  const handle = `user-${Math.random().toString(36).slice(2)}`;
  return new User({
    username: handle,
    email: `${handle}@example.com`,
    firstName: 'Demo',
    lastName: 'User',
    roles: [Role.STAFF],
    ...overrides,
  });
}

describe('User staff model', () => {
  it('requires an email address and normalizes it', async () => {
    const user = baseUser({ email: '  DEMO@EXAMPLE.COM ' });
    await expect(user.validate()).resolves.toBeUndefined();
    expect(user.email).toBe('demo@example.com');
    expect(user.normalizedEmail).toBe('demo@example.com');
    await expect(baseUser({ email: undefined }).validate()).rejects.toThrow('email is required.');
  });

  it('accepts only valid main roles', async () => {
    await expect(baseUser({ roles: [Role.ADMIN] }).validate()).resolves.toBeUndefined();
    await expect(baseUser({ roles: ['INVALID_ROLE'] }).validate()).rejects.toThrow();
  });

  it('defaults STAFF to no backoffice access', async () => {
    const user = baseUser({ roles: [Role.STAFF] });
    await user.validate();
    expect(user.canAccessBackoffice).toBe(false);
  });

  it('allows ADMIN to access backoffice by default', async () => {
    const user = baseUser({ roles: [Role.ADMIN] });
    await user.validate();
    expect(user.canAccessBackoffice).toBe(true);
  });

  it('accepts valid staff profile subroles and rejects invalid ones', async () => {
    await expect(baseUser({ staffProfile: { staffSubroles: [StaffSubrole.WAITER], employmentStatus: StaffEmploymentStatus.ACTIVE } }).validate()).resolves.toBeUndefined();
    await expect(baseUser({ staffProfile: { staffSubroles: ['DRIVER'] } }).validate()).rejects.toThrow();
  });

  it('stores work schedule and payroll profile data', async () => {
    const user = baseUser({
      workSchedule: { type: 'EVENT_BASED', weeklyAvailability: [{ dayOfWeek: 5, enabled: true, startTime: '18:00', endTime: '23:00' }] },
      payrollProfile: { paymentType: 'PER_EVENT', eventRate: 25000, currency: 'ARS', active: true },
    });
    await user.validate();
    expect(user.workSchedule?.weeklyAvailability?.[0]?.dayOfWeek).toBe(5);
    expect(user.payrollProfile?.paymentType).toBe('PER_EVENT');
  });
});
