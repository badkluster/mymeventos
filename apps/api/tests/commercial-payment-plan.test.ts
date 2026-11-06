import { describe, expect, it } from 'vitest';
import { mergeCommercialPaymentPlan } from '../src/modules/crm/commercial-payment-plan';

describe('commercial payment plan edits', () => {
  it('does not turn a cuota into a payment when the submitted plan says paid', () => {
    const result = mergeCommercialPaymentPlan(
      [{ id: 'cuota-3', amount: 272727, status: 'paid' }],
      [{ id: 'cuota-3', amount: 272727, status: 'paid', paidAmount: 272727, paymentId: 'invented' }],
    );

    expect(result).toEqual([{ id: 'cuota-3', amount: 272727, status: 'scheduled' }]);
  });

  it('keeps recorded allocations while allowing a commercial change to the cuota', () => {
    const result = mergeCommercialPaymentPlan(
      [{ id: 'cuota-1', label: 'Anterior', amount: 100000, paidAmount: 40000, paymentId: 'real-payment', status: 'partial' }],
      [{ id: 'cuota-1', label: 'Nueva', amount: 120000, paidAmount: 120000, paymentId: 'invented', status: 'paid' }],
    );

    expect(result).toEqual([{ id: 'cuota-1', label: 'Nueva', amount: 120000, paidAmount: 40000, paymentId: 'real-payment', status: 'partial' }]);
  });

  it('rejects removing a cuota with a recorded payment or lowering its amount below what was paid', () => {
    const current = [{ id: 'cuota-1', amount: 100000, paidAmount: 100000, paymentId: 'real-payment', status: 'paid' }];
    expect(() => mergeCommercialPaymentPlan(current, [])).toThrowError(expect.objectContaining({ code: 'EVENT_PAYMENT_PLAN_PAID_REMOVAL' }));
    expect(() => mergeCommercialPaymentPlan(current, [{ id: 'cuota-1', amount: 90000 }])).toThrowError(expect.objectContaining({ code: 'EVENT_PAYMENT_PLAN_BELOW_PAID' }));
  });

  it('rejects a duplicate cuota identifier', () => {
    expect(() => mergeCommercialPaymentPlan([], [{ id: 'same', amount: 100 }, { id: 'same', amount: 100 }]))
      .toThrowError(expect.objectContaining({ code: 'EVENT_PAYMENT_PLAN_INVALID' }));
  });

  it('assigns an identifier to a legacy unpaid cuota so it can be selected in Pagos', () => {
    const result = mergeCommercialPaymentPlan([], [{ label: 'Cuota antigua', amount: 100000 }]);

    expect(result[0]).toMatchObject({ label: 'Cuota antigua', amount: 100000, status: 'scheduled' });
    expect(result[0].id).toEqual(expect.any(String));
  });
});
