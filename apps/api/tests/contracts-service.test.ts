import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contractCount: vi.fn(),
  contractFindOne: vi.fn(),
  contractCreate: vi.fn(),
  eventFindOne: vi.fn(),
  eventFindOneAndUpdate: vi.fn(),
  addendumCount: vi.fn(),
  addendumFind: vi.fn(),
  addendumFindOne: vi.fn(),
  addendumCreate: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  Contract: { countDocuments: mocks.contractCount, findOne: mocks.contractFindOne, create: mocks.contractCreate },
  ContractAddendum: { countDocuments: mocks.addendumCount, find: mocks.addendumFind, findOne: mocks.addendumFindOne, create: mocks.addendumCreate },
  Event: { findOne: mocks.eventFindOne, findOneAndUpdate: mocks.eventFindOneAndUpdate }
}));

import { ApiError } from '../src/middlewares/errorHandler';
import { approveAddendum, approveContract, createAddendum, createContractFromEvent } from '../src/modules/crm/event-to-contract.service';

function eventQuery(event: any) {
  return { populate: vi.fn().mockReturnThis(), then: undefined, exec: undefined, [Symbol.toStringTag]: 'MockQuery', lean: vi.fn(), catch: undefined, finally: undefined, then: (resolve: (value: any) => unknown) => resolve(event) };
}
function populateChain(value: unknown) {
  return { populate: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) };
}

describe('event to contract service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.contractCount.mockResolvedValue(0);
    mocks.contractFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mocks.addendumCount.mockResolvedValue(0);
    mocks.addendumFind.mockResolvedValue([]);
  });

  it('creates a contract from a complete event and stores snapshots', async () => {
    const event = completeEvent();
    mocks.eventFindOne.mockReturnValue(eventQuery(event));
    mocks.contractCreate.mockResolvedValue({ _id: 'contract-1', contractNumber: 'C-2026-00001', eventId: event._id, commercialSnapshot: { totalAmount: 100000 } });

    const result = await createContractFromEvent({ eventId: 'event-1', userId: 'user-1' });

    expect(result.created).toBe(true);
    expect(mocks.contractCreate).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-1',
      customerId: 'customer-1',
      salonId: 'salon-1',
      status: 'pending_approval',
      baseAmount: 100000,
      totalAmount: 100000,
      paidAmount: 0,
      balanceAmount: 100000,
      customerSnapshot: expect.objectContaining({ fullName: 'Ana Perez', phone: '2215551111' }),
      eventSnapshot: expect.objectContaining({ eventType: 'Cumpleaños', salonName: 'Salón Centro' }),
      commercialSnapshot: expect.objectContaining({ totalAmount: 100000, depositAmount: 20000 }),
      menuSnapshot: [{ title: 'Recepción', items: ['Entrada'] }],
      servicesSnapshot: ['DJ']
    }));
    expect(event.status).toBe('contract_draft');
    expect(event.save).toHaveBeenCalled();
  });

  it('does not create a contract from an incomplete event', async () => {
    mocks.eventFindOne.mockReturnValue(eventQuery({ ...completeEvent(), eventDate: undefined }));

    await expect(createContractFromEvent({ eventId: 'event-1', userId: 'user-1' })).rejects.toBeInstanceOf(ApiError);
    expect(mocks.contractCreate).not.toHaveBeenCalled();
  });

  it('is idempotent and returns the active contract for the event', async () => {
    const existing = { _id: 'contract-1', eventId: 'event-1', deletedAt: null };
    mocks.eventFindOne.mockReturnValue(eventQuery(completeEvent()));
    mocks.contractFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(existing) });

    const result = await createContractFromEvent({ eventId: 'event-1', userId: 'user-1' });

    expect(result).toEqual({ contract: existing, created: false });
    expect(mocks.contractCreate).not.toHaveBeenCalled();
  });

  it('does not modify the source quote when taking contract snapshots', async () => {
    const quote = { _id: 'quote-1', quoteNumber: 'P-1', save: vi.fn() };
    mocks.eventFindOne.mockReturnValue(eventQuery({ ...completeEvent(), quoteId: quote }));
    mocks.contractCreate.mockResolvedValue({ _id: 'contract-1' });

    await createContractFromEvent({ eventId: 'event-1', userId: 'user-1' });

    expect(quote.save).not.toHaveBeenCalled();
  });

  it('approves a contract and sets approval metadata', async () => {
    const contract = { _id: 'contract-1', status: 'pending_approval', customerSnapshot: { fullName: 'Ana Perez' }, eventSnapshot: { eventDate: new Date(), guestCount: 100 }, baseAmount: 100000, totalAmount: 100000, paidAmount: 20000, discountsAmount: 0, save: vi.fn().mockResolvedValue(undefined) };
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.addendumFind.mockResolvedValue([]);

    const result = await approveContract('contract-1', 'user-1');

    expect(result.status).toBe('approved');
    expect(result.approvedAt).toBeInstanceOf(Date);
    expect(contract.save).toHaveBeenCalled();
  });

  it('creates pending addendum without changing contract balance', async () => {
    const contract = { _id: 'contract-1', contractNumber: 'C-2026-00001', eventId: 'event-1', customerId: 'customer-1', salonId: 'salon-1', status: 'approved', baseAmount: 100000, paidAmount: 20000, discountsAmount: 0, save: vi.fn().mockResolvedValue(undefined) };
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.addendumCreate.mockResolvedValue({ _id: 'addendum-1', status: 'pending_approval', totalAmount: 15000 });
    mocks.addendumFind.mockResolvedValue([{ status: 'pending_approval', totalAmount: 15000 }]);

    const result = await createAddendum('contract-1', { title: 'Bebidas', items: [{ name: 'Barra', quantity: 1, unitPrice: 15000 }] }, 'user-1');

    expect(result.status).toBe('pending_approval');
    expect(contract.pendingAddendumsAmount).toBe(15000);
    expect(contract.totalAmount).toBe(100000);
    expect(contract.balanceAmount).toBe(80000);
  });

  it('approves addendum and recalculates contract total and balance', async () => {
    const contract = { _id: 'contract-1', status: 'approved', baseAmount: 100000, paidAmount: 20000, discountsAmount: 0, save: vi.fn().mockResolvedValue(undefined) };
    const addendum = { _id: 'addendum-1', contractId: { toString: () => 'contract-1' }, status: 'pending_approval', items: [{ name: 'Barra' }], totalAmount: 15000, save: vi.fn().mockResolvedValue(undefined) };
    mocks.addendumFindOne.mockResolvedValue(addendum);
    mocks.contractFindOne.mockResolvedValue(contract);
    mocks.addendumFind.mockResolvedValue([{ status: 'approved', totalAmount: 15000 }]);

    await approveAddendum('addendum-1', 'user-1');

    expect(addendum.status).toBe('approved');
    expect(addendum.affectsBalance).toBe(true);
    expect(contract.approvedAddendumsAmount).toBe(15000);
    expect(contract.totalAmount).toBe(115000);
    expect(contract.balanceAmount).toBe(95000);
  });
});

function completeEvent() {
  return {
    _id: 'event-1',
    customerId: { _id: 'customer-1', fullName: 'Ana Perez', phone: '2215551111', email: 'ana@mail.com' },
    salonId: { _id: 'salon-1', name: 'Salón Centro', address: 'Calle 1', city: 'La Plata', defaultDepositAmount: 5000, defaultLateFeePercentage: 5 },
    quoteId: { _id: 'quote-1', quoteNumber: 'P-1', durationHours: 8 },
    eventType: 'Cumpleaños',
    eventName: 'Cumpleaños - Ana',
    eventDate: new Date('2026-10-10T00:00:00.000Z'),
    startTime: '21:00',
    endTime: '05:00',
    guestCount: 100,
    finalAmount: 100000,
    commercialSnapshot: { packageName: 'Classic', pricePerPerson: 1000, totalAmount: 100000, depositAmount: 20000, balanceAmount: 80000 },
    menuSnapshot: [{ title: 'Recepción', items: ['Entrada'] }],
    servicesSnapshot: ['DJ'],
    save: vi.fn().mockResolvedValue(undefined)
  };
}
