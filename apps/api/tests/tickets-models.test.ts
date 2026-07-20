import { describe, expect, it } from 'vitest';
import { DigitalTicket, TicketOrder, TicketPublication, TicketType } from '../src/modules/tickets/ticket.models';

describe('ticket models', () => {
  it('keeps public ticket identifiers non-sequential and validates sale counters', () => {
    const publication = new TicketPublication({ title: 'Fiesta independiente', startsAt: new Date(), slug: 'fiesta-2026', capacity: 100 });
    const ticket = new DigitalTicket({ publicationId: publication._id, orderId: '507f1f77bcf86cd799439013', ticketTypeId: '507f1f77bcf86cd799439014', publicToken: 'random-public-token-value-1234', qrPayload: 'random-public-token-value-1234' });
    expect(publication.status).toBe('draft');
    expect(ticket.status).toBe('issued');
    expect(ticket.publicToken).not.toBe(String(ticket._id));
  });

  it('uses a sale-scoped idempotency unique index and typed capacity counters', () => {
    const indexes = TicketOrder.schema.indexes();
    expect(indexes.some(([keys, options]) => keys.publicationId === 1 && keys.idempotencyKey === 1 && options.unique)).toBe(true);
    const type = new TicketType({ publicationId: '507f1f77bcf86cd799439011', name: 'General', price: 1000, capacity: 10 });
    expect(type.reservedCount).toBe(0);
    expect(type.soldCount).toBe(0);
  });

  it('does not define Event, salon or customer relationships', () => {
    const fields = Object.keys(TicketPublication.schema.paths);
    expect(fields).not.toContain('eventId'); expect(fields).not.toContain('salonId'); expect(fields).not.toContain('customerId');
    expect(Object.keys(TicketOrder.schema.paths)).not.toContain('eventId');
  });
});
