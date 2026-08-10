import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calendarFind: vi.fn(),
  eventFind: vi.fn(),
  eventPopulate: vi.fn(),
  findPendingClosures: vi.fn(),
  renderBrandedEmail: vi.fn(),
  sendEmail: vi.fn(),
  userFind: vi.fn(),
  userUpdateOne: vi.fn()
}));

vi.mock('../src/config/env', () => ({ env: { CORS_ORIGIN: 'https://backoffice.example.test' } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  CalendarItem: { find: mocks.calendarFind },
  Event: { find: mocks.eventFind, populate: mocks.eventPopulate }
}));
vi.mock('../src/modules/users/user.model', () => ({ User: { find: mocks.userFind, updateOne: mocks.userUpdateOne } }));
vi.mock('../src/modules/email/email.service', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('../src/modules/email/email-template.util', () => ({ renderBrandedEmail: mocks.renderBrandedEmail }));
vi.mock('../src/modules/event-closure/pending-closures', () => ({ findEventsWithPendingClosure: mocks.findPendingClosures }));

import { processDailyDigestTick } from '../src/modules/crm/daily-digest.service';

function leanQuery<T>(result: T) {
  const query: any = { select: vi.fn(), populate: vi.fn(), sort: vi.fn(), lean: vi.fn().mockResolvedValue(result) };
  query.select.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  return query;
}

describe('daily digest service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.calendarFind.mockReturnValue(leanQuery([]));
    mocks.eventFind.mockReturnValue(leanQuery([]));
    mocks.eventPopulate.mockResolvedValue([]);
    mocks.findPendingClosures.mockResolvedValue([]);
    mocks.renderBrandedEmail.mockReturnValue('<html>digest</html>');
    mocks.sendEmail.mockResolvedValue(true);
    mocks.userFind.mockImplementation((filter: any) => leanQuery(filter.roles?.$in ? [{ _id: 'admin-1', email: 'admin@example.test' }] : []));

    let claimedDateKey: string | undefined;
    mocks.userUpdateOne.mockImplementation(async (_filter: any, update: any) => {
      const nextDateKey = update.$set.dailyDigestLastSentDateKey;
      if (claimedDateKey === nextDateKey) return { modifiedCount: 0 };
      claimedDateKey = nextDateKey;
      return { modifiedCount: 1 };
    });
  });

  it('delivers the daily summary only by email and only once per user per day', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');

    await processDailyDigestTick(now);
    await processDailyDigestTick(now);

    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { _id: 'admin-1', dailyDigestLastSentDateKey: { $ne: '2026-08-10' } },
      { $set: { dailyDigestLastSentDateKey: '2026-08-10' } }
    );
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@example.test', subject: expect.stringContaining('Resumen del día') }));
  });
});
