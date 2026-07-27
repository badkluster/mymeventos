import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../src/app';

describe('public unsubscribe flow', () => {
  it('is not exposed because campaign emails are direct lead/customer communications', async () => {
    const response = await request(app).get('/api/public/marketing/unsubscribe/legacy-token');

    expect(response.status).toBe(404);
  });
});
