import { describe, expect, it } from 'vitest';
import { DigitalTicket, TicketOrder, TicketSale, TicketType } from '../src/modules/tickets/ticket.models';

describe('ticket models', () => {
  it('keeps public ticket identifiers non-sequential and validates sale counters', () => {
    const sale = new TicketSale({ eventId: '507f1f77bcf86cd799439011', salonId: '507f1f77bcf86cd799439012', slug: 'fiesta-2026', capacity: 100 });
    const ticket = new DigitalTicket({ saleId: sale._id, orderId: '507f1f77bcf86cd799439013', eventId: sale.eventId, ticketTypeId: '507f1f77bcf86cd799439014', publicToken: 'random-public-token-value-1234', qrPayload: 'random-public-token-value-1234' });
    expect(sale.status).toBe('draft');
    expect(ticket.status).toBe('reserved');
    expect(ticket.publicToken).not.toBe(String(ticket._id));
  });

  it('uses a sale-scoped idempotency unique index and typed capacity counters', () => {
    const indexes = TicketOrder.schema.indexes();
    expect(indexes.some(([keys, options]) => keys.saleId === 1 && keys.idempotencyKey === 1 && options.unique)).toBe(true);
    const type = new TicketType({ saleId: '507f1f77bcf86cd799439011', name: 'General', price: 1000, capacity: 10 });
    expect(type.reservedCount).toBe(0);
    expect(type.soldCount).toBe(0);
  });
});
