import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workSessionFind: vi.fn(),
  workSessionUpdateMany: vi.fn(),
  settlementFindById: vi.fn(),
  advanceFind: vi.fn(),
  adjustmentFind: vi.fn()
}));

vi.mock('../src/modules/attendance/attendance.models', () => ({
  WorkSession: { find: mocks.workSessionFind, updateMany: mocks.workSessionUpdateMany }
}));

vi.mock('../src/modules/operations/operations.models', () => ({
  Expense: {}, ExpenseAllocation: {}, ExpenseCategory: {}
}));

vi.mock('../src/modules/users/user.model', () => ({ User: {} }));

vi.mock('../src/modules/payroll/payroll.models', () => ({
  PayrollAdjustment: { find: mocks.adjustmentFind },
  PayrollConcept: {},
  PayrollProfile: {},
  PayrollRun: {},
  PayrollSettlement: { findById: mocks.settlementFindById },
  SalaryAdvance: { find: mocks.advanceFind },
  ensurePayrollSettlementRunEmployeeIndex: vi.fn()
}));

import { recalculateSettlement } from '../src/modules/payroll/payroll.service';

const chain = <T>(items: T[]) => ({ sort: () => ({ lean: async () => items }) });

describe('recalculateSettlement', () => {
  it('adds newly approved, unreserved sessions from the draft period', async () => {
    const settlement = {
      _id: 'settlement-1', employeeId: 'employee-1', status: 'draft',
      periodStart: new Date('2026-09-01T12:00:00-03:00'), periodEnd: new Date('2026-09-30T12:00:00-03:00'),
      attendanceRecordIds: ['session-existing'],
      payrollProfileSnapshot: { compensationType: 'hourly', currency: 'ARS', hourlyRateMinor: 6_500, overtimeAfterMinutes: 480 },
      save: vi.fn().mockResolvedValue(undefined)
    };
    const existing = { _id: 'session-existing', startedAt: new Date('2026-09-01T12:00:00-03:00'), approvedMinutes: 60 };
    const additional = { _id: 'session-new', startedAt: new Date('2026-09-02T12:00:00-03:00'), approvedMinutes: 120 };
    mocks.settlementFindById.mockResolvedValue(settlement);
    mocks.workSessionFind.mockImplementation((query) => query.userId ? chain([additional]) : chain([existing]));
    mocks.workSessionUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    mocks.advanceFind.mockReturnValue(chain([]));
    mocks.adjustmentFind.mockReturnValue({ populate: () => ({ lean: async () => [] }) });

    const result = await recalculateSettlement({ id: 'admin-1', roles: ['ADMIN'] }, 'settlement-1');

    expect(mocks.workSessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ _id: { $in: ['session-new'] }, payrollApprovalStatus: 'approved' }), { $set: { payrollSettlementId: 'settlement-1' } });
    expect(result.attendanceRecordIds).toEqual(['session-existing', 'session-new']);
    expect(result.baseAmountMinor).toBe(19_500);
  });
});
