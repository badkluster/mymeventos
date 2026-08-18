import { describe, expect, it } from 'vitest';
import { Role } from '@mym/shared';
import { hashPassword, verifyPassword } from '../src/utils/password';
import { generateAccessToken, generateRefreshToken, hashToken, verifyAccessToken, verifyRefreshToken } from '../src/utils/tokens';
import { canAccessSalon } from '../src/middlewares/auth';

describe('security utilities', () => {
  it('hashes and verifies passwords without exposing plaintext', async () => {
    const hash = await hashPassword('a-long-test-password');
    expect(hash).not.toContain('a-long-test-password');
    await expect(verifyPassword('a-long-test-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('incorrect-password', hash)).resolves.toBe(false);
  });

  it('generates independently verifiable access and refresh tokens', () => {
    const payload = { sub: '507f1f77bcf86cd799439011', username: 'admin' };
    expect(verifyAccessToken(generateAccessToken(payload))).toMatchObject(payload);
    expect(verifyRefreshToken(generateRefreshToken(payload))).toMatchObject(payload);
    expect(hashToken('token')).toHaveLength(64);
  });

  it('enforces assigned salon scope while ADMIN remains global', () => {
    expect(canAccessSalon({ id: '1', roles: [Role.STAFF], permissionOverrides: [], salonIds: ['salon-a'], active: true }, 'salon-a')).toBe(true);
    expect(canAccessSalon({ id: '1', roles: [Role.SALON_MANAGER], permissionOverrides: [], salonIds: [], managedSalonIds: ['salon-b'], active: true }, 'salon-b')).toBe(true);
    expect(canAccessSalon({ id: '1', roles: [Role.STAFF], permissionOverrides: [], salonIds: ['salon-a'], active: true }, 'salon-b')).toBe(false);
    expect(canAccessSalon({ id: '1', roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }, 'salon-b')).toBe(true);
  });
});
