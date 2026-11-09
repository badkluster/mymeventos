import { describe, expect, it } from 'vitest';
import { rebuildPlanFromPayments } from '../src/modules/crm/payment-plan-rebuild.service';

const plan = (count: number, value = 100) => Array.from({ length: count }, (_, index) => ({ id: `q${index + 1}`, amount: value, status: 'paid', paidAmount: 0 }));

describe('rebuildPlanFromPayments', () => {
  it('discards stale applications and re-applies payments in order', () => {
    const stale = plan(4).map((item, index) => (index === 3 ? { ...item, paidAmount: 100, paymentId: 'old' } : item));
    const rebuilt = rebuildPlanFromPayments(stale, [{ id: 'p1', amount: 250 }]);
    expect(rebuilt.map((item) => [item.status, item.paidAmount ?? 0])).toEqual([['paid', 100], ['paid', 100], ['partial', 50], ['scheduled', 0]]);
    expect(rebuilt[3].paymentId).toBeUndefined();
    expect(rebuilt[2].paymentId).toBe('p1');
  });

  it('spills a later payment over the partial installment and keeps cancelled ones untouched', () => {
    const input = [...plan(2), { id: 'x', amount: 100, status: 'cancelled' }, ...plan(1).map((item) => ({ ...item, id: 'q4' }))];
    const rebuilt = rebuildPlanFromPayments(input, [{ id: 'p1', amount: 150 }, { id: 'p2', amount: 100 }]);
    expect(rebuilt.map((item) => [item.id, item.status, item.paidAmount ?? 0])).toEqual([['q1', 'paid', 100], ['q2', 'paid', 100], ['x', 'cancelled', 0], ['q4', 'partial', 50]]);
    expect(rebuilt[1].paymentId).toBe('p2');
  });

  it('does not mutate the input plan', () => {
    const input = plan(2);
    rebuildPlanFromPayments(input, [{ id: 'p1', amount: 100 }]);
    expect(input[0].paidAmount).toBe(0);
  });
});
