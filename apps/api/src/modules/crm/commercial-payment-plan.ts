import { randomUUID } from 'crypto';
import { ApiError } from '../../middlewares/errorHandler';

type Installment = {
  id?: string;
  amount?: number;
  paidAmount?: number;
  paymentId?: string;
  status?: string;
  [key: string]: unknown;
};

/** Commercial edits can change the schedule, but only the payment flow can settle a cuota. */
export function mergeCommercialPaymentPlan(currentPlan: unknown, submittedPlan: unknown): Installment[] {
  if (!Array.isArray(submittedPlan)) throw new ApiError(422, 'EVENT_PAYMENT_PLAN_INVALID', 'El plan de pagos debe ser una lista de cuotas.');

  const current = Array.isArray(currentPlan) ? currentPlan as Installment[] : [];
  const currentById = new Map(current.filter((item) => typeof item?.id === 'string').map((item) => [item.id, item]));
  const submittedIds = new Set<string>();

  const merged = submittedPlan.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ApiError(422, 'EVENT_PAYMENT_PLAN_INVALID', 'Hay una cuota inválida en el plan de pagos.');
    const submitted = item as Installment;
    if (submitted.id !== undefined && (typeof submitted.id !== 'string' || !submitted.id.trim())) {
      throw new ApiError(422, 'EVENT_PAYMENT_PLAN_INVALID', 'El identificador de una cuota es inválido.');
    }
    const id = submitted.id ?? randomUUID();
    if (submittedIds.has(id)) {
      throw new ApiError(422, 'EVENT_PAYMENT_PLAN_INVALID', 'Cada cuota debe tener un identificador único.');
    }
    submittedIds.add(id);
    if (typeof submitted.amount !== 'number' || !Number.isFinite(submitted.amount) || submitted.amount < 0) {
      throw new ApiError(422, 'EVENT_PAYMENT_PLAN_INVALID', 'El importe de cada cuota debe ser válido.');
    }

    const previous = currentById.get(id);
    const paidAmount = Number(previous?.paidAmount ?? 0);
    if (paidAmount > submitted.amount) {
      throw new ApiError(422, 'EVENT_PAYMENT_PLAN_BELOW_PAID', 'El importe de una cuota no puede ser menor que lo ya cobrado.');
    }
    const status = paidAmount > 0
      ? paidAmount >= submitted.amount ? 'paid' : 'partial'
      : previous?.status === 'cancelled' ? 'cancelled' : previous?.status === 'pending' ? 'pending' : 'scheduled';
    const { paidAmount: _ignoredPaidAmount, paymentId: _ignoredPaymentId, status: _ignoredStatus, ...commercialFields } = submitted;
    return {
      ...commercialFields,
      id,
      status,
      ...(paidAmount > 0 ? { paidAmount, ...(previous?.paymentId ? { paymentId: previous.paymentId } : {}) } : {}),
    };
  });

  if (current.some((item) => Number(item?.paidAmount ?? 0) > 0 && (!item.id || !submittedIds.has(item.id)))) {
    throw new ApiError(422, 'EVENT_PAYMENT_PLAN_PAID_REMOVAL', 'No se puede quitar una cuota con pagos registrados.');
  }
  return merged;
}
