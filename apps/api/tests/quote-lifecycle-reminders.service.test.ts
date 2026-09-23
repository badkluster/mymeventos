import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calendarFind: vi.fn(),
  calendarFindOneAndUpdate: vi.fn(),
  calendarUpdateOne: vi.fn(),
  customerFindOne: vi.fn(),
  leadFind: vi.fn(),
  quoteFind: vi.fn(),
  quoteFindOne: vi.fn(),
  quoteUpdateMany: vi.fn(),
  userFind: vi.fn(),
  notificationBulkWrite: vi.fn(),
  renderBrandedEmail: vi.fn(),
  sendEmail: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  CalendarItem: {
    find: mocks.calendarFind,
    findOneAndUpdate: mocks.calendarFindOneAndUpdate,
    updateOne: mocks.calendarUpdateOne
  },
  Customer: { findOne: mocks.customerFindOne },
  Lead: { find: mocks.leadFind },
  Quote: { find: mocks.quoteFind, findOne: mocks.quoteFindOne, updateMany: mocks.quoteUpdateMany }
}));
vi.mock('../src/modules/users/user.model', () => ({ User: { find: mocks.userFind } }));
vi.mock('../src/modules/notifications/notification.model', () => ({ Notification: { bulkWrite: mocks.notificationBulkWrite } }));
vi.mock('../src/modules/email/email.service', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('../src/modules/email/email-template.util', () => ({ renderBrandedEmail: mocks.renderBrandedEmail }));

import { processQuoteLifecycleTick } from '../src/modules/crm/quote-lifecycle-reminders.service';

function leanQuery<T>(result: T) {
  const query: any = { select: vi.fn(), lean: vi.fn().mockResolvedValue(result) };
  query.select.mockReturnValue(query);
  return query;
}

function quoteWriteCalls() {
  return mocks.calendarFindOneAndUpdate.mock.calls.filter(([filter]: any[]) => Boolean(filter?.automationKey));
}

function clientNoticeQuote(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'quote-1',
    customerId: 'customer-1',
    leadId: undefined,
    email: 'client@example.test',
    validUntil: '2026-06-04',
    sentAt: new Date('2026-05-31T15:00:00.000Z'),
    createdBy: 'creator-1',
    quoteNumber: 'Q-001',
    ...overrides
  };
}

describe('quote lifecycle reminders service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.calendarFind.mockReturnValue(leanQuery([]));
    mocks.calendarFindOneAndUpdate.mockResolvedValue(null);
    mocks.calendarUpdateOne.mockResolvedValue(undefined);
    mocks.customerFindOne.mockReturnValue(leanQuery(undefined));
    mocks.leadFind.mockReturnValue(leanQuery([]));
    mocks.quoteFind.mockReturnValue(leanQuery([]));
    mocks.quoteFindOne.mockReturnValue(leanQuery(undefined));
    mocks.quoteUpdateMany.mockResolvedValue({ modifiedCount: 0 });
    mocks.userFind.mockReturnValue(leanQuery([]));
    mocks.notificationBulkWrite.mockResolvedValue(undefined);
    mocks.renderBrandedEmail.mockReturnValue('<html>quote reminder</html>');
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates the due client notice with the same automation key, content, and insert-only notification as before', async () => {
    mocks.quoteFind.mockReturnValue(leanQuery([clientNoticeQuote()]));

    const result = await processQuoteLifecycleTick(new Date('2026-06-01T15:00:00.000Z'));

    expect(result).toMatchObject({ synced: 1, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    const writes = quoteWriteCalls();
    expect(writes).toHaveLength(1);
    const [filter, update, options] = writes[0] as any[];
    expect(filter).toEqual({ automationKey: 'quote_client_notice:quote-1' });
    expect(update.$set).toMatchObject({
      type: 'reminder',
      source: 'system',
      status: 'scheduled',
      quoteId: 'quote-1',
      customerId: 'customer-1',
      metadata: { quoteLifecycle: true, kind: 'client_notice', quoteEmail: 'client@example.test' }
    });
    expect(update.$setOnInsert.notification).toMatchObject({ enabled: true, channels: ['email'], status: 'scheduled', attemptCount: 0 });
    expect(options).toMatchObject({ upsert: true, setDefaultsOnInsert: true });
  });

  it('keeps the lead assignee as the internal follow-up recipient after the batched lookup', async () => {
    mocks.quoteFind.mockReturnValue(leanQuery([
      clientNoticeQuote({ validUntil: '2026-07-01', sentAt: new Date('2026-05-20T15:00:00.000Z'), leadId: 'lead-1' })
    ]));
    mocks.leadFind.mockReturnValue(leanQuery([{ _id: 'lead-1', assignedUserId: 'lead-owner-1' }]));

    const result = await processQuoteLifecycleTick(new Date('2026-06-01T15:00:00.000Z'));

    expect(result).toMatchObject({ synced: 1, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(mocks.leadFind).toHaveBeenCalledWith({ _id: { $in: ['lead-1'] }, deletedAt: null });
    const [filter, update] = quoteWriteCalls()[0] as any[];
    expect(filter).toEqual({ automationKey: 'quote_internal_followup:quote-1' });
    expect(update.$set.assignedToUserId).toBe('lead-owner-1');
    expect(update.$setOnInsert.notification.channels).toEqual(['system', 'email']);
  });

  it('expires sent quotes before sync, so expired quotes do not generate reminders', async () => {
    await processQuoteLifecycleTick(new Date('2026-06-01T15:00:00.000Z'));

    expect(mocks.quoteUpdateMany).toHaveBeenCalledWith(
      { deletedAt: null, status: 'sent', validUntil: { $lt: new Date('2026-06-01T15:00:00.000Z') } },
      { $set: { status: 'expired' } }
    );
    expect(mocks.calendarFind).not.toHaveBeenCalled();
    expect(quoteWriteCalls()).toHaveLength(0);
  });

  it('categorizes a missing client recipient without logging the quote, customer, or address', async () => {
    let claimed = false;
    mocks.quoteFindOne.mockReturnValue(leanQuery({ _id: 'quote-1', status: 'sent' }));
    mocks.calendarFindOneAndUpdate.mockImplementation((filter: any) => {
      if (!filter?.['metadata.quoteLifecycle'] || claimed) return Promise.resolve(null);
      claimed = true;
      return Promise.resolve({
        _id: 'calendar-1',
        automationKey: 'quote_client_notice:quote-1',
        quoteId: 'quote-1',
        customerId: 'customer-1',
        metadata: { quoteLifecycle: true, kind: 'client_notice', quoteEmail: '' }
      });
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await processQuoteLifecycleTick(new Date('2026-06-01T15:00:00.000Z'));

    expect(result).toMatchObject({ synced: 0, delivered: 0, skipped: 0, failed: 1, hasMore: false });
    const summary = warning.mock.calls
      .map(([message]) => JSON.parse(String(message)))
      .find((entry) => entry.event === 'quote_lifecycle_failure_summary');
    expect(summary).toEqual(expect.objectContaining({
      failed: 1,
      failureReasons: expect.objectContaining({ missing_external_recipient: 1 })
    }));
    expect(JSON.stringify(summary)).not.toContain('quote-1');
    expect(JSON.stringify(summary)).not.toContain('client@example.test');
  });
});
