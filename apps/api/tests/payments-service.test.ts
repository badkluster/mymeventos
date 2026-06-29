import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contractFindOne: vi.fn(),
  paymentCount: vi.fn(),
  paymentFind: vi.fn(),
  paymentFindOne: vi.fn(),
  paymentCreate: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  Contract: { findOne: mocks.contractFindOne },
  Payment: { countDocuments: mocks.paymentCount, find: mocks.paymentFind, findOne: mocks.paymentFindOne, create: mocks.paymentCreate }
}));

import { cancelPayment, createPayment, paymentSummary, recalculateContractPayments, refundPayment } from '../src/modules/crm/payments.service';

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
  });

  it('records refund as a negative movement and restores balance', async () => {
    const contract = contractDoc({ totalAmount: 100000 });
    const original = { _id: 'payment-1', paymentNumber: 'PAY-2026-00001', contractId: { toString: () => 'contract-1' }, customerId: 'customer-1', eventId: 'event-1', salonId: 'salon-1', status: 'paid', type: 'deposit', method: 'cash', amount: 20000 };
    mocks.paymentFindOne.mockResolvedValue(original);
    mocks.paymentCreate.mockResolvedValue({ _id: 'payment-2', type: 'refund', amount: 20000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.paymentFind.mockResolvedValue([
      { status: 'paid', amount: 20000, type: 'deposit', affectsContractBalance: true },
      { status: 'paid', amount: 20000, type: 'refund', affectsContractBalance: true }
    ]);

    await refundPayment('payment-1', {}, 'user-1');

    expect(contract.paidAmount).toBe(0);
    expect(contract.balanceAmount).toBe(100000);
  });

  it('recalculates balance when a paid payment is cancelled', async () => {
    const contract = contractDoc({ totalAmount: 115000 });
    const payment = { _id: 'payment-1', contractId: { toString: () => 'contract-1' }, status: 'paid', amount: 20000, save: vi.fn().mockResolvedValue(undefined) };
    mocks.paymentFindOne.mockResolvedValue(payment);
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.paymentFind.mockResolvedValue([{ status: 'cancelled', amount: 20000, type: 'deposit', affectsContractBalance: true }]);

    await cancelPayment('payment-1', 'user-1');

    expect(payment.status).toBe('cancelled');
    expect(contract.paidAmount).toBe(0);
    expect(contract.balanceAmount).toBe(115000);
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
