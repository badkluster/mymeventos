import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  quoteFindOne: vi.fn(),
  eventFindOne: vi.fn(),
  eventCreate: vi.fn(),
  findOrCreateCustomer: vi.fn(),
  quoteRevisionFindOne: vi.fn(),
  quoteRevisionCreate: vi.fn(),
  syncEventAlerts: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  Quote: { findOne: mocks.quoteFindOne },
  Lead: { findOne: vi.fn() },
  Event: { findOne: mocks.eventFindOne, create: mocks.eventCreate },
  LeadActivity: { create: vi.fn() },
  QuoteRevision: { findOne: mocks.quoteRevisionFindOne, create: mocks.quoteRevisionCreate }
}));
vi.mock('../src/modules/crm/contact-dedupe.service', () => ({ findOrCreateCustomer: mocks.findOrCreateCustomer }));
vi.mock('../src/modules/crm/event-resource-plan', () => ({ buildInitialResourcePlan: vi.fn(() => ({ alerts: [] })) }));
vi.mock('../src/modules/crm/event-alert-defaults', () => ({ buildDefaultEventAlerts: vi.fn(() => []) }));
vi.mock('../src/modules/crm/event-alert-calendar-sync.service', () => ({ syncEventAlertCalendarItems: mocks.syncEventAlerts }));

import { convertQuoteToEvent } from '../src/modules/crm/quote-to-event.service';

describe('quote observations to event', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.quoteRevisionFindOne.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    mocks.findOrCreateCustomer.mockResolvedValue({ customer: { _id: 'customer-id', fullName: 'Ana Pérez' } });
    mocks.eventFindOne.mockResolvedValue(null);
    mocks.eventCreate.mockImplementation(async (event) => ({ _id: 'event-id', ...event }));
    mocks.syncEventAlerts.mockResolvedValue(undefined);
  });

  it('carries the dedicated observations to the event without replacing them with template notes', async () => {
    const observations = 'La familia ingresa por el acceso lateral y coordina proveedores desde las 18:00.';
    const quote: any = {
      _id: 'quote-id', quoteNumber: 'P-2026-00001', salonId: 'salon-id', customerId: 'customer-id', contactName: 'Ana Pérez', phone: '1112345678',
      eventType: 'Cumpleaños', eventDate: new Date('2026-12-05'), startTime: '21:00', endTime: '05:00', guestCount: 80,
      totalAmount: 1500000, depositAmount: 300000, balanceAmount: 1200000, pricingMode: 'fixed', packageName: 'Noche especial',
      notes: 'Nota de la plantilla comercial.', observations, save: vi.fn().mockResolvedValue(undefined)
    };
    mocks.quoteFindOne.mockResolvedValue(quote);

    const result = await convertQuoteToEvent({ quoteId: quote._id, userId: 'user-id' });

    expect(result.event.notes).toBe(observations);
    expect(mocks.findOrCreateCustomer).toHaveBeenCalledWith(expect.objectContaining({ message: observations }));
  });
});
