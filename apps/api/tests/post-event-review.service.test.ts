import { beforeEach, describe, expect, it, vi } from 'vitest';

// A small in-memory fake for CalendarItem is used (instead of one-shot vi.fn() mocks like
// financial-reminders.service.test.ts uses) because this test specifically needs to verify
// idempotency ACROSS two separate tick calls: the sync step's upsert-by-automationKey and the
// engine's claim-by-lease query both need real, persistent filter/update semantics for that to
// be a meaningful assertion rather than a scripted mock response.
function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}
function setPath(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (cur[keys[i]] == null || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}
function unsetPath(obj: any, path: string): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    if (cur[keys[i]] == null) return;
    cur = cur[keys[i]];
  }
  delete cur[keys[keys.length - 1]];
}
function matchesFilter(doc: any, filter: any): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return (condition as any[]).some((sub) => matchesFilter(doc, sub));
    const value = getPath(doc, key);
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('$lte' in condition) return value != null && value <= (condition as any).$lte;
      if ('$in' in condition) return (condition as any).$in.includes(value);
      if ('$nin' in condition) return !(condition as any).$nin.includes(value);
      if ('$ne' in condition) return value !== (condition as any).$ne;
    }
    return value === condition;
  });
}
function applyUpdate(doc: any, update: any, isInsert: boolean): void {
  if (isInsert) Object.entries(update.$setOnInsert ?? {}).forEach(([key, value]) => setPath(doc, key, value));
  Object.entries(update.$set ?? {}).forEach(([key, value]) => setPath(doc, key, value));
  Object.keys(update.$unset ?? {}).forEach((key) => unsetPath(doc, key));
  Object.entries(update.$inc ?? {}).forEach(([key, value]) => setPath(doc, key, (getPath(doc, key) || 0) + (value as number)));
}

let calendarStore: any[] = [];
let calendarSeq = 0;

const mocks = vi.hoisted(() => ({
  calendarFindOneAndUpdate: vi.fn(),
  calendarUpdateOne: vi.fn(),
  eventFind: vi.fn(),
  eventFindOne: vi.fn(),
  customerFindOne: vi.fn(),
  sendEmail: vi.fn(),
  userFind: vi.fn(),
  notificationBulkWrite: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  CalendarItem: { findOneAndUpdate: mocks.calendarFindOneAndUpdate, updateOne: mocks.calendarUpdateOne },
  Event: { find: mocks.eventFind, findOne: mocks.eventFindOne },
  Customer: { findOne: mocks.customerFindOne }
}));
vi.mock('../src/modules/users/user.model', () => ({ User: { find: mocks.userFind } }));
vi.mock('../src/modules/notifications/notification.model', () => ({ Notification: { bulkWrite: mocks.notificationBulkWrite } }));
vi.mock('../src/modules/email/email.service', () => ({ sendEmail: mocks.sendEmail }));

import { GOOGLE_REVIEW_URL, processPostEventReviewTick } from '../src/modules/crm/post-event-review.service';

function leanQuery<T>(result: T) {
  const query: any = { select: vi.fn(), lean: vi.fn().mockResolvedValue(result) };
  query.select.mockReturnValue(query);
  return query;
}

describe('post-event review automation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    calendarStore = [];
    calendarSeq = 0;

    mocks.calendarFindOneAndUpdate.mockImplementation(async (filter: any, update: any, options: any = {}) => {
      let doc = calendarStore.find((candidate) => matchesFilter(candidate, filter));
      let isInsert = false;
      if (!doc && options.upsert) {
        doc = { _id: `calendar-${(calendarSeq += 1)}`, deletedAt: null, notification: {} };
        calendarStore.push(doc);
        isInsert = true;
      }
      if (!doc) return null;
      applyUpdate(doc, update, isInsert);
      return options.new || isInsert ? { ...doc, notification: { ...doc.notification }, metadata: { ...doc.metadata } } : null;
    });
    mocks.calendarUpdateOne.mockImplementation(async (filter: any, update: any) => {
      const doc = calendarStore.find((candidate) => matchesFilter(candidate, filter));
      if (!doc) return { matchedCount: 0 };
      applyUpdate(doc, update, false);
      return { matchedCount: 1 };
    });
    mocks.eventFind.mockReturnValue(leanQuery([]));
    mocks.eventFindOne.mockReturnValue(leanQuery(undefined));
    mocks.customerFindOne.mockReturnValue(leanQuery(undefined));
    mocks.sendEmail.mockResolvedValue(true);
  });

  it('sends exactly one review email with the Google review link for an event finished two days ago, and never duplicates it on a later tick', async () => {
    const event = {
      _id: 'event-1',
      eventName: 'Cumple de 15 de Sol',
      eventDate: '2026-06-01',
      customerId: 'customer-1'
    };
    mocks.eventFind.mockReturnValue(leanQuery([event]));
    mocks.eventFindOne.mockReturnValue(leanQuery({ _id: 'event-1', status: 'confirmed' }));
    mocks.customerFindOne.mockReturnValue(leanQuery({ email: 'sol@example.com' }));

    const firstTick = await processPostEventReviewTick(new Date('2026-06-03T15:00:00.000Z'));

    expect(firstTick).toMatchObject({ synced: 1, delivered: 1, skipped: 0, failed: 0 });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    const [emailArgs] = mocks.sendEmail.mock.calls[0];
    expect(emailArgs.to).toBe('sol@example.com');
    expect(emailArgs.html).toContain(GOOGLE_REVIEW_URL);
    expect(emailArgs.html).toContain('Dejar una reseña en Google');
    expect(emailArgs.text).toContain(GOOGLE_REVIEW_URL);

    // Second tick: the event is still returned by the (mocked) sync query, and the CalendarItem
    // already exists — real idempotency hinges on the sync being a $setOnInsert-only no-op and
    // the claim query no longer matching a 'sent' item.
    mocks.sendEmail.mockClear();
    const secondTick = await processPostEventReviewTick(new Date('2026-06-05T15:00:00.000Z'));

    expect(secondTick).toMatchObject({ delivered: 0, skipped: 0, failed: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(calendarStore).toHaveLength(1);
  });

  it('does not create or send anything for an event that has not happened yet', async () => {
    mocks.eventFind.mockReturnValue(leanQuery([])); // the real query's eventDate<=cutoff filter would exclude a future event

    const result = await processPostEventReviewTick(new Date('2026-06-03T15:00:00.000Z'));

    expect(result).toMatchObject({ synced: 0, delivered: 0, skipped: 0, failed: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(calendarStore).toHaveLength(0);
  });

  it('cancels a pending review request instead of sending it if the event was cancelled after being scheduled', async () => {
    calendarStore.push({
      _id: 'calendar-existing',
      deletedAt: null,
      automationKey: 'post_event_review:event-2',
      eventId: 'event-2',
      customerId: 'customer-2',
      status: 'scheduled',
      metadata: { postEventReview: true, eventName: 'Boda de Ana y Luis' },
      notification: { enabled: true, channels: ['email'], sendAt: new Date('2026-06-03T00:00:00.000Z'), status: 'scheduled', attemptCount: 0 }
    });
    mocks.eventFind.mockReturnValue(leanQuery([])); // nothing new to sync this tick
    mocks.eventFindOne.mockReturnValue(leanQuery({ _id: 'event-2', status: 'cancelled' }));

    const result = await processPostEventReviewTick(new Date('2026-06-04T12:00:00.000Z'));

    expect(result).toMatchObject({ delivered: 0, skipped: 1, failed: 0 });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(calendarStore[0]).toMatchObject({ status: 'cancelled', notification: { status: 'cancelled' } });
  });
});
