import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  quoteFindOne: vi.fn(),
  eventCount: vi.fn(),
  eventFind: vi.fn(),
  convertQuoteToEvent: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne, find: vi.fn() } }));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { countDocuments: vi.fn(), exists: vi.fn(), find: vi.fn() } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: {},
  LeadActivity: { create: vi.fn() },
  Customer: {},
  ContactPerson: {},
  PackageTemplate: { find: vi.fn(), findOne: vi.fn(), exists: vi.fn() },
  VenuePackageRule: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() },
  Quote: { findOne: mocks.quoteFindOne },
  QuoteRevision: {},
  Event: { countDocuments: mocks.eventCount, find: mocks.eventFind, findOne: vi.fn() },
  QuoteRequest: { findOne: vi.fn(), countDocuments: vi.fn(), find: vi.fn(), create: vi.fn() },
  Contract: { findOne: vi.fn() },
  ContractAddendum: {},
  Payment: { countDocuments: vi.fn(), find: vi.fn(), findOne: vi.fn() }
}));
vi.mock('../src/modules/crm/quote-to-event.service', () => ({ convertQuoteToEvent: mocks.convertQuoteToEvent }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/crm/quote-pdf.service', () => ({ generateAndUploadQuotePdf: vi.fn() }));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const quoteId = '507f1f77bcf86cd799439012';
const eventId = '507f1f77bcf86cd799439013';
const salonId = '507f1f77bcf86cd799439014';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;

function chainLean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe('quote to event conversion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.quoteFindOne.mockReturnValue(chainLean({ _id: quoteId, salonId, deletedAt: null }));
    mocks.convertQuoteToEvent.mockResolvedValue({ event: { _id: eventId }, customer: { _id: '507f1f77bcf86cd799439015' }, quote: { _id: quoteId }, lead: null, createdEvent: true });
  });

  it('converts a quote to a customer/event through POST /api/quotes/:id/convert-to-event', async () => {
    const response = await request(app).post(`/api/quotes/${quoteId}/convert-to-event`).set('Cookie', adminCookie).send({});

    expect(response.status).toBe(201);
    expect(response.body.data.event._id).toBe(eventId);
    expect(mocks.convertQuoteToEvent).toHaveBeenCalledWith(expect.objectContaining({ quoteId, userId: adminId }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.anything(), 'QUOTE_CONVERT_TO_EVENT', 'Event', eventId, expect.objectContaining({ quoteId }));
  });

  it('lists events through GET /api/events', async () => {
    const events = [{ _id: eventId, eventName: 'Cumpleaños - Ana', salonId, status: 'quoted' }];
    mocks.eventCount.mockResolvedValue(1);
    mocks.eventFind.mockReturnValue({
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(events)
    });

    const response = await request(app).get('/api/events').set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual(events);
  });
});
