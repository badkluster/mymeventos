import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  userExists: vi.fn(),
  userFindOneAndUpdate: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({
  User: {
    findOne: mocks.userFindOne,
    exists: mocks.userExists,
    findOneAndUpdate: mocks.userFindOneAndUpdate
  },
  buildUserFullName: (firstName?: string, lastName?: string) => [firstName, lastName].filter(Boolean).join(' '),
  normalizeUserEmail: (value?: string) => value?.trim().toLowerCase() || undefined,
  normalizeUserPhone: (value?: string) => value?.trim() || undefined
}));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));

import app from '../src/app';
import { generateAccessToken } from '../src/utils/tokens';

describe('backoffice profile route', () => {
  const userId = '507f1f77bcf86cd799439011';
  const currentUser = {
    _id: { toString: () => userId },
    active: true,
    canAccessBackoffice: true,
    roles: [Role.ADMIN],
    permissionOverrides: [],
    permissionDeniedOverrides: [],
    salonIds: [],
    managedSalonIds: [],
    email: 'admin@example.com',
    normalizedEmail: 'admin@example.com',
    avatarUrl: 'https://res.cloudinary.com/mym/image/upload/old-avatar.jpg'
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.userExists.mockResolvedValue({ _id: 'legacy-duplicate' });
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(currentUser) });
    mocks.userFindOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...currentUser, avatarUrl: undefined }) });
  });

  it('removes the avatar and does not reject an unchanged legacy email', async () => {
    const token = generateAccessToken({ sub: userId, username: 'admin' });
    const response = await request(app)
      .patch('/api/auth/profile')
      .set('Cookie', [`accessToken=${token}`])
      .send({
        firstName: 'Admin',
        lastName: 'M&M',
        email: 'admin@example.com',
        phone: '',
        documentType: '',
        documentNumber: '',
        avatarUrl: ''
      });

    expect(response.status).toBe(200);
    expect(mocks.userExists).not.toHaveBeenCalled();
    expect(mocks.userFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: userId, deletedAt: null },
      expect.objectContaining({
        $set: expect.objectContaining({ firstName: 'Admin', lastName: 'M&M', updatedBy: userId }),
        $unset: expect.objectContaining({ avatarUrl: 1 })
      }),
      expect.objectContaining({ new: true, runValidators: true })
    );
  });
});
