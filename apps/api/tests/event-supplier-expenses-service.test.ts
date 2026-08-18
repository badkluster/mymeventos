import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startSession: vi.fn(),
  eventFindOne: vi.fn(),
  supplierFind: vi.fn(),
  expenseFind: vi.fn(),
  expenseFindOneAndUpdate: vi.fn(),
  expenses: [] as any[],
}));

// The shared DB connection configures Mongoose with `set()` during module loading.
vi.mock('mongoose', () => ({ default: { set: vi.fn(), startSession: mocks.startSession } }));
vi.mock('../src/modules/crm/crm.models', () => ({ Event: { findOne: mocks.eventFindOne } }));
vi.mock('../src/modules/operations/operations.models', () => ({
  Supplier: { find: mocks.supplierFind },
  Expense: { find: mocks.expenseFind, findOneAndUpdate: mocks.expenseFindOneAndUpdate },
}));

import { syncEventSupplierExpenses } from '../src/modules/crm/event-supplier-expenses.service';

const eventId = '507f1f77bcf86cd799439011';
const salonId = '507f1f77bcf86cd799439012';
const supplierId = '507f1f77bcf86cd799439013';

describe('supplier assignment expense synchronization', () => {
  let event: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.expenses.splice(0);
    event = {
      _id: eventId,
      salonId,
      resourcePlanSnapshot: { supplierAssignments: [] },
      markModified: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const session = { withTransaction: vi.fn(async (work: () => Promise<void>) => work()), endSession: vi.fn().mockResolvedValue(undefined) };
    mocks.startSession.mockResolvedValue(session);
    mocks.eventFindOne.mockReturnValue({ session: vi.fn().mockResolvedValue(event) });
    mocks.supplierFind.mockReturnValue({ session: vi.fn().mockResolvedValue([{ _id: supplierId, name: 'Foto Sur', category: 'PHOTOGRAPHY', active: true, contactPerson: 'Ana', phone: '2215551111' }]) });
    mocks.expenseFind.mockImplementation(() => {
      const chain: any = {
        session: vi.fn().mockResolvedValue(mocks.expenses),
        populate: vi.fn(() => chain),
        sort: vi.fn(() => chain),
        lean: vi.fn().mockImplementation(async () => mocks.expenses.map((expense) => ({ ...expense }))),
      };
      return chain;
    });
    mocks.expenseFindOneAndUpdate.mockImplementation(async (_filter, update) => {
      let expense = mocks.expenses.find((item) => item.sourceId === update.$setOnInsert.sourceId);
      if (!expense) {
        expense = { _id: { toString: () => '507f1f77bcf86cd799439014' }, ...update.$setOnInsert, save: vi.fn().mockResolvedValue(undefined) };
        mocks.expenses.push(expense);
      }
      Object.assign(expense, update.$set);
      for (const field of Object.keys(update.$unset ?? {})) delete expense[field];
      return expense;
    });
  });

  it('upserts one expense for repeated confirmation and cancels that same expense with the assignment', async () => {
    const first = await syncEventSupplierExpenses({ eventId, userId: 'user-1', assignments: [{ id: 'assignment-1', supplierId, serviceType: 'Fotografía', agreedAmount: 85000, status: 'confirmed' }] });
    const originalPaidAt = mocks.expenses[0].paidAt;

    expect(first.summary.totalPaid).toBe(85000);
    expect(mocks.expenses).toHaveLength(1);
    expect(event.resourcePlanSnapshot.supplierAssignments[0]).toMatchObject({ supplierId, supplierName: 'Foto Sur', expenseStatus: 'paid' });

    const second = await syncEventSupplierExpenses({ eventId, userId: 'user-1', assignments: [{ id: 'assignment-1', supplierId, serviceType: 'Fotografía y video', agreedAmount: 90000, status: 'confirmed' }] });

    expect(second.summary.totalPaid).toBe(90000);
    expect(mocks.expenses).toHaveLength(1);
    expect(mocks.expenses[0].paidAt).toBe(originalPaidAt);
    expect(mocks.expenses[0].description).toBe('Fotografía y video');

    const cancelled = await syncEventSupplierExpenses({ eventId, userId: 'user-1', assignments: [{ id: 'assignment-1', supplierId, serviceType: 'Fotografía y video', agreedAmount: 90000, status: 'cancelled' }] });

    expect(cancelled.summary).toMatchObject({ totalPaid: 0, totalCancelled: 90000, activeExpenseCount: 0, cancelledExpenseCount: 1 });
    expect(mocks.expenses).toHaveLength(1);
    expect(event.resourcePlanSnapshot.supplierAssignments[0]).toMatchObject({ expenseStatus: 'cancelled' });
  });
});
