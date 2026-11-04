import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ updateMany: vi.fn() }));

vi.mock('../src/middlewares/auth', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'current-user' } as NonNullable<Request['user']>;
    next();
  },
}));
vi.mock('../src/modules/notifications/notification.model', () => ({
  Notification: { updateMany: mocks.updateMany },
}));

import notificationRoutes from '../src/modules/notifications/notification.routes';

const app = express();
app.use('/api/notifications', notificationRoutes);

describe('DELETE /api/notifications/all', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateMany.mockResolvedValue({ modifiedCount: 3 });
  });

  it('soft deletes only the signed-in user\'s visible notifications', async () => {
    const response = await request(app).delete('/api/notifications/all');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ deleted: 3 });
    expect(mocks.updateMany).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledWith(
      { userId: 'current-user', deletedAt: null, type: { $ne: 'daily_digest' } },
      { deletedAt: expect.any(Date), deletedBy: 'current-user', updatedBy: 'current-user' },
    );
  });
});
