import { Contract, Event, Payment } from './crm.models';
import { amount } from './contract-financials.service';

type Installment = { id?: string; amount?: number; paidAmount?: number; status?: string; paymentId?: string; [key: string]: unknown };

/**
 * Pure waterfall: resets every installment and re-applies the given paid amounts, in order, to the
 * first still-open installment. Used to rebuild a plan after a paid payment changes, because the
 * plan stores what was applied and a plain amount edit would otherwise leave it out of sync.
 */
export function rebuildPlanFromPayments(plan: Installment[], paid: Array<{ id: string; amount: number }>): Installment[] {
  const next: Installment[] = plan.map((item) => {
    const { paidAmount: _paidAmount, paymentId: _paymentId, status, ...rest } = item;
    return { ...rest, status: status === 'cancelled' ? 'cancelled' : 'scheduled' };
  });
  for (const payment of paid) {
    let remaining = amount(payment.amount);
    for (const installment of next) {
      if (remaining <= 0) break;
      if (installment.status === 'cancelled') continue;
      const pending = amount(installment.amount) - amount(installment.paidAmount);
      if (pending <= 0) continue;
      const applied = Math.min(remaining, pending);
      installment.paidAmount = amount(installment.paidAmount) + applied;
      installment.status = installment.paidAmount >= amount(installment.amount) ? 'paid' : 'partial';
      installment.paymentId = payment.id;
      remaining -= applied;
    }
  }
  return next;
}

/** Rebuilds the event and contract plan from the event's paid installment payments (chronological). */
export async function rebuildEventPaymentPlan(eventId: string, contractId?: string): Promise<void> {
  const event: any = await Event.findOne({ _id: eventId, deletedAt: null });
  if (!event || !Array.isArray(event.paymentPlanSnapshot) || !event.paymentPlanSnapshot.length) return;
  const payments: any[] = await Payment.find({ eventId, deletedAt: null, status: 'paid', type: 'installment' }).sort({ createdAt: 1 });
  const paid = payments.map((payment) => ({
    id: String(payment._id),
    amount: payment.contractAppliedAmount === undefined || payment.contractAppliedAmount === null ? amount(payment.amount) : amount(payment.contractAppliedAmount)
  }));
  const plan = rebuildPlanFromPayments(event.paymentPlanSnapshot, paid);
  event.paymentPlanSnapshot = plan;
  await event.save();
  if (contractId) {
    const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
    if (contract) {
      contract.paymentPlanSnapshot = plan;
      await contract.save();
    }
  }
}
