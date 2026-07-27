import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';

describe('Payroll route integration', () => {
  it('registers the protected payroll backoffice module', async () => {
    const response = await request(app).get('/api/payroll/dashboard');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('registers the protected mobile self-service module', async () => {
    const response = await request(app).get('/api/mobile/payroll/settlements');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
