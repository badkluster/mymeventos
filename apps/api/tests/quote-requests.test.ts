import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  userExists: vi.fn(),
  salonCount: vi.fn(),
  salonExists: vi.fn(),
  createQuoteRequest: vi.fn(),
  quoteRequestFindOne: vi.fn(),
  quoteRequestCount: vi.fn(),
  quoteRequestFind: vi.fn(),
  notificationFind: vi.fn(),
  notificationCount: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne, exists: mocks.userExists, find: vi.fn() } }));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { countDocuments: mocks.salonCount, exists: mocks.salonExists, find: vi.fn() } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: {},
  LeadActivity: { create: vi.fn() },
  Customer: {},
  QuoteRequest: { findOne: mocks.quoteRequestFindOne, countDocuments: mocks.quoteRequestCount, find: mocks.quoteRequestFind, create: vi.fn() },
  PackageTemplate: { find: vi.fn() },
  VenuePackageRule: { find: vi.fn() },
  Quote: {},
  QuoteRevision: {},
  Event: {},
  Contract: { findOne: vi.fn() },
  ContractAddendum: {},
  Payment: { countDocuments: vi.fn(), find: vi.fn(), findOne: vi.fn() }
}));
vi.mock('../src/modules/notifications/notification.model', () => ({
  Notification: {
    find: mocks.notificationFind,
    countDocuments: mocks.notificationCount,
    updateMany: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }
}));
vi.mock('../src/modules/crm/quote-request.service', () => ({ createQuoteRequest: mocks.createQuoteRequest }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/crm/quote-pdf.service', () => ({ generateAndUploadQuotePdf: vi.fn() }));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const salonId = '507f1f77bcf86cd799439013';
const quoteRequestId = '507f1f77bcf86cd799439014';
const leadId = '507f1f77bcf86cd799439015';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;

function authUser() {
  return { _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true };
}

describe('quote requests API', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(authUser()) });
    mocks.userExists.mockResolvedValue({ _id: adminId });
    mocks.salonCount.mockResolvedValue(1);
    mocks.salonExists.mockResolvedValue({ _id: salonId });
    mocks.createQuoteRequest.mockResolvedValue({ lead: { _id: leadId }, quoteRequest: { _id: quoteRequestId }, leadCreated: true });
  });

  it('creates an authenticated quote request through POST /api/quote-requests', async () => {
    const response = await request(app)
      .post('/api/quote-requests')
      .set('Cookie', adminCookie)
      .send({ source: 'admin', contactName: 'Ana Perez', phone: '221 555-1111', eventType: 'Cumpleaños', interestedSalonIds: [salonId] });

    expect(response.status).toBe(201);
    expect(response.body.data.quoteRequest._id).toBe(quoteRequestId);
    expect(mocks.createQuoteRequest).toHaveBeenCalledWith(expect.objectContaining({ contactName: 'Ana Perez', source: 'admin', userId: adminId }));
  });

  it('public quick quote creates a quote request instead of a definitive quote', async () => {
    const response = await request(app)
      .post('/api/public/quick-quote')
      .send({ name: 'Ana Perez', phone: '221 555-1111', email: 'ana@test.com', eventType: 'Cumpleaños', guestCount: 80, salonId });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ leadId, quoteRequestId });
    expect(response.body.message).toContain('Recibimos tu solicitud');
    expect(mocks.createQuoteRequest).toHaveBeenCalledWith(expect.objectContaining({ source: 'quick_quote', contactName: 'Ana Perez', interestedSalonIds: [salonId] }));
  });

  it('returns the new quote request count without loading quote request rows', async () => {
    mocks.quoteRequestCount.mockResolvedValue(7);

    const response = await request(app)
      .get('/api/quote-requests/new-count')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ count: 7 });
    expect(mocks.quoteRequestCount).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.quoteRequestCount.mock.calls[0]?.[0])).toContain('"status":"new"');
    expect(mocks.quoteRequestFind).not.toHaveBeenCalled();
  });

  it('returns a compact notification summary for the admin bell', async () => {
    const notifications = Array.from({ length: 5 }, (_, index) => ({
      _id: `notification-${index}`,
      type: 'system',
      title: `Aviso ${index}`,
      message: 'Mensaje',
      readAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const query = {
      sort: vi.fn(),
      limit: vi.fn(),
      select: vi.fn(),
      lean: vi.fn().mockResolvedValue(notifications),
    };
    query.sort.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.select.mockReturnValue(query);
    mocks.notificationFind.mockReturnValue(query);
    mocks.notificationCount.mockResolvedValue(12);

    const response = await request(app)
      .get('/api/notifications/summary')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ notifications, unreadCount: 12 });
    expect(query.limit).toHaveBeenCalledWith(5);
    expect(query.select).toHaveBeenCalledWith('type title message actionUrl readAt createdAt updatedAt');
  });

  it('lets an operator take a quote request', async () => {
    const quoteRequest = {
      _id: quoteRequestId,
      interestedSalonIds: [salonId],
      status: 'new',
      save: vi.fn().mockResolvedValue(undefined)
    };
    mocks.quoteRequestFindOne.mockResolvedValue(quoteRequest);

    const response = await request(app).patch(`/api/quote-requests/${quoteRequestId}/take`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(quoteRequest.status).toBe('in_review');
    expect(quoteRequest.assignedToUserId).toBe(adminId);
    expect(quoteRequest.save).toHaveBeenCalled();
  });
});
