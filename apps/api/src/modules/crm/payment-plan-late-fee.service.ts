import { argentinaDateKey, daysBetweenDateKeys, dueDateKey } from '../../utils/argentina-date';

const CLOSED_INSTALLMENT_STATUSES = new Set(['paid', 'cancelled']);

/** Each overdue calendar day costs 1% of the agreed total for the event. */
export const DAILY_EVENT_LATE_FEE_PERCENTAGE = 1;

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function baseInstallmentAmount(installment: any): number {
  return money(installment?.baseAmount ?? installment?.amount);
}

function isOpen(installment: any): boolean {
  return Boolean(installment) && !CLOSED_INSTALLMENT_STATUSES.has(String(installment.status ?? ''));
}

function eventTotalAmount(event: any, contract?: any): number {
  return money(event?.finalAmount ?? event?.estimatedAmount ?? event?.commercialSnapshot?.totalAmount ?? contract?.baseAmount ?? contract?.totalAmount);
}

export function paymentPlanSource(event: any, contract?: any): any[] {
  if (Array.isArray(event?.paymentPlanSnapshot) && event.paymentPlanSnapshot.length) return event.paymentPlanSnapshot;
  return Array.isArray(contract?.paymentPlanSnapshot) ? contract.paymentPlanSnapshot : [];
}

/** Removes calculated presentation fields before a plan is stored through the event editor. */
export function paymentPlanForStorage(plan: unknown): any[] | unknown {
  if (!Array.isArray(plan)) return plan;
  return plan.map((installment: any) => {
    const { lateFeeAmount, lateFeeDailyAmount, lateFeeDays, ...stored } = installment ?? {};
    return {
      ...stored,
      amount: installment?.baseAmount === undefined ? installment?.amount : baseInstallmentAmount(installment)
    };
  });
}

/**
 * Returns a presentation/payment view of the plan. The stored `amount` remains the agreed base
 * installment; the late fee is derived from the calendar date, so reading the plan can never
 * compound it. Only the first open, already-expired installment accrues the daily fee.
 */
export function paymentPlanWithLateFees(event: any, contract?: any, now = new Date()): any[] {
  const source = paymentPlanSource(event, contract);
  const todayKey = argentinaDateKey(now);
  const overdueIndex = source.findIndex((installment: any) => {
    const dueKey = dueDateKey(installment?.paymentWindowEnd ?? installment?.dueDate);
    return isOpen(installment) && Boolean(dueKey && dueKey < todayKey);
  });
  const dailyLateFee = Math.round(eventTotalAmount(event, contract) * DAILY_EVENT_LATE_FEE_PERCENTAGE / 100);

  return source.map((installment: any, index: number) => {
    const baseAmount = baseInstallmentAmount(installment);
    const dueKey = dueDateKey(installment?.paymentWindowEnd ?? installment?.dueDate);
    const settledLateFeeAmount = money(installment?.settledLateFeeAmount);
    const daysLate = index === overdueIndex && dueKey ? Math.max(0, daysBetweenDateKeys(dueKey, todayKey)) : 0;
    const lateFeeAmount = String(installment?.status) === 'paid'
      ? settledLateFeeAmount
      : dailyLateFee * daysLate;
    const amount = baseAmount + lateFeeAmount;

    if (!lateFeeAmount && installment?.baseAmount === undefined && installment?.settledLateFeeAmount === undefined) return { ...installment };
    return {
      ...installment,
      baseAmount,
      amount,
      lateFeeAmount,
      lateFeeDailyAmount: index === overdueIndex ? dailyLateFee : 0,
      lateFeeDays: daysLate
    };
  });
}

/** Converts the result of a payment waterfall back to a durable plan without persisting transient accrual. */
export function storeAppliedPaymentPlan(sourcePlan: any[], paymentView: any[], appliedPlan: any[]): any[] {
  return sourcePlan.map((source: any, index: number) => {
    const applied = appliedPlan[index] ?? source;
    const paymentViewItem = paymentView[index] ?? source;
    const baseAmount = baseInstallmentAmount(source);
    const next: any = {
      ...source,
      paidAmount: money(applied.paidAmount),
      status: applied.status
    };
    if (applied.paymentId) next.paymentId = applied.paymentId;
    if (String(applied.status) === 'paid' && String(source.status) !== 'paid') {
      const settledLateFeeAmount = Math.max(0, money(paymentViewItem.amount) - baseAmount);
      if (settledLateFeeAmount > 0) next.settledLateFeeAmount = settledLateFeeAmount;
    }
    return next;
  });
}

export function newlySettledLateFeeAmount(previousPlan: any[], nextPlan: any[]): number {
  return nextPlan.reduce((total, installment, index) => total + Math.max(0,
    money(installment?.settledLateFeeAmount) - money(previousPlan[index]?.settledLateFeeAmount)
  ), 0);
}
