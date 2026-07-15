import { Contract, Payment } from './crm.models';
import { ApiError } from '../../middlewares/errorHandler';

const balanceTypes = new Set(['deposit', 'installment', 'balance', 'addendum', 'extra', 'adjustment', 'refund', 'other']);
const refundableStatuses = new Set(['paid']);

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
};

function amount(value: unknown): number {
  return Number(value || 0);
}

function defaultAffectsContractBalance(type?: string): boolean {
  return Boolean(type && balanceTypes.has(type)) && type !== 'security_deposit';
}

function signedAmount(payment: any): number {
  if (payment.status !== 'paid' || !payment.affectsContractBalance) return 0;
  const value = amount(payment.amount);
  return payment.type === 'refund' ? -value : value;
}

async function nextPaymentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await Payment.countDocuments({ paymentNumber: { $regex: `^PAY-${year}-` } });
  return `PAY-${year}-${String(count + 1).padStart(5, '0')}`;
}

export async function recalculateContractPayments(contractId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  const payments = await Payment.find({ contractId, deletedAt: null });
  const paidAmount = payments.reduce((sum: number, payment: any) => sum + signedAmount(payment), 0);
  contract.paidAmount = Math.max(0, paidAmount);
  contract.balanceAmount = Number(contract.totalAmount || 0) - Number(contract.paidAmount || 0);
  await contract.save();
  return contract;
}

export async function paymentSummary(query: Record<string, unknown>): Promise<Record<string, number>> {
  const payments = await Payment.find({ ...query, deletedAt: null });
  const paidAmount = Math.max(0, payments.reduce((sum: number, payment: any) => sum + signedAmount(payment), 0));
  const refundedAmount = payments.reduce((sum: number, payment: any) => sum + (payment.status === 'paid' && payment.type === 'refund' ? amount(payment.amount) : 0), 0);
  const pendingAmount = payments.filter((payment: any) => payment.status === 'pending' && payment.affectsContractBalance).reduce((sum: number, payment: any) => sum + amount(payment.amount), 0);
  const securityDepositAmount = payments.filter((payment: any) => payment.status === 'paid' && payment.type === 'security_deposit').reduce((sum: number, payment: any) => sum + amount(payment.amount), 0);
  const overdueAmount = payments.filter((payment: any) => payment.status === 'pending' && payment.dueDate && new Date(payment.dueDate) < new Date()).reduce((sum: number, payment: any) => sum + amount(payment.amount), 0);
  return { paidAmount, refundedAmount, pendingAmount, securityDepositAmount, overdueAmount };
}

async function contractForPayment(contractId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  if (contract.status === 'cancelled') throw new ApiError(422, 'CONTRACT_CANCELLED');
  return contract;
}

export async function createPayment(payload: PaymentPayload, userId: string): Promise<any> {
  if (!payload.contractId) throw new ApiError(422, 'PAYMENT_CONTRACT_REQUIRED');
  const contract = await contractForPayment(payload.contractId);
  const type = payload.type ?? 'installment';
  const status = payload.status ?? 'pending';
  if (status === 'paid' && !payload.method) throw new ApiError(422, 'PAYMENT_METHOD_REQUIRED');
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
    affectsContractBalance: payload.affectsContractBalance ?? defaultAffectsContractBalance(type),
    createdBy: userId,
    updatedBy: userId
  });
  await recalculateContractPayments(contract._id.toString());
  return payment;
}

export async function updatePayment(paymentId: string, payload: PaymentPayload, userId: string): Promise<any> {
  const payment: any = await Payment.findOne({ _id: paymentId, deletedAt: null });
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  if (payment.status === 'paid') {
    const allowed = ['receiptNumber', 'reference', 'notes'];
    const forbidden = Object.keys(payload).filter((key) => !allowed.includes(key));
    if (forbidden.length) throw new ApiError(422, 'PAYMENT_PAID_LOCKED');
  }
  if (payload.status === 'paid' && !payload.method && !payment.method) throw new ApiError(422, 'PAYMENT_METHOD_REQUIRED');
  Object.assign(payment, payload, {
    affectsContractBalance: payload.affectsContractBalance ?? payment.affectsContractBalance ?? defaultAffectsContractBalance(payload.type ?? payment.type),
    paidAt: payload.status === 'paid' && !payment.paidAt ? new Date() : payload.paidAt ?? payment.paidAt,
    updatedBy: userId
  });
  await payment.save();
  await recalculateContractPayments(payment.contractId.toString());
  return payment;
}

export async function markPaymentPaid(paymentId: string, payload: PaymentPayload, userId: string): Promise<any> {
  const payment: any = await Payment.findOne({ _id: paymentId, deletedAt: null });
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  if (!payload.method && !payment.method) throw new ApiError(422, 'PAYMENT_METHOD_REQUIRED');
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
}

export async function cancelPayment(paymentId: string, userId: string): Promise<any> {
  const payment: any = await Payment.findOne({ _id: paymentId, deletedAt: null });
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  if (payment.status === 'refunded') throw new ApiError(422, 'PAYMENT_REFUNDED_LOCKED');
  payment.status = 'cancelled';
  payment.cancelledAt = payment.cancelledAt ?? new Date();
  payment.cancelledBy = userId;
  payment.updatedBy = userId;
  await payment.save();
  await recalculateContractPayments(payment.contractId.toString());
  return payment;
}

export async function refundPayment(paymentId: string, payload: PaymentPayload, userId: string): Promise<any> {
  const original: any = await Payment.findOne({ _id: paymentId, deletedAt: null });
  if (!original) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  if (!refundableStatuses.has(original.status) || original.type === 'refund') throw new ApiError(422, 'PAYMENT_NOT_REFUNDABLE');
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
    amount: payload.amount ?? original.amount,
    paidAt: payload.paidAt ?? new Date(),
    receiptNumber: payload.receiptNumber,
    reference: payload.reference ?? `Reembolso de ${original.paymentNumber}`,
    notes: payload.notes,
    affectsContractBalance: true,
    refundedPaymentId: original._id,
    createdBy: userId,
    updatedBy: userId
  });
  await recalculateContractPayments(original.contractId.toString());
  return { payment: refund, originalPayment: original };
}
