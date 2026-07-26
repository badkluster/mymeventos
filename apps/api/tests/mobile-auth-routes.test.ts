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
import { hashPassword } from '../src/utils/password';

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

    const response = await request(app).post('/api/mobile/auth/login').send({ username: 'waiter1', password: 'secret123', device });

    expect(response.status).toBe(200);
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
});
