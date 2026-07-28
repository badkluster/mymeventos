import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ processTick: vi.fn() }));

vi.mock('../src/config/env', () => ({ env: { CRON_SECRET: 'financial-cron-test-secret' } }));
vi.mock('../src/modules/crm/financial-reminders.service', () => ({ processFinancialReminderTick: mocks.processTick }));

import calendarTickRoutes from '../src/modules/crm/calendar-tick.routes';

const app = express();
app.use(express.json());
app.use('/api/internal', calendarTickRoutes);

describe('financial calendar tick route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.processTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
  });

  it('rejects a request without the internal cron secret', async () => {
    const response = await request(app).post('/api/internal/calendar-tick').send({ maxTicks: 1 });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, error: { code: 'INTERNAL_CALENDAR_TICK_FORBIDDEN' } });
    expect(mocks.processTick).not.toHaveBeenCalled();
  });

  it('accepts the bearer secret and limits work to three ticks', async () => {
    mocks.processTick.mockResolvedValue({ synced: 1, delivered: 0, skipped: 0, failed: 0, hasMore: true });

    const response = await request(app)
      .post('/api/internal/calendar-tick')
      .set('Authorization', 'Bearer financial-cron-test-secret')
      .send({ maxTicks: 100 });

    expect(response.status).toBe(200);
    expect(mocks.processTick).toHaveBeenCalledTimes(3);
    expect(response.body.data.ticks).toHaveLength(3);
  });
});
