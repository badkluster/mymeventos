import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calendarFindOneAndUpdate: vi.fn(),
  calendarUpdateMany: vi.fn(),
  calendarUpdateOne: vi.fn(),
  eventFind: vi.fn(),
  salonFind: vi.fn(),
  userFind: vi.fn(),
  workSessionFind: vi.fn(),
  workSessionDistinct: vi.fn(),
  productionPlanFind: vi.fn(),
  findPendingClosures: vi.fn(),
  notificationBulkWrite: vi.fn(),
  sendEmail: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  CalendarItem: {
    findOneAndUpdate: mocks.calendarFindOneAndUpdate,
    updateMany: mocks.calendarUpdateMany,
    updateOne: mocks.calendarUpdateOne
  },
  Event: { find: mocks.eventFind }
}));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { find: mocks.salonFind } }));
vi.mock('../src/modules/users/user.model', () => ({ User: { find: mocks.userFind } }));
vi.mock('../src/modules/attendance/attendance.models', () => ({ WorkSession: { find: mocks.workSessionFind, distinct: mocks.workSessionDistinct } }));
vi.mock('../src/modules/production/production.models', () => ({ ProductionPlan: { find: mocks.productionPlanFind } }));
vi.mock('../src/modules/event-closure/pending-closures', () => ({ findEventsWithPendingClosure: mocks.findPendingClosures }));
vi.mock('../src/modules/notifications/notification.model', () => ({ Notification: { bulkWrite: mocks.notificationBulkWrite } }));
vi.mock('../src/modules/email/email.service', () => ({ sendEmail: mocks.sendEmail }));

import { processClosurePendingTick } from '../src/modules/crm/closure-reminders.service';
import { processOpenSessionAlertTick } from '../src/modules/crm/open-session-alerts.service';
import { processPayrollPendingTick } from '../src/modules/crm/payroll-pending-alerts.service';
import { processProductionPendingCloseTick } from '../src/modules/crm/production-close-reminders.service';
import { processProductionMissingTick } from '../src/modules/crm/production-reminders.service';

function leanQuery<T>(result: T) {
  const query: any = { select: vi.fn(), populate: vi.fn(), lean: vi.fn().mockResolvedValue(result) };
  query.select.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  return query;
}

function automationKeys() {
  return mocks.calendarFindOneAndUpdate.mock.calls
    .map(([filter]: any[]) => filter.automationKey)
    .filter(Boolean);
}

describe('Phase 2–3 automation batching regression coverage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.calendarFindOneAndUpdate.mockResolvedValue(null);
    mocks.calendarUpdateMany.mockResolvedValue(undefined);
    mocks.calendarUpdateOne.mockResolvedValue(undefined);
    mocks.eventFind.mockReturnValue(leanQuery([]));
    mocks.salonFind.mockReturnValue(leanQuery([]));
    mocks.userFind.mockReturnValue(leanQuery([]));
    mocks.workSessionFind.mockReturnValue(leanQuery([]));
    mocks.workSessionDistinct.mockResolvedValue([]);
    mocks.productionPlanFind.mockReturnValue(leanQuery([]));
    mocks.findPendingClosures.mockResolvedValue([]);
    mocks.notificationBulkWrite.mockResolvedValue(undefined);
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  it('keeps production-pending-close D+1 and D+3 candidate sets while loading managers once', async () => {
    const now = new Date('2026-06-01T15:00:00.000Z');
    mocks.productionPlanFind.mockReturnValue(leanQuery([
      { _id: 'plan-old', eventDate: new Date('2026-05-28T00:00:00.000Z'), salonId: 'salon-1', eventId: { _id: 'event-old', status: 'confirmed', eventName: 'Evento viejo' } },
      { _id: 'plan-recent', eventDate: new Date('2026-05-31T00:00:00.000Z'), salonId: 'salon-1', eventId: { _id: 'event-recent', status: 'confirmed', eventName: 'Evento reciente' } }
    ]));
    mocks.salonFind.mockReturnValue(leanQuery([{ _id: 'salon-1', managerUserId: 'manager-1' }]));

    const result = await processProductionPendingCloseTick(now);

    expect(result).toMatchObject({ synced: 3, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(mocks.productionPlanFind).toHaveBeenCalledTimes(1);
    expect(mocks.salonFind).toHaveBeenCalledWith({ _id: { $in: ['salon-1'] }, deletedAt: null });
    expect(automationKeys()).toEqual(expect.arrayContaining([
      'production_pending_close:plan-old:d1',
      'production_pending_close:plan-recent:d1',
      'production_pending_close:plan-old:d3'
    ]));
  });

  it('keeps the production-missing candidate set and its assigned manager', async () => {
    const now = new Date('2026-06-01T15:00:00.000Z');
    mocks.productionPlanFind.mockReturnValue(leanQuery([{ eventId: 'event-with-plan' }]));
    mocks.eventFind.mockReturnValue(leanQuery([
      { _id: 'event-missing-plan', eventName: 'Evento próximo', eventDate: new Date('2026-06-10T00:00:00.000Z'), salonId: 'salon-1' }
    ]));
    mocks.salonFind.mockReturnValue(leanQuery([{ _id: 'salon-1', managerUserId: 'manager-1' }]));

    const result = await processProductionMissingTick(now);

    expect(result).toMatchObject({ synced: 1, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(mocks.eventFind).toHaveBeenCalledWith(expect.objectContaining({
      _id: { $nin: ['event-with-plan'] },
      status: { $nin: ['cancelled', 'lost'] }
    }));
    const [filter, update] = mocks.calendarFindOneAndUpdate.mock.calls.find(([item]: any[]) => item.automationKey) as any[];
    expect(filter).toEqual({ automationKey: 'production_missing:event-missing-plan' });
    expect(update.$set.assignedToUserId).toBe('manager-1');
  });

  it('keeps closure D+1 and D+7 subsets while using one pending-closure snapshot', async () => {
    const now = new Date('2026-06-01T15:00:00.000Z');
    mocks.findPendingClosures.mockResolvedValue([
      { _id: 'event-old', eventDate: new Date('2026-05-20T00:00:00.000Z'), salonId: 'salon-1', eventName: 'Evento viejo' },
      { _id: 'event-recent', eventDate: new Date('2026-05-31T00:00:00.000Z'), salonId: 'salon-1', eventName: 'Evento reciente' }
    ]);
    mocks.salonFind.mockReturnValue(leanQuery([{ _id: 'salon-1', managerUserId: 'manager-1' }]));

    const result = await processClosurePendingTick(now);

    expect(result).toMatchObject({ synced: 3, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(mocks.findPendingClosures).toHaveBeenCalledTimes(1);
    expect(mocks.findPendingClosures).toHaveBeenCalledWith(now, 1);
    expect(automationKeys()).toEqual(expect.arrayContaining([
      'closure_pending:event-old:d1',
      'closure_pending:event-recent:d1',
      'closure_pending:event-old:d7'
    ]));
  });

  it('keeps every pending employee in payroll alerts while batching employee display names', async () => {
    mocks.workSessionDistinct.mockResolvedValue(['employee-1', 'employee-2']);
    mocks.userFind.mockReturnValue(leanQuery([
      { _id: 'employee-1', fullName: 'Empleado Uno' },
      { _id: 'employee-2', fullName: 'Empleado Dos' }
    ]));

    const result = await processPayrollPendingTick(new Date('2026-06-01T15:00:00.000Z'));

    expect(result).toMatchObject({ synced: 2, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(mocks.userFind).toHaveBeenCalledTimes(1);
    expect(mocks.userFind).toHaveBeenCalledWith({ _id: { $in: ['employee-1', 'employee-2'] }, deletedAt: null });
    expect(automationKeys()).toEqual(expect.arrayContaining(['payroll_pending:employee-1', 'payroll_pending:employee-2']));
    expect(mocks.calendarUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ 'metadata.employeeId': { $nin: ['employee-1', 'employee-2'] } }),
      expect.any(Object)
    );
  });

  it('keeps open-work-session candidates and assigns their salon manager from the batch', async () => {
    const now = new Date('2026-06-01T15:00:00.000Z');
    mocks.workSessionFind.mockReturnValue(leanQuery([
      { _id: 'session-1', userId: 'employee-1', salonId: 'salon-1', startedAt: new Date('2026-05-31T23:00:00.000Z') }
    ]));
    mocks.salonFind.mockReturnValue(leanQuery([{ _id: 'salon-1', managerUserId: 'manager-1' }]));

    const result = await processOpenSessionAlertTick(now);

    expect(result).toMatchObject({ synced: 1, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(mocks.workSessionFind).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
    const [filter, update] = mocks.calendarFindOneAndUpdate.mock.calls.find(([item]: any[]) => item.automationKey) as any[];
    expect(filter).toEqual({ automationKey: 'open_session:session-1' });
    expect(update.$set.assignedToUserId).toBe('manager-1');
  });
});
