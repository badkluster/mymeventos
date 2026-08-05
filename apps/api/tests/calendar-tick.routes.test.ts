import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  processTick: vi.fn(),
  processEventAlertTick: vi.fn(),
  processDailyDigestTick: vi.fn(),
  processPostEventReviewTick: vi.fn(),
  processClientPaymentReminderTick: vi.fn(),
  processCollectionFollowUpTick: vi.fn(),
  processLeadFollowUpTick: vi.fn(),
  processQuoteLifecycleTick: vi.fn(),
  processProductionMissingTick: vi.fn(),
  processProductionPendingCloseTick: vi.fn(),
  processTablewareOverbookingTick: vi.fn(),
  processClosurePendingTick: vi.fn(),
  processOpenSessionAlertTick: vi.fn(),
  processPayrollPendingTick: vi.fn(),
  processBirthdayCampaignTick: vi.fn()
}));

vi.mock('../src/config/env', () => ({ env: { CRON_SECRET: 'financial-cron-test-secret' } }));
vi.mock('../src/modules/crm/financial-reminders.service', () => ({ processFinancialReminderTick: mocks.processTick }));
vi.mock('../src/modules/crm/event-alert-reminders.service', () => ({ processEventAlertReminderTick: mocks.processEventAlertTick }));
vi.mock('../src/modules/crm/daily-digest.service', () => ({ processDailyDigestTick: mocks.processDailyDigestTick }));
vi.mock('../src/modules/crm/post-event-review.service', () => ({ processPostEventReviewTick: mocks.processPostEventReviewTick }));
vi.mock('../src/modules/crm/client-payment-reminders.service', () => ({ processClientPaymentReminderTick: mocks.processClientPaymentReminderTick }));
vi.mock('../src/modules/crm/collection-followup-reminders.service', () => ({ processCollectionFollowUpTick: mocks.processCollectionFollowUpTick }));
vi.mock('../src/modules/crm/lead-followup-reminders.service', () => ({ processLeadFollowUpTick: mocks.processLeadFollowUpTick }));
vi.mock('../src/modules/crm/quote-lifecycle-reminders.service', () => ({ processQuoteLifecycleTick: mocks.processQuoteLifecycleTick }));
vi.mock('../src/modules/crm/production-reminders.service', () => ({ processProductionMissingTick: mocks.processProductionMissingTick }));
vi.mock('../src/modules/crm/production-close-reminders.service', () => ({ processProductionPendingCloseTick: mocks.processProductionPendingCloseTick }));
vi.mock('../src/modules/crm/tableware-overbooking.service', () => ({ processTablewareOverbookingTick: mocks.processTablewareOverbookingTick }));
vi.mock('../src/modules/crm/closure-reminders.service', () => ({ processClosurePendingTick: mocks.processClosurePendingTick }));
vi.mock('../src/modules/crm/open-session-alerts.service', () => ({ processOpenSessionAlertTick: mocks.processOpenSessionAlertTick }));
vi.mock('../src/modules/crm/payroll-pending-alerts.service', () => ({ processPayrollPendingTick: mocks.processPayrollPendingTick }));
vi.mock('../src/modules/crm/birthday-campaigns.service', () => ({ processBirthdayCampaignTick: mocks.processBirthdayCampaignTick }));

import calendarTickRoutes from '../src/modules/crm/calendar-tick.routes';

const app = express();
app.use(express.json());
app.use('/api/internal', calendarTickRoutes);

describe('financial calendar tick route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.processTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processEventAlertTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processDailyDigestTick.mockResolvedValue({ delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processPostEventReviewTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processClientPaymentReminderTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processCollectionFollowUpTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processLeadFollowUpTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processQuoteLifecycleTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processProductionMissingTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processProductionPendingCloseTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processTablewareOverbookingTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processClosurePendingTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processOpenSessionAlertTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processPayrollPendingTick.mockResolvedValue({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    mocks.processBirthdayCampaignTick.mockResolvedValue({ matched: 0, campaignCreated: false, hasMore: false });
  });

  it('rejects a request without the internal cron secret', async () => {
    const response = await request(app).post('/api/internal/calendar-tick').send({ maxTicks: 1 });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, error: { code: 'INTERNAL_CALENDAR_TICK_FORBIDDEN' } });
    expect(mocks.processTick).not.toHaveBeenCalled();
    expect(mocks.processEventAlertTick).not.toHaveBeenCalled();
    expect(mocks.processDailyDigestTick).not.toHaveBeenCalled();
    expect(mocks.processPostEventReviewTick).not.toHaveBeenCalled();
  });

  it('accepts the bearer secret and limits work to three ticks', async () => {
    mocks.processTick.mockResolvedValue({ synced: 1, delivered: 0, skipped: 0, failed: 0, hasMore: true });

    const response = await request(app)
      .post('/api/internal/calendar-tick')
      .set('Authorization', 'Bearer financial-cron-test-secret')
      .send({ maxTicks: 100 });

    expect(response.status).toBe(200);
    expect(mocks.processTick).toHaveBeenCalledTimes(3);
    expect(mocks.processEventAlertTick).toHaveBeenCalledTimes(3);
    expect(mocks.processDailyDigestTick).toHaveBeenCalledTimes(3);
    expect(mocks.processPostEventReviewTick).toHaveBeenCalledTimes(3);
    expect(response.body.data.ticks).toHaveLength(3);
    expect(response.body.data.ticks[0]).toMatchObject({
      financial: { hasMore: true },
      eventAlert: { hasMore: false },
      dailyDigest: { hasMore: false },
      postEventReview: { hasMore: false }
    });
  });

  it('runs every domain in a round and keeps going if any of them still has more work', async () => {
    mocks.processEventAlertTick.mockResolvedValue({ synced: 1, delivered: 1, skipped: 0, failed: 0, hasMore: true });

    const response = await request(app)
      .post('/api/internal/calendar-tick')
      .set('Authorization', 'Bearer financial-cron-test-secret')
      .send({ maxTicks: 2 });

    expect(response.status).toBe(200);
    expect(mocks.processTick).toHaveBeenCalledTimes(2);
    expect(mocks.processEventAlertTick).toHaveBeenCalledTimes(2);
  });
});
