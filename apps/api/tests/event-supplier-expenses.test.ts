import { describe, expect, it } from 'vitest';
import { ExpenseStatus } from '@mym/shared';
import { summarizeEventExpenses } from '../src/modules/crm/event-supplier-expenses.service';

describe('event supplier expense summaries', () => {
  it('counts only active expenses in the event cost and keeps cancelled history separate', () => {
    const summary = summarizeEventExpenses([
      { amount: 50000, status: ExpenseStatus.PAID },
      { amount: 25000, status: ExpenseStatus.PAID },
      { amount: 90000, status: ExpenseStatus.CANCELLED },
    ]);

    expect(summary).toEqual({
      totalPaid: 75000,
      totalCancelled: 90000,
      activeExpenseCount: 2,
      cancelledExpenseCount: 1,
    });
  });

  it('does not count unknown statuses as paid expenses', () => {
    expect(summarizeEventExpenses([{ amount: 100000, status: 'pending' }])).toEqual({
      totalPaid: 0,
      totalCancelled: 0,
      activeExpenseCount: 0,
      cancelledExpenseCount: 0,
    });
  });
});
