import { Contract, ContractAddendum, Payment } from './crm.models';
import { ApiError } from '../../middlewares/errorHandler';

/**
 * Single source of truth for contract financial math (§5 of the Phase 2 plan).
 * `recalculateContractPayments` and `recalculateContractTotals` keep their historical
 * names/behavior (each recalculates the piece its trigger actually changed) so existing
 * consumers/tests are unaffected. The atomic reservation helpers below are the new
 * concurrency-safe gate that protects `balanceAmount`/`refundedAmount` from races and
 * from unvalidated frontend-supplied amounts.
 */

const balanceTypes = new Set(['deposit', 'installment', 'balance', 'addendum', 'extra', 'adjustment', 'refund', 'other']);
export const nonPayableContractStatuses = new Set(['cancelled', 'superseded']);

export function amount(value: unknown): number {
  return Number(value || 0);
}

export function defaultAffectsContractBalance(type?: string): boolean {
  return Boolean(type && balanceTypes.has(type)) && type !== 'security_deposit';
}

function signedAmount(payment: any): number {
  if (payment.status !== 'paid' || !payment.affectsContractBalance) return 0;
  const value = amount(payment.amount);
  return payment.type === 'refund' ? -value : value;
}

export async function recalculateContractPayments(contractId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  const payments = await Payment.find({ contractId, deletedAt: null });
  const paidAmount = payments.reduce((sum: number, payment: any) => sum + signedAmount(payment), 0);
  contract.paidAmount = Math.max(0, paidAmount);
  contract.balanceAmount = amount(contract.totalAmount) - amount(contract.paidAmount);
  await contract.save();
  return contract;
}

export async function recalculateContractTotals(contractId: string): Promise<any> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null });
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  const addendums = await ContractAddendum.find({ contractId, deletedAt: null });
  const approvedAddendumsAmount = addendums.filter((item: any) => item.status === 'approved').reduce((sum: number, item: any) => sum + amount(item.totalAmount), 0);
  const pendingAddendumsAmount = addendums.filter((item: any) => ['draft', 'pending_approval'].includes(item.status)).reduce((sum: number, item: any) => sum + amount(item.totalAmount), 0);
  contract.approvedAddendumsAmount = approvedAddendumsAmount;
  contract.pendingAddendumsAmount = pendingAddendumsAmount;
  contract.totalAmount = amount(contract.baseAmount) + approvedAddendumsAmount - amount(contract.discountsAmount);
  contract.balanceAmount = amount(contract.totalAmount) - amount(contract.paidAmount);
  await contract.save();
  return contract;
}

export async function computeFinancialSummary(query: Record<string, unknown>): Promise<Record<string, number>> {
  const payments = await Payment.find({ ...query, deletedAt: null });
  const paidAmount = Math.max(0, payments.reduce((sum: number, payment: any) => sum + signedAmount(payment), 0));
  const refundedAmount = payments.reduce((sum: number, payment: any) => sum + (payment.status === 'paid' && payment.type === 'refund' ? amount(payment.amount) : 0), 0);
  const pendingAmount = payments.filter((payment: any) => payment.status === 'pending' && payment.affectsContractBalance).reduce((sum: number, payment: any) => sum + amount(payment.amount), 0);
  const securityDepositAmount = payments.filter((payment: any) => payment.status === 'paid' && payment.type === 'security_deposit').reduce((sum: number, payment: any) => sum + amount(payment.amount), 0);
  const overdueAmount = payments.filter((payment: any) => payment.status === 'pending' && payment.dueDate && new Date(payment.dueDate) < new Date()).reduce((sum: number, payment: any) => sum + amount(payment.amount), 0);
  return { paidAmount, refundedAmount, pendingAmount, securityDepositAmount, overdueAmount };
}

export async function explainBalance(contractId: string): Promise<Record<string, number>> {
  const contract: any = await Contract.findOne({ _id: contractId, deletedAt: null }).lean();
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  return {
    baseAmount: amount(contract.baseAmount),
    approvedAddendumsAmount: amount(contract.approvedAddendumsAmount),
    pendingAddendumsAmount: amount(contract.pendingAddendumsAmount),
    discountsAmount: amount(contract.discountsAmount),
    totalAmount: amount(contract.totalAmount),
    paidAmount: amount(contract.paidAmount),
    balanceAmount: amount(contract.balanceAmount)
  };
}

/**
 * Atomic, single-document reservation that closes the concurrent-overpayment race:
 * two simultaneous requests reading the same `balanceAmount` can no longer both pass
 * validation, because the filter's `balanceAmount: { $gte: requestedAmount }` is
 * evaluated by MongoDB against the already-updated value for whichever request wins.
 * `recalculateContractPayments` remains the authoritative reconciliation step called
 * right after (see payments.service.ts) — this reservation is only the concurrency gate.
 */
export async function reserveContractBalance(
  contractId: string,
  requestedAmount: number,
  options: { allowOverpayment?: boolean } = {}
): Promise<{ contract: any; previousBalance: number; resultingBalance: number }> {
  const filter: Record<string, unknown> = { _id: contractId, deletedAt: null, status: { $nin: Array.from(nonPayableContractStatuses) } };
  if (!options.allowOverpayment) filter.balanceAmount = { $gte: requestedAmount };
  const updated: any = await Contract.findOneAndUpdate(filter, { $inc: { paidAmount: requestedAmount, balanceAmount: -requestedAmount } }, { new: true });
  if (!updated) {
    const existing: any = await Contract.findOne({ _id: contractId, deletedAt: null });
    if (!existing) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
    if (nonPayableContractStatuses.has(existing.status)) throw new ApiError(422, 'CONTRACT_NOT_PAYABLE');
    throw new ApiError(422, 'PAYMENT_EXCEEDS_BALANCE');
  }
  return { contract: updated, previousBalance: amount(updated.balanceAmount) + requestedAmount, resultingBalance: amount(updated.balanceAmount) };
}

/** Compensates a reservation when the Payment record could not be persisted afterward. */
export async function releaseContractBalance(contractId: string, releasedAmount: number): Promise<void> {
  await Contract.findOneAndUpdate({ _id: contractId, deletedAt: null }, { $inc: { paidAmount: -releasedAmount, balanceAmount: releasedAmount } });
}

/**
 * Same atomic-reservation pattern applied to a single Payment's `refundedAmount`,
 * so two concurrent refund requests against the same payment can't together exceed
 * what was actually paid. Marks the original as `refunded` once fully reimbursed.
 */
export async function reserveRefundAmount(
  originalPaymentId: string,
  requestedAmount: number,
  options: { allowExcessRefund?: boolean } = {}
): Promise<{ payment: any; previousRefundable: number; resultingRefundable: number }> {
  const filter: Record<string, unknown> = { _id: originalPaymentId, deletedAt: null, status: 'paid', type: { $ne: 'refund' } };
  if (!options.allowExcessRefund) filter.$expr = { $lte: [{ $add: ['$refundedAmount', requestedAmount] }, '$amount'] };
  const updated: any = await Payment.findOneAndUpdate(filter, { $inc: { refundedAmount: requestedAmount } }, { new: true });
  if (!updated) {
    const existing: any = await Payment.findOne({ _id: originalPaymentId, deletedAt: null });
    if (!existing) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
    if (existing.status !== 'paid' || existing.type === 'refund') throw new ApiError(422, 'PAYMENT_NOT_REFUNDABLE');
    throw new ApiError(422, 'PAYMENT_REFUND_EXCEEDS_ORIGINAL');
  }
  if (amount(updated.refundedAmount) >= amount(updated.amount) && updated.status !== 'refunded') {
    updated.status = 'refunded';
    await updated.save();
  }
  const resultingRefundable = amount(updated.amount) - amount(updated.refundedAmount);
  return { payment: updated, previousRefundable: resultingRefundable + requestedAmount, resultingRefundable };
}

/** Compensates a refund reservation when the refund Payment record could not be persisted. */
export async function releaseRefundAmount(originalPaymentId: string, releasedAmount: number): Promise<void> {
  await Payment.findOneAndUpdate({ _id: originalPaymentId, deletedAt: null }, { $inc: { refundedAmount: -releasedAmount }, $set: { status: 'paid' } });
}
