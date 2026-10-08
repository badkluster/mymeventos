import { describe, expect, it } from 'vitest';
import { paymentPlanForStorage, paymentPlanWithLateFees, storeAppliedPaymentPlan } from '../src/modules/crm/payment-plan-late-fee.service';
import { applyPaymentToPlan } from '../src/modules/crm/payments.service';

const event = {
  finalAmount: 2_000_000,
  paymentPlanSnapshot: [
    { id: 'first', label: 'Cuota 1', amount: 100_000, dueDate: '2026-10-10', paymentWindowEnd: '2026-10-10', status: 'pending', paidAmount: 0 },
    { id: 'second', label: 'Cuota 2', amount: 100_000, dueDate: '2026-11-10', paymentWindowEnd: '2026-11-10', status: 'scheduled', paidAmount: 0 }
  ]
};

describe('daily late fee for payment plans', () => {
  it('adds 1% of the full event total on the first day after the payment window', () => {
    const plan = paymentPlanWithLateFees(event, undefined, new Date('2026-10-11T15:00:00.000Z'));

    expect(plan[0]).toMatchObject({ amount: 120_000, baseAmount: 100_000, lateFeeAmount: 20_000, lateFeeDays: 1 });
    expect(plan[1]).toMatchObject({ amount: 100_000 });
  });

  it('accumulates one further daily percentage without compounding the prior penalty', () => {
    const plan = paymentPlanWithLateFees(event, undefined, new Date('2026-10-12T15:00:00.000Z'));

    expect(plan[0]).toMatchObject({ amount: 140_000, lateFeeAmount: 40_000, lateFeeDays: 2 });
  });

  it('stops the accrual when the overdue installment is fully paid and persists only the settled fee', () => {
    const view = paymentPlanWithLateFees(event, undefined, new Date('2026-10-12T15:00:00.000Z'));
    const applied = applyPaymentToPlan(view, 140_000, { planInstallmentId: 'first', paymentId: 'payment-1' });
    const stored = storeAppliedPaymentPlan(event.paymentPlanSnapshot, view, applied.plan);
    const settledEvent = { ...event, paymentPlanSnapshot: stored };

    expect(stored[0]).toMatchObject({ amount: 100_000, paidAmount: 140_000, status: 'paid', settledLateFeeAmount: 40_000 });
    expect(paymentPlanWithLateFees(settledEvent, undefined, new Date('2026-10-20T15:00:00.000Z'))[0])
      .toMatchObject({ amount: 140_000, lateFeeAmount: 40_000, lateFeeDays: 0 });
  });

  it('continues charging the same first installment when it was only partially paid', () => {
    const firstView = paymentPlanWithLateFees(event, undefined, new Date('2026-10-11T15:00:00.000Z'));
    const firstPayment = applyPaymentToPlan(firstView, 110_000, { planInstallmentId: 'first', paymentId: 'payment-1' });
    const partiallyPaidEvent = { ...event, paymentPlanSnapshot: storeAppliedPaymentPlan(event.paymentPlanSnapshot, firstView, firstPayment.plan) };
    const nextDay = paymentPlanWithLateFees(partiallyPaidEvent, undefined, new Date('2026-10-12T15:00:00.000Z'));

    expect(nextDay[0]).toMatchObject({ amount: 140_000, paidAmount: 110_000, lateFeeAmount: 40_000, lateFeeDays: 2 });
    expect(nextDay[1]).toMatchObject({ amount: 100_000 });
  });

  it('does not persist derived late-fee fields when an operator saves the plan again', () => {
    const view = paymentPlanWithLateFees(event, undefined, new Date('2026-10-11T15:00:00.000Z'));
    const stored = paymentPlanForStorage(view) as any[];

    expect(stored[0]).toMatchObject({ amount: 100_000, baseAmount: 100_000 });
    expect(stored[0]).not.toHaveProperty('lateFeeAmount');
    expect(stored[0]).not.toHaveProperty('lateFeeDays');
  });
});
