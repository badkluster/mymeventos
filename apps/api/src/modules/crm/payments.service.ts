import { Contract, Payment } from './crm.models';
import { ApiError } from '../../middlewares/errorHandler';
import {
  amount,
  defaultAffectsContractBalance,
  nonPayableContractStatuses,
  recalculateContractPayments,
  releaseContractBalance,
  releaseRefundAmount,
  reserveContractBalance,
  reserveRefundAmount
} from './contract-financials.service';

export { computeFinancialSummary as paymentSummary, recalculateContractPayments } from './contract-financials.service';

const refundableStatuses = new Set(['paid']);
const terminalPaymentStatuses = new Set(['cancelled', 'refunded']);

type PaymentPayload = {
  customerId?: string;
  eventId?: string;
  contractId?: string;
  quoteId?: string;
  salonId?: string;
  type?: string;
  method?: string;
  status?: string;
  amount?: number;
  dueDate?: Date | string;
  paidAt?: Date | string;
  receiptNumber?: string;
  reference?: string;
  notes?: string;
  planInstallmentId?: string;
  affectsContractBalance?: boolean;
  allowOverpayment?: boolean;
  allowExcessRefund?: boolean;
  overrideReason?: string;
  reason?: string;
};

function assertOverrideReason(allow: boolean | undefined, reason: string | undefined): void {
  if (allow && !(reason && reason.trim())) throw new ApiError(422, 'PAYMENT_OVERRIDE_REASON_REQUIRED');
}

function assertReasonProvided(reason: string | undefined): void {
  if (!reason || !reason.trim()) throw new ApiError(422, 'PAYMENT_CANCELLATION_REASON_REQUIRED');
}

const paymentMethods = ['cash', 'bank_transfer', 'mercado_pago', 'card', 'other'] as const;
function normalizePaymentMethod(method: string | undefined): (typeof paymentMethods)[number] {
  return (paymentMethods as readonly string[]).includes(method ?? '') ? (method as (typeof paymentMethods)[number]) : 'other';
}

/** Ticket-order-sourced payments are a read-side ledger entry only — refunds/edits happen through the tickets module (see refundTicketOrder), never through this service. */
function assertEditableManualPayment(payment: { source?: string }): void {
  if (payment.source === 'ticket_order') throw new ApiError(422, 'PAYMENT_TICKET_ORDER_READONLY');
}

/** pending -> paid | cancelled ; paid -> cancelled ; cancelled/refunded are terminal; `refunded` is never reachable via a direct status write. */
function assertValidPaymentStatusTransition(current: string, next?: string): void {
  if (!next || next === current) return;
  if (terminalPaymentStatuses.has(current)) throw new ApiError(422, 'PAYMENT_INVALID_STATUS_TRANSITION');
  if (next === 'refunded') throw new ApiError(422, 'PAYMENT_INVALID_STATUS_TRANSITION');
}

async function nextPaymentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await Payment.countDocuments({ paymentNumber: { $regex: `^PAY-${year}-` } });
  return `PAY-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function contractForPayment(contractId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  if (nonPayableContractStatuses.has(contract.status)) throw new ApiError(422, contract.status === 'cancelled' ? 'CONTRACT_CANCELLED' : 'CONTRACT_NOT_PAYABLE');
  return contract;
}

export async function createPayment(payload: PaymentPayload, userId: string): Promise<any> {
  if (!payload.contractId) throw new ApiError(422, 'PAYMENT_CONTRACT_REQUIRED');
  const contract = await contractForPayment(payload.contractId);
  const type = payload.type ?? 'installment';
  const status = payload.status ?? 'pending';
  if (status === 'paid' && !payload.method) throw new ApiError(422, 'PAYMENT_METHOD_REQUIRED');
  const affectsContractBalance = payload.affectsContractBalance ?? defaultAffectsContractBalance(type);
  const requestedAmount = amount(payload.amount);

  let reserved = false;
  if (status === 'paid' && affectsContractBalance) {
    assertOverrideReason(payload.allowOverpayment, payload.overrideReason);
    await reserveContractBalance(contract._id.toString(), requestedAmount, { allowOverpayment: payload.allowOverpayment });
    reserved = true;
  }

  try {
    const payment = await Payment.create({
      paymentNumber: await nextPaymentNumber(),
      customerId: payload.customerId ?? contract.customerId,
      eventId: payload.eventId ?? contract.eventId,
      contractId: contract._id,
      quoteId: payload.quoteId ?? contract.quoteId,
      salonId: payload.salonId ?? contract.salonId,
      type,
      method: payload.method,
      status,
      amount: payload.amount,
      dueDate: payload.dueDate,
      paidAt: status === 'paid' ? payload.paidAt ?? new Date() : payload.paidAt,
      receiptNumber: payload.receiptNumber,
      reference: payload.reference,
      notes: payload.notes,
      planInstallmentId: payload.planInstallmentId,
      affectsContractBalance,
      createdBy: userId,
      updatedBy: userId
    });
    await recalculateContractPayments(contract._id.toString());
    return payment;
  } catch (error) {
    if (reserved) await releaseContractBalance(contract._id.toString(), requestedAmount);
    throw error;
  }
}

export async function updatePayment(paymentId: string, payload: PaymentPayload, userId: string): Promise<any> {
  const payment: any = await Payment.findOne({ _id: paymentId, deletedAt: null });
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  assertEditableManualPayment(payment);
  if (payment.status === 'paid') {
    const allowed = ['receiptNumber', 'reference', 'notes'];
    const forbidden = Object.keys(payload).filter((key) => !allowed.includes(key));
    if (forbidden.length) throw new ApiError(422, 'PAYMENT_PAID_LOCKED');
  }
  assertValidPaymentStatusTransition(payment.status, payload.status);
  if (payload.status === 'paid' && !payload.method && !payment.method) throw new ApiError(422, 'PAYMENT_METHOD_REQUIRED');

  const transitioningToPaid = payload.status === 'paid' && payment.status !== 'paid';
  const affectsContractBalance = payload.affectsContractBalance ?? payment.affectsContractBalance ?? defaultAffectsContractBalance(payload.type ?? payment.type);
  const finalAmount = amount(payload.amount ?? payment.amount);

  let reserved = false;
  if (transitioningToPaid && affectsContractBalance) {
    assertOverrideReason(payload.allowOverpayment, payload.overrideReason);
    await reserveContractBalance(payment.contractId.toString(), finalAmount, { allowOverpayment: payload.allowOverpayment });
    reserved = true;
  }

  try {
    Object.assign(payment, payload, {
      affectsContractBalance,
      paidAt: payload.status === 'paid' && !payment.paidAt ? new Date() : payload.paidAt ?? payment.paidAt,
      updatedBy: userId
    });
    await payment.save();
    await recalculateContractPayments(payment.contractId.toString());
    return payment;
  } catch (error) {
    if (reserved) await releaseContractBalance(payment.contractId.toString(), finalAmount);
    throw error;
  }
}

export async function markPaymentPaid(paymentId: string, payload: PaymentPayload, userId: string): Promise<any> {
  const payment: any = await Payment.findOne({ _id: paymentId, deletedAt: null });
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  assertEditableManualPayment(payment);
  assertValidPaymentStatusTransition(payment.status, 'paid');
  if (!payload.method && !payment.method) throw new ApiError(422, 'PAYMENT_METHOD_REQUIRED');
  const paymentAmount = amount(payment.amount);
  const wasAlreadyPaid = payment.status === 'paid';

  let reserved = false;
  if (!wasAlreadyPaid && payment.affectsContractBalance) {
    assertOverrideReason(payload.allowOverpayment, payload.overrideReason);
    await reserveContractBalance(payment.contractId.toString(), paymentAmount, { allowOverpayment: payload.allowOverpayment });
    reserved = true;
  }

  try {
    payment.status = 'paid';
    payment.method = payload.method ?? payment.method;
    payment.paidAt = payload.paidAt ?? payment.paidAt ?? new Date();
    payment.receiptNumber = payload.receiptNumber ?? payment.receiptNumber;
    payment.reference = payload.reference ?? payment.reference;
    payment.notes = payload.notes ?? payment.notes;
    payment.updatedBy = userId;
    await payment.save();
    await recalculateContractPayments(payment.contractId.toString());
    return payment;
  } catch (error) {
    if (reserved) await releaseContractBalance(payment.contractId.toString(), paymentAmount);
    throw error;
  }
}

export async function cancelPayment(paymentId: string, userId: string, reason: string): Promise<any> {
  assertReasonProvided(reason);
  const payment: any = await Payment.findOne({ _id: paymentId, deletedAt: null });
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  assertEditableManualPayment(payment);
  if (payment.status === 'refunded') throw new ApiError(422, 'PAYMENT_REFUNDED_LOCKED');
  payment.status = 'cancelled';
  payment.cancellationReason = reason;
  payment.cancelledAt = payment.cancelledAt ?? new Date();
  payment.cancelledBy = userId;
  payment.updatedBy = userId;
  await payment.save();
  await recalculateContractPayments(payment.contractId.toString());
  return payment;
}

export async function refundPayment(paymentId: string, payload: PaymentPayload, userId: string): Promise<any> {
  assertReasonProvided(payload.reason);
  const original: any = await Payment.findOne({ _id: paymentId, deletedAt: null });
  if (!original) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  assertEditableManualPayment(original);
  if (!refundableStatuses.has(original.status) || original.type === 'refund') throw new ApiError(422, 'PAYMENT_NOT_REFUNDABLE');

  const requestedAmount = amount(payload.amount ?? original.amount);
  assertOverrideReason(payload.allowExcessRefund, payload.overrideReason);
  const { previousRefundable, resultingRefundable } = await reserveRefundAmount(original._id.toString(), requestedAmount, { allowExcessRefund: payload.allowExcessRefund });

  try {
    const refund = await Payment.create({
      paymentNumber: await nextPaymentNumber(),
      customerId: original.customerId,
      eventId: original.eventId,
      contractId: original.contractId,
      quoteId: original.quoteId,
      salonId: original.salonId,
      type: 'refund',
      method: payload.method ?? original.method ?? 'other',
      status: 'paid',
      amount: requestedAmount,
      paidAt: payload.paidAt ?? new Date(),
      receiptNumber: payload.receiptNumber,
      reference: payload.reference ?? `Reembolso de ${original.paymentNumber}`,
      notes: payload.notes,
      cancellationReason: payload.reason,
      affectsContractBalance: true,
      refundedPaymentId: original._id,
      createdBy: userId,
      updatedBy: userId
    });
    await recalculateContractPayments(original.contractId.toString());
    return { payment: refund, originalPayment: original, refundable: { previousRefundable, resultingRefundable } };
  } catch (error) {
    await releaseRefundAmount(original._id.toString(), requestedAmount);
    throw error;
  }
}

/**
 * Records a real Payment ledger entry for a paid TicketOrder, so digital-ticket sales show up
 * alongside manual event/contract payments for accounting/reporting. Called from
 * ticket.service.ts#markOrderPaid, which only ever transitions an order to "paid" once
 * (atomic conditional update), so this naturally runs at most once per order; the upfront
 * lookup plus the unique sparse index on ticketOrderId are defense-in-depth against races/retries.
 */
export async function recordTicketOrderPayment(
  order: { _id: unknown; totalAmount: number; currency?: string; publicId: string; paidAt?: Date },
  details: { method: string; reference?: string; userId?: string }
): Promise<any> {
  if (!order.totalAmount) return null;
  const existing = await Payment.findOne({ ticketOrderId: order._id, deletedAt: null }).lean();
  if (existing) return existing;
  return Payment.create({
    paymentNumber: await nextPaymentNumber(),
    source: 'ticket_order',
    ticketOrderId: order._id,
    type: 'other',
    method: normalizePaymentMethod(details.method),
    status: 'paid',
    amount: order.totalAmount,
    paidAt: order.paidAt ?? new Date(),
    reference: details.reference,
    notes: `Entrada digital · orden ${order.publicId}`,
    affectsContractBalance: false,
    createdBy: details.userId,
    updatedBy: details.userId
  });
}

/** Keeps the ticket-order Payment ledger entry in sync when refundTicketOrder (tickets module) approves a refund. */
export async function syncTicketOrderRefund(ticketOrderId: unknown, input: { full: boolean; refundAmount: number; userId?: string }): Promise<void> {
  await Payment.updateOne(
    { ticketOrderId, deletedAt: null },
    input.full
      ? { $set: { status: 'refunded', refundedAmount: input.refundAmount, updatedBy: input.userId } }
      : { $set: { updatedBy: input.userId }, $inc: { refundedAmount: input.refundAmount } }
  );
}
