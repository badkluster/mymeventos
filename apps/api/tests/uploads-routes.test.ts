import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadBuffer: vi.fn(),
  deleteAsset: vi.fn()
}));

vi.mock('../src/middlewares/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/middlewares/auth')>();
  return {
    ...actual,
    requireAuth: (req: any, _res: any, next: () => void) => {
      req.user = { id: '507f1f77bcf86cd799439011', roles: ['STAFF'], permissionOverrides: [], permissionDeniedOverrides: [], salonIds: [], managedSalonIds: [], active: true };
      next();
    }
  };
});

vi.mock('../src/modules/uploads/cloudinary.service', () => ({
  uploadBuffer: mocks.uploadBuffer,
  deleteAsset: mocks.deleteAsset
}));

import app from '../src/app';

describe('uploads routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadBuffer.mockResolvedValue({ publicId: 'mym-eventos/users/507f1f77bcf86cd799439011/avatar', url: 'https://example.test/avatar.jpg', secureUrl: 'https://example.test/avatar.jpg', resourceType: 'image', bytes: 1 });
  });

  it('ignores a client-selected folder for a personal avatar upload', async () => {
    const response = await request(app)
      .post('/api/uploads')
      .field('context', 'users')
      .field('folder', 'digital-tickets/private')
      .attach('file', Buffer.from('image'), { filename: 'avatar.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(201);
    expect(mocks.uploadBuffer).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ folder: 'mym-eventos/users/507f1f77bcf86cd799439011' }));
  });

  it('does not let a user delete an asset outside their own avatar folder', async () => {
    const response = await request(app).delete('/api/uploads?context=users&publicId=mym-eventos/users/another-user/avatar&resourceType=image');

    expect(response.status).toBe(403);
    expect(mocks.deleteAsset).not.toHaveBeenCalled();
  });
});
