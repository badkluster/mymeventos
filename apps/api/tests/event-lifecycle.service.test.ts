import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const query = (value: unknown) => ({ session: vi.fn().mockResolvedValue(value) });
  const count = vi.fn(() => query(0));
  return {
    query,
    startSession: vi.fn(),
    eventFindOne: vi.fn(),
    eventStaffCount: vi.fn(() => query(0)), eventStaffUpdate: vi.fn(),
    calendarCount: vi.fn(() => query(0)), calendarUpdate: vi.fn(),
    contractCount: vi.fn(() => query(0)), paymentCount: vi.fn(() => query(0)),
    expenseCount: vi.fn(() => query(0)), expenseUpdate: vi.fn(),
    inventoryCount: count, payrollCount: count,
    workSessionCount: vi.fn(() => query(0)), closureCount: vi.fn(() => query(0)),
    invitationCount: vi.fn(() => query(0)), invitationFindOne: vi.fn(),
    productionCount: vi.fn(() => query(0)), productionUpdate: vi.fn(),
    tablewareCount: vi.fn(() => query(0)), tablewareUpdate: vi.fn(),
  };
});

vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  return { ...actual, default: { ...actual.default, startSession: mocks.startSession } };
});
vi.mock('../src/modules/attendance/attendance.models', () => ({ WorkSession: { countDocuments: mocks.workSessionCount } }));
vi.mock('../src/modules/event-closure/event-closure.model', () => ({ EventClosure: { countDocuments: mocks.closureCount } }));
vi.mock('../src/modules/invitations/invitation.models', () => ({ DigitalInvitation: { countDocuments: mocks.invitationCount, findOne: mocks.invitationFindOne } }));
vi.mock('../src/modules/operations/operations.models', () => ({
  Expense: { countDocuments: mocks.expenseCount, updateMany: mocks.expenseUpdate },
  InventoryAdjustment: { countDocuments: mocks.inventoryCount },
}));
vi.mock('../src/modules/payroll/payroll.models', () => ({ PayrollRun: { countDocuments: mocks.payrollCount } }));
vi.mock('../src/modules/production/production.models', () => ({ ProductionPlan: { countDocuments: mocks.productionCount, updateMany: mocks.productionUpdate } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  Event: { findOne: mocks.eventFindOne },
  EventStaffAssignment: { countDocuments: mocks.eventStaffCount, updateMany: mocks.eventStaffUpdate },
  CalendarItem: { countDocuments: mocks.calendarCount, updateMany: mocks.calendarUpdate },
  Contract: { countDocuments: mocks.contractCount },
  Payment: { countDocuments: mocks.paymentCount },
}));
vi.mock('../src/modules/crm/eventTablewareAllocation.model', () => ({ EventTablewareAllocation: { countDocuments: mocks.tablewareCount, updateMany: mocks.tablewareUpdate } }));

import { cancelEvent, deleteDraftEvent, deletionPreview } from '../src/modules/crm/event-lifecycle.service';

const eventId = '507f1f77bcf86cd799439013';
const userId = '507f1f77bcf86cd799439011';

describe('event lifecycle service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const session = { withTransaction: vi.fn(async (work: () => Promise<unknown>) => work()), endSession: vi.fn().mockResolvedValue(undefined) };
    mocks.startSession.mockResolvedValue(session);
    for (const counter of [mocks.eventStaffCount, mocks.calendarCount, mocks.contractCount, mocks.paymentCount, mocks.expenseCount, mocks.inventoryCount, mocks.payrollCount, mocks.workSessionCount, mocks.closureCount, mocks.invitationCount, mocks.productionCount, mocks.tablewareCount]) {
      counter.mockImplementation(() => mocks.query(0));
    }
    for (const update of [mocks.eventStaffUpdate, mocks.calendarUpdate, mocks.expenseUpdate, mocks.productionUpdate, mocks.tablewareUpdate]) update.mockResolvedValue({ modifiedCount: 0 });
    mocks.invitationFindOne.mockReturnValue(mocks.query(null));
  });

  it('only allows deletion of an unlinked, unused draft', async () => {
    const clean = await deletionPreview({ _id: eventId, status: 'draft' });
    expect(clean.canProceed).toBe(true);

    const linked = await deletionPreview({ _id: eventId, status: 'draft', sourceQuoteId: '507f1f77bcf86cd799439099' });
    expect(linked.canProceed).toBe(false);
    expect(linked.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'EVENT_HAS_SOURCE' })]));
  });

  it('soft-deletes a clean draft and its unsent automatic calendar items atomically', async () => {
    const event: any = { _id: eventId, status: 'draft', lifecycleHistory: [], save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockReturnValue(mocks.query(event));

    const result = await deleteDraftEvent({ eventId, userId });

    expect(result.eventId).toBe(eventId);
    expect(event.deletedAt).toBeInstanceOf(Date);
    expect(event.deletedBy).toBe(userId);
    expect(event.save).toHaveBeenCalledWith(expect.objectContaining({ session: expect.anything() }));
    expect(mocks.calendarUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ eventId, source: 'event' }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'cancelled', deletedBy: userId }) }),
      expect.objectContaining({ session: expect.anything() }),
    );
  });

  it('cancels pending operations while preserving financial history', async () => {
    const event: any = { _id: eventId, status: 'confirmed', guestListAccessToken: 'public-token', lifecycleHistory: [], resourcePlanSnapshot: { supplierAssignments: [{ id: 'supplier-1', status: 'confirmed' }], inventoryItems: [{ id: 'plate', category: 'Vajilla', status: 'reserved', quantityReserved: 40 }] }, save: vi.fn().mockResolvedValue(undefined) };
    const invitation: any = { status: 'published', save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockReturnValue(mocks.query(event));
    mocks.invitationFindOne.mockReturnValue(mocks.query(invitation));
    mocks.eventStaffCount.mockImplementation((filter: any) => mocks.query(filter.status === 'checked_in' ? 0 : 2));
    mocks.calendarCount.mockImplementation(() => mocks.query(3));
    mocks.tablewareCount.mockImplementation(() => mocks.query(2));
    mocks.productionCount.mockImplementation(() => mocks.query(1));
    mocks.invitationCount.mockImplementation(() => mocks.query(1));
    mocks.expenseCount.mockImplementation((filter: any) => mocks.query(filter.status === 'paid' ? 1 : 1));
    mocks.contractCount.mockImplementation(() => mocks.query(1));
    mocks.paymentCount.mockImplementation(() => mocks.query(2));

    const result = await cancelEvent({ eventId, userId, status: 'cancelled', reason: 'Cancelación solicitada por el cliente.' });

    expect(result.event.status).toBe('cancelled');
    expect(event.guestListAccessTokenRevokedAt).toBeInstanceOf(Date);
    expect(event.resourcePlanSnapshot.supplierAssignments[0].status).toBe('cancelled');
    expect(event.resourcePlanSnapshot.inventoryItems[0]).toEqual(expect.objectContaining({ status: 'cancelled', quantityReserved: 0 }));
    expect(mocks.eventStaffUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: 'cancelled' }) }), expect.anything());
    expect(mocks.tablewareUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ releasedBy: userId }) }), expect.anything());
    expect(mocks.productionUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ status: 'cancelled' }) }), expect.anything());
    expect(mocks.expenseUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }), expect.objectContaining({ $set: expect.objectContaining({ status: 'cancelled' }) }), expect.anything());
    expect(invitation).toEqual(expect.objectContaining({ status: 'cancelled', statusBeforeEventCancellation: 'published' }));
    expect(result.preview.impacts).toEqual(expect.objectContaining({ paidExpensesPreserved: 1, contractsPreserved: 1, paymentsPreserved: 2 }));
  });
});
