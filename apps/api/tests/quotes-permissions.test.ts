import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Permission, Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  quoteFindOne: vi.fn(),
  quoteRequestFind: vi.fn(),
  leadActivityCreate: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne, find: vi.fn() } }));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { countDocuments: vi.fn(), exists: vi.fn(), find: vi.fn() } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: { findOne: vi.fn() }, LeadActivity: { create: mocks.leadActivityCreate }, Customer: { findOne: vi.fn() }, ContactPerson: {},
  PackageTemplate: { find: vi.fn(), findOne: vi.fn(), exists: vi.fn() },
  VenuePackageRule: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() },
  Quote: { findOne: mocks.quoteFindOne }, QuoteRevision: { create: vi.fn() },
  Event: { findOne: vi.fn() },
  QuoteRequest: { findOne: vi.fn(), countDocuments: vi.fn(), find: mocks.quoteRequestFind, create: vi.fn() },
  Contract: { findOne: vi.fn() }, ContractAddendum: {}, Payment: { countDocuments: vi.fn(), find: vi.fn(), findOne: vi.fn() }
}));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/crm/quote-pdf.service', () => ({ generateAndUploadQuotePdf: vi.fn() }));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const managerId = '507f1f77bcf86cd799439012';
const quoteId = '507f1f77bcf86cd799439013';
const salonId = '507f1f77bcf86cd799439014';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;
const managerCookie = `accessToken=${generateAccessToken({ sub: managerId, username: 'manager' })}`;

function chainLean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe('quote deletion permission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.quoteRequestFind.mockResolvedValue([]);
  });

  it('allows a user with QUOTES_DELETE to delete a quote', async () => {
    const quote: any = { _id: quoteId, salonId, quoteNumber: 'P-2026-00001', leadId: null, customerId: null, save: vi.fn().mockResolvedValue(undefined) };
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.quoteFindOne.mockResolvedValue(quote);

    const response = await request(app).delete(`/api/quotes/${quoteId}`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(quote.deletedAt).toBeInstanceOf(Date);
  });

  it('rejects a user without QUOTES_DELETE', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: managerId, roles: [Role.MANAGER], permissionOverrides: [], permissionDeniedOverrides: [Permission.QUOTES_DELETE], salonIds: [], active: true }));
    const quote: any = { _id: quoteId, salonId, quoteNumber: 'P-2026-00001', save: vi.fn().mockResolvedValue(undefined) };
    mocks.quoteFindOne.mockResolvedValue(quote);

    const response = await request(app).delete(`/api/quotes/${quoteId}`).set('Cookie', managerCookie);

    expect(response.status).toBe(403);
    expect(quote.deletedAt).toBeUndefined();
  });
});
