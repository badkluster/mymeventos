import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contractFindOne: vi.fn(),
  contractFindOneAndUpdate: vi.fn(),
  addendumFind: vi.fn(),
  paymentFind: vi.fn(),
  paymentFindOne: vi.fn(),
  paymentFindOneAndUpdate: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  Contract: { findOne: mocks.contractFindOne, findOneAndUpdate: mocks.contractFindOneAndUpdate },
  ContractAddendum: { find: mocks.addendumFind },
  Payment: { find: mocks.paymentFind, findOne: mocks.paymentFindOne, findOneAndUpdate: mocks.paymentFindOneAndUpdate }
}));

import {
  explainBalance,
  reserveContractBalance,
  recalculateContractPayments,
  recalculateContractTotals
} from '../src/modules/crm/contract-financials.service';

function contractDoc(overrides: Record<string, unknown> = {}) {
  return { _id: { toString: () => 'contract-1' }, baseAmount: 100000, discountsAmount: 0, approvedAddendumsAmount: 0, pendingAddendumsAmount: 0, totalAmount: 100000, paidAmount: 0, balanceAmount: 100000, status: 'approved', save: vi.fn().mockResolvedValue(undefined), ...overrides };
}

describe('contract financials service — single source of truth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('recalculates totals with no addenda', async () => {
    const contract = contractDoc();
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.addendumFind.mockResolvedValue([]);

    await recalculateContractTotals('contract-1');

    expect(contract.totalAmount).toBe(100000);
    expect(contract.balanceAmount).toBe(100000);
  });

  it('adds an approved addendum to the total and reduces the balance accordingly', async () => {
    const contract = contractDoc({ paidAmount: 20000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.addendumFind.mockResolvedValue([{ status: 'approved', totalAmount: 15000 }]);

    await recalculateContractTotals('contract-1');

    expect(contract.approvedAddendumsAmount).toBe(15000);
    expect(contract.totalAmount).toBe(115000);
    expect(contract.balanceAmount).toBe(95000);
  });

  it('does not count a pending addendum toward the total, only toward pendingAddendumsAmount', async () => {
    const contract = contractDoc({ paidAmount: 20000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.addendumFind.mockResolvedValue([{ status: 'pending_approval', totalAmount: 15000 }]);

    await recalculateContractTotals('contract-1');

    expect(contract.pendingAddendumsAmount).toBe(15000);
    expect(contract.approvedAddendumsAmount).toBe(0);
    expect(contract.totalAmount).toBe(100000);
    expect(contract.balanceAmount).toBe(80000);
  });

  it('applies a discount within an addendum (its own totalAmount is already net of the discount)', async () => {
    const contract = contractDoc({ paidAmount: 0 });
    mocks.contractFindOne.mockResolvedValue(contract);
    // An addendum for a 20000 item with a 5000 discount nets to 15000 — the closest analog
    // to a "negative" adjustment, since addenda always add a non-negative amount to the base.
    mocks.addendumFind.mockResolvedValue([{ status: 'approved', totalAmount: 15000 }]);

    await recalculateContractTotals('contract-1');

    expect(contract.totalAmount).toBe(115000);
  });

  it('sums multiple approved addenda together', async () => {
    const contract = contractDoc({ paidAmount: 0 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.addendumFind.mockResolvedValue([
      { status: 'approved', totalAmount: 10000 },
      { status: 'approved', totalAmount: 5000 },
      { status: 'rejected', totalAmount: 999999 },
      { status: 'cancelled', totalAmount: 999999 }
    ]);

    await recalculateContractTotals('contract-1');

    expect(contract.approvedAddendumsAmount).toBe(15000);
    expect(contract.totalAmount).toBe(115000);
  });

  it('produces the same result on repeated recalculation (idempotent)', async () => {
    const contract = contractDoc({ paidAmount: 20000 });
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.addendumFind.mockResolvedValue([{ status: 'approved', totalAmount: 15000 }]);

    await recalculateContractTotals('contract-1');
    const firstPass = { totalAmount: contract.totalAmount, balanceAmount: contract.balanceAmount };
    await recalculateContractTotals('contract-1');

    expect(contract.totalAmount).toBe(firstPass.totalAmount);
    expect(contract.balanceAmount).toBe(firstPass.balanceAmount);
  });

  it('recalculateContractPayments and recalculateContractTotals agree on the same balance formula', async () => {
    const contractForPayments = contractDoc({ totalAmount: 115000, paidAmount: 0, balanceAmount: 115000 });
    mocks.contractFindOne.mockResolvedValue(contractForPayments);
    mocks.paymentFind.mockResolvedValue([{ status: 'paid', amount: 20000, type: 'deposit', affectsContractBalance: true }]);
    await recalculateContractPayments('contract-1');
    expect(contractForPayments.balanceAmount).toBe(95000);

    const contractForTotals = contractDoc({ paidAmount: 20000 });
    mocks.contractFindOne.mockResolvedValue(contractForTotals);
    mocks.addendumFind.mockResolvedValue([{ status: 'approved', totalAmount: 15000 }]);
    await recalculateContractTotals('contract-1');
    expect(contractForTotals.balanceAmount).toBe(95000);
  });

  it('explainBalance reports the stored breakdown without mutating anything', async () => {
    mocks.contractFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ baseAmount: 100000, approvedAddendumsAmount: 15000, pendingAddendumsAmount: 0, discountsAmount: 0, totalAmount: 115000, paidAmount: 20000, balanceAmount: 95000 }) });

    const breakdown = await explainBalance('contract-1');

    expect(breakdown).toEqual({ baseAmount: 100000, approvedAddendumsAmount: 15000, pendingAddendumsAmount: 0, discountsAmount: 0, totalAmount: 115000, paidAmount: 20000, balanceAmount: 95000 });
  });

  describe('reserveContractBalance — concurrency gate', () => {
    it('accepts a reservation that fits within the current balance', async () => {
      mocks.contractFindOneAndUpdate.mockResolvedValue({ _id: { toString: () => 'contract-1' }, balanceAmount: 80000 });

      const result = await reserveContractBalance('contract-1', 20000);

      expect(result.previousBalance).toBe(100000);
      expect(result.resultingBalance).toBe(80000);
      expect(mocks.contractFindOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'contract-1', deletedAt: null, status: { $nin: ['cancelled', 'superseded'] }, balanceAmount: { $gte: 20000 } },
        { $inc: { paidAmount: 20000, balanceAmount: -20000 } },
        { new: true }
      );
    });

    it('simulates two concurrent requests racing for the last available balance: only one may succeed', async () => {
      // First request reads/decrements atomically and wins.
      mocks.contractFindOneAndUpdate.mockResolvedValueOnce({ _id: { toString: () => 'contract-1' }, balanceAmount: 0 });
      const first = await reserveContractBalance('contract-1', 20000);
      expect(first.resultingBalance).toBe(0);

      // Second concurrent request re-evaluates the filter against the now-decremented balance in
      // real MongoDB and finds no match — our mock models that outcome by returning null, then the
      // code falls back to inspecting the contract to report why (insufficient balance, not missing/cancelled).
      mocks.contractFindOneAndUpdate.mockResolvedValueOnce(null);
      mocks.contractFindOne.mockResolvedValue({ status: 'approved' });

      await expect(reserveContractBalance('contract-1', 20000)).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_BALANCE' });
    });

    it('rejects a reservation against a cancelled or superseded contract even with allowOverpayment', async () => {
      mocks.contractFindOneAndUpdate.mockResolvedValue(null);
      mocks.contractFindOne.mockResolvedValue({ status: 'cancelled' });

      await expect(reserveContractBalance('contract-1', 5000, { allowOverpayment: true })).rejects.toMatchObject({ code: 'CONTRACT_NOT_PAYABLE' });
    });
  });
});
