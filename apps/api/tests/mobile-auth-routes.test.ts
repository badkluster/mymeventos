import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { Role } from '@mym/shared';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
  refreshTokenCreate: vi.fn(),
  refreshTokenFindOne: vi.fn(),
  refreshTokenUpdateOne: vi.fn(),
  refreshTokenUpdateMany: vi.fn(),
  mobileDeviceFindOneAndUpdate: vi.fn(),
  writeAuditLog: vi.fn(),
  sendEmail: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({
  User: { findOne: mocks.userFindOne, updateOne: mocks.userUpdateOne },
  buildUserFullName: (first?: string, last?: string) => [first, last].filter(Boolean).join(' '),
  normalizeUserEmail: (value?: string) => value?.trim().toLowerCase() || undefined,
  normalizeUserPhone: (value?: string) => value
}));
vi.mock('../src/modules/auth/refreshToken.model', () => ({
  RefreshToken: { create: mocks.refreshTokenCreate, findOne: mocks.refreshTokenFindOne, updateOne: mocks.refreshTokenUpdateOne, updateMany: mocks.refreshTokenUpdateMany }
}));
vi.mock('../src/modules/mobile/mobileDevice.model', () => ({ MobileDevice: { findOneAndUpdate: mocks.mobileDeviceFindOneAndUpdate, find: vi.fn(), updateOne: vi.fn() } }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/email/email.service', () => ({ sendEmail: mocks.sendEmail }));

import app from '../src/app';
import { hashPassword, verifyPassword } from '../src/utils/password';
import { hashToken } from '../src/utils/tokens';

const device = { installationId: 'device-1', platform: 'android' as const };

describe('mobile auth routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.userUpdateOne.mockResolvedValue({});
    mocks.refreshTokenCreate.mockResolvedValue({});
    mocks.mobileDeviceFindOneAndUpdate.mockResolvedValue({});
  });

  it('denies login for a role that was not granted mobile.access', async () => {
    const passwordHash = await hashPassword('secret123');
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(), username: 'manager1', passwordHash, active: true,
        roles: [Role.SALON_MANAGER], permissionOverrides: [], permissionDeniedOverrides: []
      })
    });

    const response = await request(app).post('/api/mobile/auth/login').send({ username: 'manager1', password: 'secret123', device });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('MOBILE_ACCESS_DENIED');
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('logs a STAFF user in and issues bearer tokens, registering the device', async () => {
    const passwordHash = await hashPassword('secret123');
    const userId = new Types.ObjectId();
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: userId, username: 'waiter1', passwordHash, active: true,
        roles: [Role.STAFF], permissionOverrides: [], permissionDeniedOverrides: [],
        attendanceConfig: { canUseMobileApp: true },
        toObject: () => ({ _id: userId, username: 'waiter1' })
      })
    });

    const response = await request(app).post('/api/mobile/auth/login').send({ username: 'WAITER@EXAMPLE.COM', password: 'secret123', device });

    expect(response.status).toBe(200);
    expect(mocks.userFindOne).toHaveBeenCalledWith({
      deletedAt: null,
      $or: [{ username: 'waiter@example.com' }, { normalizedEmail: 'waiter@example.com' }]
    });
    expect(typeof response.body.data.accessToken).toBe('string');
    expect(typeof response.body.data.refreshToken).toBe('string');
    expect(mocks.mobileDeviceFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: userId.toString(), installationId: device.installationId },
      expect.any(Object),
      expect.objectContaining({ upsert: true })
    );
    expect(mocks.refreshTokenCreate).toHaveBeenCalledWith(expect.objectContaining({ channel: 'mobile', installationId: device.installationId }));
  });

  it('rejects an incorrect password without leaking whether the account has mobile access', async () => {
    const passwordHash = await hashPassword('secret123');
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(), username: 'waiter1', passwordHash, active: true,
        roles: [Role.STAFF], permissionOverrides: [], permissionDeniedOverrides: []
      })
    });

    const response = await request(app).post('/api/mobile/auth/login').send({ username: 'waiter1', password: 'wrong-password', device });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects login for an inactive account even with the right password', async () => {
    const passwordHash = await hashPassword('secret123');
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(), username: 'waiter1', passwordHash, active: false,
        roles: [Role.STAFF], permissionOverrides: [], permissionDeniedOverrides: []
      })
    });

    const response = await request(app).post('/api/mobile/auth/login').send({ username: 'waiter1', password: 'secret123', device });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('MOBILE_ACCESS_DENIED');
  });

  it('denies a STAFF user whose attendanceConfig.canUseMobileApp is still off, even though the role grants mobile.access', async () => {
    const passwordHash = await hashPassword('secret123');
    mocks.userFindOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(), username: 'waiter1', passwordHash, active: true,
        roles: [Role.STAFF], permissionOverrides: [], permissionDeniedOverrides: [],
        attendanceConfig: { canUseMobileApp: false }
      })
    });

    const response = await request(app).post('/api/mobile/auth/login').send({ username: 'waiter1', password: 'secret123', device });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('MOBILE_ACCESS_DENIED');
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('sends a six-digit password reset code to an eligible mobile user without exposing the stored token', async () => {
    const userId = new Types.ObjectId();
    mocks.userFindOne.mockResolvedValue({
      _id: userId, username: 'waiter1', email: 'waiter@example.com', active: true,
      roles: [Role.STAFF], permissionOverrides: [], permissionDeniedOverrides: [], attendanceConfig: { canUseMobileApp: true }
    });
    mocks.sendEmail.mockResolvedValue(true);

    const response = await request(app).post('/api/mobile/auth/forgot-password').send({ username: 'waiter@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ requested: true });
    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { _id: userId },
      expect.objectContaining({
        passwordResetTokenHash: expect.any(String),
        passwordResetExpiresAt: expect.any(Date),
        passwordResetAttempts: 0
      })
    );
    const email = mocks.sendEmail.mock.calls[0][0];
    const code = email.text.match(/código para restablecer la contraseña es: (\d{6})/i)?.[1];
    expect(code).toMatch(/^\d{6}$/);
    expect(email.text).toContain(`mymeventos://reset-password?username=waiter1&token=${code}`);
    expect(email.html).toContain(code);
    expect(mocks.userUpdateOne.mock.calls[0][1].passwordResetTokenHash).toBe(hashToken(code!));
  });

  it('keeps the password reset request generic when the account is not eligible', async () => {
    mocks.userFindOne.mockResolvedValue(null);

    const response = await request(app).post('/api/mobile/auth/forgot-password').send({ username: 'unknown@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ requested: true });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.userUpdateOne).not.toHaveBeenCalled();
  });

  it('resets the password with the matching user and code, then revokes every session', async () => {
    const userId = new Types.ObjectId();
    mocks.userFindOne.mockResolvedValue({
      _id: userId, username: 'waiter1', passwordResetTokenHash: hashToken('123456'), passwordResetAttempts: 0
    });

    const response = await request(app)
      .post('/api/mobile/auth/reset-password')
      .send({ username: 'waiter1', token: '123456', newPassword: 'new-secret123' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ reset: true });
    expect(mocks.userFindOne).toHaveBeenCalledWith(expect.objectContaining({
      deletedAt: null,
      $or: [{ username: 'waiter1' }, { normalizedEmail: 'waiter1' }]
    }));
    const update = mocks.userUpdateOne.mock.calls[0][1];
    await expect(verifyPassword('new-secret123', update.$set.passwordHash)).resolves.toBe(true);
    expect(update.$unset).toEqual(expect.objectContaining({ passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetAttempts: 1 }));
    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledWith({ userId, revokedAt: null }, { revokedAt: expect.any(Date) });
  });

  it('counts invalid reset-code attempts and never changes the password', async () => {
    const userId = new Types.ObjectId();
    mocks.userFindOne.mockResolvedValue({
      _id: userId, username: 'waiter1', passwordResetTokenHash: hashToken('123456'), passwordResetAttempts: 0
    });

    const response = await request(app)
      .post('/api/mobile/auth/reset-password')
      .send({ username: 'waiter1', token: '654321', newPassword: 'new-secret123' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PASSWORD_RESET_TOKEN_INVALID');
    expect(mocks.userUpdateOne).toHaveBeenCalledWith({ _id: userId }, { $inc: { passwordResetAttempts: 1 } });
    expect(mocks.refreshTokenUpdateMany).not.toHaveBeenCalled();
  });

  it('limits repeated mobile login attempts from the same IP', async () => {
    // This test is intentionally last: the rate limiter is process-local and the
    // preceding login tests share Supertest's loopback IP.
    mocks.userFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });

    let response: request.Response | undefined;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      response = await request(app)
        .post('/api/mobile/auth/login')
        .send({ username: `unknown-${attempt}`, password: 'invalid-password', device });
      if (response.status === 429) break;
    }

    expect(response?.status).toBe(429);
    expect(response?.body.error.code).toBe('PUBLIC_RATE_LIMITED');
    expect(response?.headers['retry-after']).toBeDefined();
  });
});
