import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contractFindOne: vi.fn(),
  contractFindOneAndUpdate: vi.fn(),
  paymentCount: vi.fn(),
  paymentFind: vi.fn(),
  paymentFindOne: vi.fn(),
  paymentFindOneAndUpdate: vi.fn(),
  paymentCreate: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  Contract: { findOne: mocks.contractFindOne, findOneAndUpdate: mocks.contractFindOneAndUpdate },
  Payment: { countDocuments: mocks.paymentCount, find: mocks.paymentFind, findOne: mocks.paymentFindOne, findOneAndUpdate: mocks.paymentFindOneAndUpdate, create: mocks.paymentCreate }
}));

import { ApiError } from '../src/middlewares/errorHandler';
import { cancelPayment, createPayment, markPaymentPaid, paymentSummary, recalculateContractPayments, refundPayment, updatePayment } from '../src/modules/crm/payments.service';

describe('payments service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.paymentCount.mockResolvedValue(0);
  });

  it('creates a pending payment without changing paid amount', async () => {
    const contract = contractDoc({ totalAmount: 100000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.paymentCreate.mockResolvedValue({ _id: 'payment-1', contractId: contract._id, status: 'pending', amount: 20000, type: 'deposit', affectsContractBalance: true });
    mocks.paymentFind.mockResolvedValue([{ status: 'pending', amount: 20000, type: 'deposit', affectsContractBalance: true }]);

    await createPayment({ contractId: 'contract-1', amount: 20000, type: 'deposit', status: 'pending' }, 'user-1');

    expect(contract.paidAmount).toBe(0);
    expect(contract.balanceAmount).toBe(100000);
    expect(mocks.contractFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('counts paid contract payments against balance', async () => {
    const contract = contractDoc({ totalAmount: 100000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.paymentFind.mockResolvedValue([{ status: 'paid', amount: 25000, type: 'deposit', affectsContractBalance: true }]);

    await recalculateContractPayments('contract-1');

    expect(contract.paidAmount).toBe(25000);
    expect(contract.balanceAmount).toBe(75000);
  });

  it('keeps security deposits outside contract balance', async () => {
    const contract = contractDoc({ totalAmount: 100000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.paymentCreate.mockResolvedValue({ _id: 'payment-1', contractId: contract._id, status: 'paid', amount: 10000, type: 'security_deposit', affectsContractBalance: false });
    mocks.paymentFind.mockResolvedValue([{ status: 'paid', amount: 10000, type: 'security_deposit', affectsContractBalance: false }]);

    await createPayment({ contractId: 'contract-1', amount: 10000, type: 'security_deposit', status: 'paid', method: 'cash' }, 'user-1');

    expect(contract.paidAmount).toBe(0);
    expect(contract.balanceAmount).toBe(100000);
    expect(mocks.contractFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('creates a paid payment exactly matching the outstanding balance', async () => {
    const contract = contractDoc({ totalAmount: 100000, balanceAmount: 20000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.contractFindOneAndUpdate.mockResolvedValue({ _id: { toString: () => 'contract-1' }, balanceAmount: 0 });
    mocks.paymentCreate.mockResolvedValue({ _id: 'payment-1', contractId: contract._id, status: 'paid', amount: 20000, type: 'balance', affectsContractBalance: true });
    mocks.paymentFind.mockResolvedValue([{ status: 'paid', amount: 20000, type: 'balance', affectsContractBalance: true }]);

    const payment = await createPayment({ contractId: 'contract-1', amount: 20000, type: 'balance', status: 'paid', method: 'cash' }, 'user-1');

    expect(payment._id).toBe('payment-1');
    expect(mocks.contractFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'contract-1', balanceAmount: { $gte: 20000 } }),
      { $inc: { paidAmount: 20000, balanceAmount: -20000 } },
      { new: true }
    );
  });

  it('rejects a paid payment that exceeds the outstanding balance', async () => {
    mocks.contractFindOne
      .mockResolvedValueOnce(contractDoc({ totalAmount: 100000, balanceAmount: 20000 }))
      .mockResolvedValueOnce({ status: 'approved' });
    mocks.contractFindOneAndUpdate.mockResolvedValue(null);

    await expect(createPayment({ contractId: 'contract-1', amount: 50000, type: 'balance', status: 'paid', method: 'cash' }, 'user-1')).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_BALANCE' });
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
  });

  it('requires an override reason before authorizing an overpayment', async () => {
    mocks.contractFindOne.mockResolvedValue(contractDoc({ totalAmount: 100000, balanceAmount: 20000 }));

    await expect(createPayment({ contractId: 'contract-1', amount: 50000, type: 'balance', status: 'paid', method: 'cash', allowOverpayment: true }, 'user-1')).rejects.toMatchObject({ code: 'PAYMENT_OVERRIDE_REASON_REQUIRED' });
    expect(mocks.contractFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows an authorized overpayment when a reason is provided', async () => {
    const contract = contractDoc({ totalAmount: 100000, balanceAmount: 20000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.contractFindOneAndUpdate.mockResolvedValue({ _id: { toString: () => 'contract-1' }, balanceAmount: -30000 });
    mocks.paymentCreate.mockResolvedValue({ _id: 'payment-1', contractId: contract._id, status: 'paid', amount: 50000, type: 'balance', affectsContractBalance: true });
    mocks.paymentFind.mockResolvedValue([{ status: 'paid', amount: 50000, type: 'balance', affectsContractBalance: true }]);

    const payment = await createPayment({ contractId: 'contract-1', amount: 50000, type: 'balance', status: 'paid', method: 'cash', allowOverpayment: true, overrideReason: 'El cliente adelantó la última cuota.' }, 'user-1');

    expect(payment._id).toBe('payment-1');
    expect(mocks.contractFindOneAndUpdate).toHaveBeenCalledWith(
      expect.not.objectContaining({ balanceAmount: expect.anything() }),
      { $inc: { paidAmount: 50000, balanceAmount: -50000 } },
      { new: true }
    );
  });

  it('rejects a payment against a superseded contract', async () => {
    mocks.contractFindOne.mockResolvedValue({ status: 'superseded' });

    await expect(createPayment({ contractId: 'contract-1', amount: 1000, type: 'balance' }, 'user-1')).rejects.toMatchObject({ code: 'CONTRACT_NOT_PAYABLE' });
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
  });

  it('rejects an invalid status transition from cancelled to paid', async () => {
    mocks.paymentFindOne.mockResolvedValue({ _id: 'payment-1', status: 'cancelled', contractId: { toString: () => 'contract-1' } });

    await expect(updatePayment('payment-1', { status: 'paid', method: 'cash' }, 'user-1')).rejects.toMatchObject({ code: 'PAYMENT_INVALID_STATUS_TRANSITION' });
    expect(mocks.contractFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires a reason to cancel a payment', async () => {
    await expect(cancelPayment('payment-1', 'user-1', '')).rejects.toMatchObject({ code: 'PAYMENT_CANCELLATION_REASON_REQUIRED' });
    expect(mocks.paymentFindOne).not.toHaveBeenCalled();
  });

  it('records refund as a negative movement and restores balance', async () => {
    const contract = contractDoc({ totalAmount: 100000 });
    const original = { _id: 'payment-1', paymentNumber: 'PAY-2026-00001', contractId: { toString: () => 'contract-1' }, customerId: 'customer-1', eventId: 'event-1', salonId: 'salon-1', status: 'paid', type: 'deposit', method: 'cash', amount: 20000 };
    mocks.paymentFindOne.mockResolvedValue(original);
    mocks.paymentFindOneAndUpdate.mockResolvedValue({ ...original, amount: 20000, refundedAmount: 20000, save: vi.fn().mockResolvedValue(undefined) });
    mocks.paymentCreate.mockResolvedValue({ _id: 'payment-2', type: 'refund', amount: 20000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.paymentFind.mockResolvedValue([
      { status: 'paid', amount: 20000, type: 'deposit', affectsContractBalance: true },
      { status: 'paid', amount: 20000, type: 'refund', affectsContractBalance: true }
    ]);

    await refundPayment('payment-1', { reason: 'El cliente canceló el evento.' }, 'user-1');

    expect(contract.paidAmount).toBe(0);
    expect(contract.balanceAmount).toBe(100000);
  });

  it('marks the original payment as refunded once fully reimbursed', async () => {
    const original = { _id: 'payment-1', paymentNumber: 'PAY-2026-00001', contractId: { toString: () => 'contract-1' }, customerId: 'customer-1', eventId: 'event-1', salonId: 'salon-1', status: 'paid', type: 'deposit', method: 'cash', amount: 20000 };
    const updatedOriginal = { ...original, amount: 20000, refundedAmount: 20000, status: 'paid', save: vi.fn().mockResolvedValue(undefined) };
    mocks.paymentFindOne.mockResolvedValue(original);
    mocks.paymentFindOneAndUpdate.mockResolvedValue(updatedOriginal);
    mocks.paymentCreate.mockResolvedValue({ _id: 'payment-2', type: 'refund', amount: 20000 });
    mocks.contractFindOne.mockResolvedValue(contractDoc({ totalAmount: 100000 }));
    mocks.paymentFind.mockResolvedValue([]);

    await refundPayment('payment-1', { reason: 'Reembolso total.' }, 'user-1');

    expect(updatedOriginal.status).toBe('refunded');
    expect(updatedOriginal.save).toHaveBeenCalled();
  });

  it('rejects a refund that exceeds the amount still available to refund', async () => {
    mocks.paymentFindOne.mockResolvedValue({ _id: 'payment-1', status: 'paid', type: 'deposit', amount: 20000 });
    mocks.paymentFindOneAndUpdate.mockResolvedValue(null);

    await expect(refundPayment('payment-1', { amount: 25000, reason: 'Intento de reembolso excesivo.' }, 'user-1')).rejects.toMatchObject({ code: 'PAYMENT_REFUND_EXCEEDS_ORIGINAL' });
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
  });

  it('requires a reason before refunding a payment', async () => {
    await expect(refundPayment('payment-1', {}, 'user-1')).rejects.toMatchObject({ code: 'PAYMENT_CANCELLATION_REASON_REQUIRED' });
    expect(mocks.paymentFindOne).not.toHaveBeenCalled();
  });

  it('recalculates balance when a paid payment is cancelled', async () => {
    const contract = contractDoc({ totalAmount: 115000 });
    const payment = { _id: 'payment-1', contractId: { toString: () => 'contract-1' }, status: 'paid', amount: 20000, save: vi.fn().mockResolvedValue(undefined) };
    mocks.paymentFindOne.mockResolvedValue(payment);
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.paymentFind.mockResolvedValue([{ status: 'cancelled', amount: 20000, type: 'deposit', affectsContractBalance: true }]);

    await cancelPayment('payment-1', 'user-1', 'El cliente pidió cancelar la seña.');

    expect(payment.status).toBe('cancelled');
    expect(payment.cancellationReason).toBe('El cliente pidió cancelar la seña.');
    expect(contract.paidAmount).toBe(0);
    expect(contract.balanceAmount).toBe(115000);
  });

  it('marks a pending payment as paid through markPaymentPaid within the outstanding balance', async () => {
    const payment = { _id: 'payment-1', contractId: { toString: () => 'contract-1' }, status: 'pending', amount: 15000, affectsContractBalance: true, save: vi.fn().mockResolvedValue(undefined) };
    mocks.paymentFindOne.mockResolvedValue(payment);
    mocks.contractFindOneAndUpdate.mockResolvedValue({ _id: { toString: () => 'contract-1' }, balanceAmount: 5000 });
    mocks.contractFindOne.mockResolvedValue(contractDoc({ totalAmount: 100000 }));
    mocks.paymentFind.mockResolvedValue([{ status: 'paid', amount: 15000, type: 'installment', affectsContractBalance: true }]);

    await markPaymentPaid('payment-1', { method: 'cash' }, 'user-1');

    expect(payment.status).toBe('paid');
    expect(mocks.contractFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'contract-1', balanceAmount: { $gte: 15000 } }),
      { $inc: { paidAmount: 15000, balanceAmount: -15000 } },
      { new: true }
    );
  });

  it('reports summary paid amount net of refunds', async () => {
    mocks.paymentFind.mockResolvedValue([
      { status: 'paid', amount: 10000, type: 'deposit', affectsContractBalance: true },
      { status: 'paid', amount: 5000, type: 'refund', affectsContractBalance: true },
      { status: 'paid', amount: 3000, type: 'security_deposit', affectsContractBalance: false }
    ]);

    const summary = await paymentSummary({ contractId: 'contract-1' });

    expect(summary.paidAmount).toBe(5000);
    expect(summary.refundedAmount).toBe(5000);
    expect(summary.securityDepositAmount).toBe(3000);
  });
});

function contractDoc(overrides: Record<string, unknown> = {}) {
  return { _id: { toString: () => 'contract-1' }, eventId: 'event-1', customerId: 'customer-1', salonId: 'salon-1', status: 'approved', totalAmount: 100000, paidAmount: 0, balanceAmount: 100000, save: vi.fn().mockResolvedValue(undefined), ...overrides };
}
