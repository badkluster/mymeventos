import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Permission, Role } from '@mym/shared';

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

describe('mobile profile routes', () => {
  const userId = '507f1f77bcf86cd799439011';
  const authenticatedUser = {
    _id: { toString: () => userId },
    active: true,
    roles: [Role.STAFF],
    permissionOverrides: [],
    permissionDeniedOverrides: [],
    salonIds: [],
    managedSalonIds: []
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.userExists.mockResolvedValue(null);
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(authenticatedUser) });
    mocks.userFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        ...authenticatedUser,
        firstName: 'Juan',
        lastName: 'Caballo',
        documentNumber: '32123456',
        birthDate: new Date('1990-08-24T12:00:00.000Z'),
        address: 'Calle 12 345'
      })
    });
  });

  it('updates the complete self-service personal profile with a server-validated birth date', async () => {
    const token = generateAccessToken({ sub: userId, username: 'juanc' });

    const response = await request(app)
      .patch('/api/mobile/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Juan',
        lastName: 'Caballo',
        email: 'juan@example.com',
        phone: '2214205710',
        documentType: 'DNI',
        documentNumber: '32123456',
        birthDate: '1990-08-24',
        address: 'Calle 12 345',
        emergencyContactName: 'María Caballo',
        emergencyContactPhone: '2215550101'
      });

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      documentNumber: '32123456',
      address: 'Calle 12 345'
    });
    expect(mocks.userFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: userId, deletedAt: null },
      expect.objectContaining({
        $set: expect.objectContaining({
          fullName: 'Juan Caballo',
          documentNumber: '32123456',
          address: 'Calle 12 345',
          emergencyContactName: 'María Caballo',
          birthDate: new Date('1990-08-24T12:00:00.000Z')
        })
      }),
      expect.objectContaining({ new: true, runValidators: true })
    );
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.anything(), 'MOBILE_PROFILE_UPDATE', 'User', userId);
  });

  it('rejects an invalid birth date before updating the profile', async () => {
    const token = generateAccessToken({ sub: userId, username: 'juanc' });

    const response = await request(app)
      .patch('/api/mobile/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Juan', lastName: 'Caballo', birthDate: '1990-02-30' });

    expect(response.status).toBe(400);
    expect(mocks.userFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows saving other profile fields when an unchanged legacy email is duplicated', async () => {
    const token = generateAccessToken({ sub: userId, username: 'juanc' });
    const userWithLegacyEmail = { ...authenticatedUser, email: 'juan@example.com', normalizedEmail: 'juan@example.com' };
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(userWithLegacyEmail) });
    mocks.userExists.mockResolvedValue({ _id: 'another-user' });

    const response = await request(app)
      .patch('/api/mobile/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Juan', lastName: 'Caballo', email: 'juan@example.com', phone: '2214205710' });

    expect(response.status).toBe(200);
    expect(mocks.userExists).not.toHaveBeenCalled();
    expect(mocks.userFindOneAndUpdate).toHaveBeenCalled();
  });

  it('explains when the user changes their email to one already used by someone else', async () => {
    const token = generateAccessToken({ sub: userId, username: 'juanc' });
    const currentUser = { ...authenticatedUser, email: 'juan@example.com', normalizedEmail: 'juan@example.com' };
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(currentUser) });
    mocks.userExists.mockResolvedValue({ _id: 'another-user' });

    const response = await request(app)
      .patch('/api/mobile/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Juan', lastName: 'Caballo', email: 'otro.usuario@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({ code: 'EMAIL_ALREADY_EXISTS', message: 'El correo electrónico ya está asociado a otro usuario.' });
    expect(mocks.userFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('lets a mobile user who can edit their profile update their own avatar', async () => {
    const token = generateAccessToken({ sub: userId, username: 'juanc' });
    const managerWithMobileProfileAccess = {
      ...authenticatedUser,
      roles: [Role.MANAGER],
      permissionOverrides: [Permission.PROFILE_UPDATE_SELF]
    };
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(managerWithMobileProfileAccess) });

    const response = await request(app)
      .post('/api/mobile/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'https://res.cloudinary.com/mym/image/upload/avatar.jpg' });

    expect(response.status).toBe(200);
    expect(mocks.userFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: userId, deletedAt: null },
      expect.objectContaining({ avatarUrl: 'https://res.cloudinary.com/mym/image/upload/avatar.jpg', updatedBy: userId }),
      expect.objectContaining({ new: true })
    );
  });
});
