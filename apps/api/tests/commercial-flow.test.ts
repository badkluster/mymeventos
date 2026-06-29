import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  customerFindOne: vi.fn(),
  customerFind: vi.fn(),
  customerCreate: vi.fn(),
  customerUpdateOne: vi.fn(),
  leadFindOne: vi.fn(),
  leadFind: vi.fn(),
  leadCreate: vi.fn(),
  leadUpdateOne: vi.fn(),
  leadActivityCreate: vi.fn(),
  quoteFindOne: vi.fn(),
  revisionFindOne: vi.fn(),
  revisionCreate: vi.fn(),
  eventFindOne: vi.fn(),
  eventCreate: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  Customer: { modelName: 'Customer', findOne: mocks.customerFindOne, find: mocks.customerFind, create: mocks.customerCreate, updateOne: mocks.customerUpdateOne },
  Lead: { modelName: 'Lead', findOne: mocks.leadFindOne, find: mocks.leadFind, create: mocks.leadCreate, updateOne: mocks.leadUpdateOne },
  LeadActivity: { create: mocks.leadActivityCreate },
  Quote: { findOne: mocks.quoteFindOne },
  QuoteRevision: { findOne: mocks.revisionFindOne, create: mocks.revisionCreate },
  Event: { findOne: mocks.eventFindOne, create: mocks.eventCreate }
}));

import { findOrCreateLead, normalizeEmail, normalizePhone } from '../src/modules/crm/contact-dedupe.service';
import { convertQuoteToEvent } from '../src/modules/crm/quote-to-event.service';

describe('commercial flow services', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.customerFind.mockResolvedValue([]);
    mocks.leadFind.mockResolvedValue([]);
    mocks.customerUpdateOne.mockResolvedValue({});
    mocks.leadUpdateOne.mockResolvedValue({});
    mocks.leadActivityCreate.mockResolvedValue({});
    mocks.revisionFindOne.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    mocks.revisionCreate.mockResolvedValue({});
  });

  it('normalizes contact data consistently', () => {
    expect(normalizeEmail('  ANA@MAIL.COM ')).toBe('ana@mail.com');
    expect(normalizePhone('(221) 555-1111')).toBe('2215551111');
  });

  it('does not create a lead when a customer already matches', async () => {
    const customer = { _id: 'customer-1', email: 'ana@mail.com' };
    mocks.customerFindOne.mockResolvedValue(customer);

    const result = await findOrCreateLead({ contactName: 'Ana Perez', email: 'ANA@MAIL.COM', phone: '221 555-1111' });

    expect(result.existingCustomer).toBe(customer);
    expect(result.lead).toBeNull();
    expect(mocks.leadCreate).not.toHaveBeenCalled();
  });

  it('creates a lead for a new person when no customer or lead matches', async () => {
    mocks.customerFindOne.mockResolvedValue(null);
    mocks.leadFindOne.mockResolvedValue(null);
    mocks.leadCreate.mockResolvedValue({ _id: 'lead-1', fullName: 'Ana Perez' });

    const result = await findOrCreateLead({ contactName: 'Ana Perez', phone: '221 555-1111', salonIds: ['salon-1'] });

    expect(result.created).toBe(true);
    expect(mocks.leadCreate).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'Ana Perez', normalizedPhone: '2215551111' }));
  });

  it('converts a quote with customerId idempotently without duplicating events', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const quote = { _id: 'quote-1', quoteNumber: 'P-1', customerId: 'customer-1', salonId: 'salon-1', contactName: 'Ana Perez', eventType: 'Cumpleaños', totalAmount: 1000, menuSections: [], includedServices: [], save };
    const customer = { _id: 'customer-1', fullName: 'Ana Perez' };
    const event = { _id: 'event-1', customerId: 'customer-1' };
    mocks.quoteFindOne.mockResolvedValue(quote);
    mocks.leadFindOne.mockResolvedValue(null);
    mocks.customerFindOne.mockResolvedValue(customer);
    mocks.eventFindOne.mockResolvedValue(event);

    const result = await convertQuoteToEvent({ quoteId: 'quote-1', userId: 'user-1' });

    expect(result.createdEvent).toBe(false);
    expect(result.event).toBe(event);
    expect(mocks.eventCreate).not.toHaveBeenCalled();
    expect(quote.convertedEventId).toBe('event-1');
  });
});
