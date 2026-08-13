import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(), packageFind: vi.fn(), packageFindOne: vi.fn(), ruleFindOne: vi.fn(), salonCount: vi.fn(), salonFindById: vi.fn(),
  customerFindOne: vi.fn(), quoteCreate: vi.fn(), quoteRevisionFindOne: vi.fn(), quoteRevisionCreate: vi.fn(), leadActivityCreate: vi.fn(), writeAuditLog: vi.fn(), generateQuotePdf: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: {}, LeadActivity: { create: mocks.leadActivityCreate }, Customer: { findOne: mocks.customerFindOne }, Event: {}, Contract: { findOne: vi.fn() }, ContractAddendum: {}, PackageTemplate: { find: mocks.packageFind, findOne: mocks.packageFindOne }, Quote: { create: mocks.quoteCreate }, QuoteRevision: { findOne: mocks.quoteRevisionFindOne, create: mocks.quoteRevisionCreate }, VenuePackageRule: { findOne: mocks.ruleFindOne }, Payment: { countDocuments: vi.fn(), find: vi.fn(), findOne: vi.fn() }
}));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { countDocuments: mocks.salonCount, findById: mocks.salonFindById } }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/crm/quote-pdf.service', () => ({ generateAndUploadQuotePdf: mocks.generateQuotePdf }));

import app from '../src/app';

const adminCookie = `accessToken=${generateAccessToken({ sub: '507f1f77bcf86cd799439011', username: 'admin' })}`;
const packageId = '507f1f77bcf86cd799439012';
const salonId = '507f1f77bcf86cd799439013';

describe('quote package templates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }) });
    mocks.salonCount.mockResolvedValue(1);
    mocks.salonFindById.mockReturnValue({ select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ defaultQuoteValidityDays: 7 }) }) });
    mocks.quoteRevisionFindOne.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) });
    mocks.quoteRevisionCreate.mockResolvedValue(undefined);
    mocks.leadActivityCreate.mockResolvedValue(undefined);
    mocks.writeAuditLog.mockResolvedValue(undefined);
    mocks.generateQuotePdf.mockResolvedValue({});
  });

  it('returns active commercial templates from GET /api/quotes/packages', async () => {
    const templates = [{ _id: packageId, name: 'Magic Night', active: true }];
    mocks.packageFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(templates) }) });

    const response = await request(app).get('/api/quotes/packages').set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.packages).toEqual(templates);
    expect(mocks.packageFind).toHaveBeenCalledWith(expect.objectContaining({ active: true, deletedAt: null }));
  });

  it('filters templates to packages applicable to the selected salon', async () => {
    mocks.packageFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    const response = await request(app).get(`/api/quotes/packages?salonId=${salonId}`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(mocks.packageFind).toHaveBeenCalledWith(expect.objectContaining({
      $or: [{ isGlobal: true }, { salonIds: { $all: [salonId] } }]
    }));
  });

  it('reports when a selected salon has no commercial rule for a template', async () => {
    mocks.salonCount.mockResolvedValue(1);
    mocks.packageFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: packageId, name: 'Magic Night', active: true, isGlobal: true }) });
    mocks.ruleFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const response = await request(app).get(`/api/quotes/packages/${packageId}/salons/${salonId}`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.package).toMatchObject({ name: 'Magic Night', ruleConfigured: false });
  });

  it('uses the salon-specific package name when resolving a global template', async () => {
    mocks.salonCount.mockResolvedValue(1);
    mocks.packageFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: packageId, name: 'Magic Night', active: true, isGlobal: true }) });
    mocks.ruleFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ packageTemplateId: packageId, salonId, name: 'Noche Mágica San Carlos', active: true }) });

    const response = await request(app).get(`/api/quotes/packages/${packageId}/salons/${salonId}`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.package).toMatchObject({ name: 'Noche Mágica San Carlos', ruleConfigured: true });
  });

  it('creates a quote from a global template when the salon has no override rule', async () => {
    const customerId = '507f1f77bcf86cd799439016';
    const quote = { _id: '507f1f77bcf86cd799439017', salonId, quoteNumber: 'P-2026-00001', save: vi.fn().mockResolvedValue(undefined) };
    mocks.customerFindOne.mockResolvedValue({ _id: customerId, fullName: 'Ana Pérez', salonIds: [] });
    mocks.packageFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: packageId, name: 'Alquiler de salón', active: true, isGlobal: true, pricingMode: 'per_person', pricePerPerson: 100000, finalPricePerPerson: 100000, depositAmount: 100000 }) });
    mocks.ruleFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mocks.quoteCreate.mockResolvedValue(quote);

    const response = await request(app)
      .post('/api/quotes')
      .set('Cookie', adminCookie)
      .send({ customerId, salonId, packageTemplateId: packageId, eventType: 'Cumpleaños', guestCount: 40 });

    expect(response.status).toBe(201);
    expect(mocks.quoteCreate).toHaveBeenCalledWith(expect.objectContaining({ packageName: 'Alquiler de salón', packageTemplateId: packageId, totalAmount: 4000000 }));
  });
});
