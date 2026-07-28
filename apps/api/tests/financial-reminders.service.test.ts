import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  calendarFindOneAndUpdate: vi.fn(),
  calendarUpdateMany: vi.fn(),
  calendarUpdateOne: vi.fn(),
  contractFind: vi.fn(),
  contractFindOne: vi.fn(),
  eventFind: vi.fn(),
  eventFindOne: vi.fn(),
  leadFindOne: vi.fn(),
  paymentFind: vi.fn(),
  paymentFindOne: vi.fn(),
  salonFindOne: vi.fn(),
  userFind: vi.fn(),
  notificationBulkWrite: vi.fn(),
  sendEmail: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  CalendarItem: {
    findOneAndUpdate: mocks.calendarFindOneAndUpdate,
    updateMany: mocks.calendarUpdateMany,
    updateOne: mocks.calendarUpdateOne
  },
  Contract: { find: mocks.contractFind, findOne: mocks.contractFindOne },
  Event: { find: mocks.eventFind, findOne: mocks.eventFindOne },
  Lead: { findOne: mocks.leadFindOne },
  Payment: { find: mocks.paymentFind, findOne: mocks.paymentFindOne }
}));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { findOne: mocks.salonFindOne } }));
vi.mock('../src/modules/users/user.model', () => ({ User: { find: mocks.userFind } }));
vi.mock('../src/modules/notifications/notification.model', () => ({ Notification: { bulkWrite: mocks.notificationBulkWrite } }));
vi.mock('../src/modules/email/email.service', () => ({ sendEmail: mocks.sendEmail }));

import { processFinancialReminderTick } from '../src/modules/crm/financial-reminders.service';

function leanQuery<T>(result: T) {
  const query: any = {
    select: vi.fn(),
    sort: vi.fn(),
    lean: vi.fn().mockResolvedValue(result)
  };
  query.select.mockReturnValue(query);
  query.sort.mockReturnValue(query);
  return query;
}

function upsertCalls() {
  return mocks.calendarFindOneAndUpdate.mock.calls.filter(([, , options]) => Boolean((options as { upsert?: boolean } | undefined)?.upsert));
}

describe('financial reminders service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.contractFind.mockReturnValue(leanQuery([]));
    mocks.contractFindOne.mockReturnValue(leanQuery(undefined));
    mocks.eventFind.mockReturnValue(leanQuery([]));
    mocks.eventFindOne.mockReturnValue(leanQuery(undefined));
    mocks.leadFindOne.mockReturnValue(leanQuery(undefined));
    mocks.paymentFind.mockReturnValue(leanQuery([]));
    mocks.paymentFindOne.mockReturnValue(leanQuery(undefined));
    mocks.salonFindOne.mockReturnValue(leanQuery(undefined));
    mocks.userFind.mockReturnValue(leanQuery([]));
    mocks.calendarFindOneAndUpdate.mockResolvedValue(null);
    mocks.calendarUpdateMany.mockResolvedValue(undefined);
    mocks.calendarUpdateOne.mockResolvedValue(undefined);
    mocks.notificationBulkWrite.mockResolvedValue(undefined);
    mocks.sendEmail.mockResolvedValue(undefined);
  });

  it('creates and schedules every plan-installment stage when the due date is seven days away', async () => {
    const installment = {
      id: 'installment-1',
      label: 'Segunda cuota',
      amount: 50000,
      paidAmount: 10000,
      status: 'pending',
      dueDate: '2026-06-08'
    };
    const contract = {
      _id: 'contract-1',
      eventId: 'event-1',
      customerId: 'customer-1',
      balanceAmount: 0,
      paymentPlanSnapshot: []
    };
    const event = {
      _id: 'event-1',
      customerId: 'customer-1',
      eventName: 'Cumple de Ana',
      status: 'confirmed',
      paymentPlanSnapshot: [installment]
    };
    mocks.contractFind.mockReturnValue(leanQuery([contract]));
    mocks.eventFind.mockReturnValue(leanQuery([event]));
    mocks.userFind.mockReturnValue(leanQuery([{ _id: 'financial-user', email: 'finance@example.com' }]));

    const result = await processFinancialReminderTick(new Date('2026-06-01T15:00:00.000Z'));

    expect(result).toMatchObject({ synced: 6, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(upsertCalls()).toHaveLength(6);
    expect(upsertCalls().map(([, update]) => ({
      rule: update.$set.metadata.rule,
      sendAt: update.$setOnInsert.notification.sendAt.toISOString()
    }))).toEqual([
      { rule: 'due_7_days', sendAt: '2026-06-01T03:00:00.000Z' },
      { rule: 'due_3_days', sendAt: '2026-06-05T03:00:00.000Z' },
      { rule: 'due_today', sendAt: '2026-06-08T03:00:00.000Z' },
      { rule: 'overdue', sendAt: '2026-06-09T03:00:00.000Z' },
      { rule: 'second_notice', sendAt: '2026-06-11T03:00:00.000Z' },
      { rule: 'escalation', sendAt: '2026-06-15T03:00:00.000Z' }
    ]);

    const d7Call = upsertCalls().find(([filter]) => filter.automationKey === 'financial:installment:event-1:installment-1:due_7_days:2026-06-08');
    expect(d7Call).toBeDefined();
    expect(d7Call?.[1]).toMatchObject({
      $set: {
        type: 'payment_window',
        title: 'Pago por vencer en 7 días',
        eventId: 'event-1',
        contractId: 'contract-1',
        assignedToUserId: 'financial-user',
        metadata: {
          financialReminder: true,
          source: 'installment',
          rule: 'due_7_days',
          obligationKey: 'financial:installment:event-1:installment-1',
          dueDateKey: '2026-06-08',
          planInstallmentId: 'installment-1',
          remainingAmount: 40000,
          recipientUserIds: ['financial-user'],
          recipientMode: 'normal'
        }
      },
      $setOnInsert: {
        status: 'scheduled',
        notification: {
          enabled: true,
          channels: ['system', 'email'],
          status: 'scheduled',
          attemptCount: 0
        }
      }
    });
    expect(d7Call?.[2]).toEqual({ upsert: true, new: true, setDefaultsOnInsert: true });
  });

  it('creates the D+7 escalation for the lead, salon manager, and financial fallback recipients', async () => {
    const contract = {
      _id: 'contract-1',
      eventId: 'event-1',
      salonId: 'salon-1',
      balanceAmount: 0,
      paymentPlanSnapshot: []
    };
    const event = {
      _id: 'event-1',
      salonId: 'salon-1',
      leadId: 'lead-1',
      eventName: 'Cumple de Ana',
      status: 'confirmed',
      paymentPlanSnapshot: [{ id: 'installment-1', amount: 50000, paidAmount: 0, status: 'pending', dueDate: '2026-06-08' }]
    };
    mocks.contractFind.mockReturnValue(leanQuery([contract]));
    mocks.eventFind.mockReturnValue(leanQuery([event]));
    mocks.leadFindOne.mockReturnValue(leanQuery({ assignedUserId: 'lead-user' }));
    mocks.salonFindOne.mockReturnValue(leanQuery({ managerUserId: 'salon-manager' }));
    mocks.userFind.mockImplementation((filter: { _id?: { $in?: string[] } }) => leanQuery(filter._id?.$in
      ? [{ _id: 'lead-user' }, { _id: 'salon-manager' }]
      : [{ _id: 'finance-admin' }]));

    const result = await processFinancialReminderTick(new Date('2026-06-15T15:00:00.000Z'));

    expect(result).toMatchObject({ synced: 1, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(upsertCalls()).toHaveLength(1);
    expect(upsertCalls()[0]).toEqual([
      { automationKey: 'financial:installment:event-1:installment-1:escalation:2026-06-08' },
      expect.objectContaining({
        $set: expect.objectContaining({
          title: 'Escalamiento por pago vencido',
          priority: 'critical',
          assignedToUserId: 'lead-user',
          metadata: expect.objectContaining({
            source: 'installment',
            rule: 'escalation',
            recipientMode: 'escalation',
            recipientUserIds: ['lead-user', 'salon-manager', 'finance-admin']
          })
        }),
        $setOnInsert: expect.objectContaining({
          notification: expect.objectContaining({ sendAt: new Date('2026-06-15T03:00:00.000Z') })
        })
      }),
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ]);
  });

  it('creates a balance reminder fifteen days before the event for the assigned lead and salon manager', async () => {
    const contract = {
      _id: 'contract-1',
      eventId: 'event-1',
      salonId: 'salon-1',
      balanceAmount: 125000,
      paymentPlanSnapshot: []
    };
    const event = {
      _id: 'event-1',
      salonId: 'salon-1',
      leadId: 'lead-1',
      eventName: 'Boda de Sol y Martín',
      eventDate: '2026-06-16',
      status: 'confirmed',
      paymentPlanSnapshot: []
    };
    mocks.contractFind.mockReturnValue(leanQuery([contract]));
    mocks.eventFind.mockReturnValue(leanQuery([event]));
    mocks.leadFindOne.mockReturnValue(leanQuery({ assignedUserId: 'lead-user' }));
    mocks.salonFindOne.mockReturnValue(leanQuery({ managerUserId: 'salon-manager' }));
    mocks.userFind.mockReturnValue(leanQuery([{ _id: 'lead-user' }, { _id: 'salon-manager' }]));

    const result = await processFinancialReminderTick(new Date('2026-06-01T15:00:00.000Z'));

    expect(result).toMatchObject({ synced: 1, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(upsertCalls()).toHaveLength(1);
    const [filter, update, options] = upsertCalls()[0];
    expect(filter).toEqual({ automationKey: 'financial:balance:contract-1:event_balance_15_days:2026-06-16' });
    expect(update).toMatchObject({
      $set: {
        title: 'Saldo pendiente a 15 días del evento',
        priority: 'high',
        startAt: new Date('2026-06-16T03:00:00.000Z'),
        assignedToUserId: 'lead-user',
        metadata: {
          financialReminder: true,
          source: 'balance',
          rule: 'event_balance_15_days',
          obligationKey: 'financial:balance:contract-1',
          dueDateKey: '2026-06-16',
          remainingAmount: 125000,
          recipientUserIds: ['lead-user', 'salon-manager'],
          recipientMode: 'balance'
        }
      },
      $setOnInsert: {
        notification: {
          sendAt: new Date('2026-06-01T03:00:00.000Z')
        }
      }
    });
    expect(options).toEqual({ upsert: true, new: true, setDefaultsOnInsert: true });
  });

  it('does not send a duplicate notification when a later tick cannot claim the calendar item', async () => {
    const claimedItem = {
      _id: 'calendar-1',
      automationKey: 'financial:balance:contract-1:event_balance_15_days:2026-06-16',
      eventId: 'event-1',
      contractId: 'contract-1',
      assignedToUserId: 'recipient-1',
      title: 'Saldo pendiente a 15 días del evento',
      description: 'Saldo pendiente.',
      metadata: {
        financialReminder: true,
        source: 'balance',
        dueDateKey: '2026-06-16',
        recipientUserIds: ['recipient-1']
      },
      notification: { channels: ['system', 'email'] }
    };
    const claims = vi.fn()
      .mockResolvedValueOnce(claimedItem)
      // The first tick checks once more after delivery and finds no work.
      .mockResolvedValueOnce(null)
      // The next tick must likewise not dispatch the already-claimed item again.
      .mockResolvedValueOnce(null);
    mocks.calendarFindOneAndUpdate.mockImplementation((_filter: unknown, _update: unknown, options?: { upsert?: boolean }) => options?.upsert ? Promise.resolve({}) : claims());
    mocks.eventFindOne.mockReturnValue(leanQuery({ _id: 'event-1', status: 'confirmed', paymentPlanSnapshot: [] }));
    mocks.contractFindOne.mockReturnValue(leanQuery({ _id: 'contract-1', balanceAmount: 125000, paymentPlanSnapshot: [] }));
    mocks.userFind.mockReturnValue(leanQuery([{ _id: 'recipient-1', email: 'recipient@example.com' }]));

    const firstTick = await processFinancialReminderTick(new Date('2026-06-01T15:00:00.000Z'));
    const secondTick = await processFinancialReminderTick(new Date('2026-06-01T15:01:00.000Z'));

    expect(firstTick).toMatchObject({ synced: 0, delivered: 1, skipped: 0, failed: 0, hasMore: false });
    expect(secondTick).toMatchObject({ synced: 0, delivered: 0, skipped: 0, failed: 0, hasMore: false });
    expect(claims).toHaveBeenCalledTimes(3);
    expect(mocks.notificationBulkWrite).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.calendarUpdateOne).toHaveBeenCalledTimes(1);
  });
});
