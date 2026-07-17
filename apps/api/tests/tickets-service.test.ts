import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  saleFindOneAndUpdate: vi.fn(), saleUpdateOne: vi.fn(), typeFindOneAndUpdate: vi.fn(), typeUpdateOne: vi.fn(),
  orderFindOne: vi.fn(), orderFind: vi.fn(), orderCreate: vi.fn(), ticketInsertMany: vi.fn(), ticketFindOneAndUpdate: vi.fn()
}));
vi.mock('../src/modules/tickets/ticket.models', () => ({
  TicketPublication: { findOneAndUpdate: mocks.saleFindOneAndUpdate, updateOne: mocks.saleUpdateOne },
  TicketType: { findOneAndUpdate: mocks.typeFindOneAndUpdate, updateOne: mocks.typeUpdateOne },
  TicketOrder: { findOne: mocks.orderFindOne, find: mocks.orderFind, create: mocks.orderCreate },
  DigitalTicket: { insertMany: mocks.ticketInsertMany, findOneAndUpdate: mocks.ticketFindOneAndUpdate }
}));
import { claimTicketCheckIn, reservePublicOrder } from '../src/modules/tickets/ticket.service';

const sale = { _id: '507f1f77bcf86cd799439011', status: 'active', capacity: 1, reservedCount: 0, soldCount: 0, maxTicketsPerOrder: 2, allowFreeTickets: true };

describe('ticket capacity and QR concurrency', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.orderFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }); mocks.orderFind.mockResolvedValue([]); mocks.orderCreate.mockImplementation(async (data) => ({ ...data, _id: '507f1f77bcf86cd799439099' })); mocks.ticketInsertMany.mockResolvedValue([]); mocks.saleUpdateOne.mockResolvedValue({}); mocks.typeUpdateOne.mockResolvedValue({}); });

  it('admits only one concurrent reservation when the last seat is requested', async () => {
    let typeReserved = 0; let saleReserved = 0;
    mocks.typeFindOneAndUpdate.mockImplementation(async (_query: any, update: any) => {
      const quantity = update.$inc.reservedCount;
      if (typeReserved + quantity > 1) return null;
      typeReserved += quantity; return { _id: '507f1f77bcf86cd799439014', name: 'General', price: 100, capacity: 1, reservedCount: typeReserved, soldCount: 0, maxPerOrder: 2 };
    });
    mocks.saleFindOneAndUpdate.mockImplementation(async (_query: any, update: any) => {
      const quantity = update.$inc.reservedCount;
      if (saleReserved + quantity > 1) return null;
      saleReserved += quantity; return { ...sale, reservedCount: saleReserved };
    });
    const input = (idempotencyKey: string) => reservePublicOrder({ publication: sale, buyer: { name: 'Ana', email: 'ana@example.com' }, selections: [{ ticketTypeId: '507f1f77bcf86cd799439014', quantity: 1 }], idempotencyKey });
    const results = await Promise.allSettled([input('idempotency-0001'), input('idempotency-0002')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(saleReserved).toBe(1);
  });

  it('consumes a QR only once through the conditional valid-to-used transition', async () => {
    let status = 'valid';
    mocks.ticketFindOneAndUpdate.mockImplementation(async (_query: any) => {
      if (status !== 'valid') return null;
      status = 'used'; return { _id: '507f1f77bcf86cd799439015', status };
    });
    const [first, second] = await Promise.all([claimTicketCheckIn('507f1f77bcf86cd799439011', 'secure-ticket-token-123456789', '507f1f77bcf86cd799439016'), claimTicketCheckIn('507f1f77bcf86cd799439011', 'secure-ticket-token-123456789', '507f1f77bcf86cd799439016')]);
    expect(first).toMatchObject({ status: 'used' });
    expect(second).toBeNull();
  });

  it('immediately converts a free reservation into sold capacity', async () => {
    mocks.typeFindOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439014', name: 'Cortesía', price: 0, capacity: 5, maxPerOrder: 5 });
    mocks.saleFindOneAndUpdate.mockResolvedValue({ ...sale, capacity: 5, reservedCount: 1 });
    await reservePublicOrder({ publication: { ...sale, capacity: 5 }, buyer: { name: 'Ana', email: 'ana@example.com' }, selections: [{ ticketTypeId: '507f1f77bcf86cd799439014', quantity: 1 }], idempotencyKey: 'free-order-idempotency-001' });
    expect(mocks.typeUpdateOne).toHaveBeenCalledWith({ _id: '507f1f77bcf86cd799439014' }, { $inc: { reservedCount: -1, soldCount: 1 } });
    expect(mocks.saleUpdateOne).toHaveBeenCalledWith({ _id: sale._id }, { $inc: { reservedCount: -1, soldCount: 1 } });
  });
});
