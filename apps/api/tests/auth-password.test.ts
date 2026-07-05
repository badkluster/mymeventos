import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
  save: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne, updateOne: mocks.userUpdateOne } }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));

import app from '../src/app';
import { hashPassword, verifyPassword } from '../src/utils/password';
import { generateAccessToken } from '../src/utils/tokens';

describe('auth password route', () => {
  beforeEach(() => {
    mocks.userFindOne.mockReset();
    mocks.userUpdateOne.mockReset();
    mocks.save.mockReset();
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.userUpdateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  });

  it('changes password with a targeted update when the user has legacy roles', async () => {
    const userId = '507f1f77bcf86cd799439011';
    const currentPassword = 'current-password';
    const newPassword = 'new-password';
    const passwordHash = await hashPassword(currentPassword);

    mocks.userFindOne.mockImplementation((query) => {
      if (query.active === true) {
        return {
          lean: vi.fn().mockResolvedValue({
            _id: { toString: () => userId },
            roles: [Role.ADMIN, Role.MANAGER, 'ACCOUNTING', 'SALES', 'OPERATIONS', 'VALIDATOR'],
            permissionOverrides: [],
            permissionDeniedOverrides: [],
            salonIds: [],
            managedSalonIds: [],
            active: true
          })
        };
      }

      return {
        select: vi.fn().mockResolvedValue({
          _id: userId,
          passwordHash,
          save: mocks.save
        })
      };
    });

    const accessToken = generateAccessToken({ sub: userId, username: 'admin' });
    const response = await request(app)
      .patch('/api/auth/password')
      .set('Cookie', [`accessToken=${accessToken}`])
      .send({ currentPassword, newPassword });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ changed: true });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { _id: userId, deletedAt: null },
      {
        $set: expect.objectContaining({
          mustChangePassword: false,
          failedLoginAttempts: 0,
          updatedBy: userId
        }),
        $unset: { lockedUntil: 1 }
      }
    );

    const update = mocks.userUpdateOne.mock.calls[0][1];
    await expect(verifyPassword(newPassword, update.$set.passwordHash)).resolves.toBe(true);
  });
});
