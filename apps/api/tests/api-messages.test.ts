import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const userMocks = vi.hoisted(() => ({ findOne: vi.fn() }));
vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: userMocks.findOne } }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import app from '../src/app';

describe('Spanish API messages', () => {
  beforeEach(() => userMocks.findOne.mockReset());

  it('returns a Spanish message for invalid login credentials', async () => {
    userMocks.findOne.mockReturnValue({ select: vi.fn().mockResolvedValue(null) });
    const response = await request(app).post('/api/auth/login').send({ username: 'ADMIN@EXAMPLE.COM', password: 'invalid-password' });
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña inválidos.' });
    expect(userMocks.findOne).toHaveBeenCalledWith({
      deletedAt: null,
      $or: [{ username: 'admin@example.com' }, { normalizedEmail: 'admin@example.com' }]
    });
  });

  it('returns a Spanish message for unauthenticated current-user requests', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({ code: 'UNAUTHENTICATED', message: 'No autorizado.' });
  });

  it('returns a Spanish message for unmatched routes', async () => {
    const response = await request(app).get('/api/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'ROUTE_NOT_FOUND', message: 'Ruta no encontrada.' });
  });

  it('returns a Spanish message for invalid request bodies', async () => {
    const response = await request(app).post('/api/auth/login').send({ username: '', password: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Los datos enviados no son válidos.');
  });
});
