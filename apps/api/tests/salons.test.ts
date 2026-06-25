import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFind: vi.fn(),
  userFindOne: vi.fn(),
  userFindOneAndUpdate: vi.fn(),
  salonFind: vi.fn(),
  salonFindOne: vi.fn(),
  salonFindOneAndUpdate: vi.fn(),
  salonExists: vi.fn(),
  packageFind: vi.fn(),
  packageExists: vi.fn(),
  ruleFind: vi.fn(),
  ruleFindOneAndUpdate: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { find: mocks.userFind, findOne: mocks.userFindOne, findOneAndUpdate: mocks.userFindOneAndUpdate } }));
vi.mock('../src/modules/salons/salon.model', () => ({
  Salon: { find: mocks.salonFind, findOne: mocks.salonFindOne, findOneAndUpdate: mocks.salonFindOneAndUpdate, exists: mocks.salonExists, create: vi.fn() }
}));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: {}, LeadActivity: {},
  PackageTemplate: { find: mocks.packageFind, exists: mocks.packageExists },
  Quote: {}, QuoteRevision: {},
  VenuePackageRule: { find: mocks.ruleFind, findOneAndUpdate: mocks.ruleFindOneAndUpdate }
}));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/notifications/notification.service', () => ({ createNotifications: vi.fn() }));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const managerId = '507f1f77bcf86cd799439012';
const salonId = '507f1f77bcf86cd799439013';
const packageTemplateId = '507f1f77bcf86cd799439014';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;

function chainLean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function chainSelectLean(value: unknown) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(value) }) };
}

function authUser() {
  return { _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true };
}

describe('salons management', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockImplementation((query: Record<string, unknown>) => {
      if (query._id === managerId) return chainLean({ _id: managerId, firstName: 'Encargada', lastName: 'Test', active: true, roles: [Role.SALON_MANAGER], salonIds: [] });
      if (query._id === '507f1f77bcf86cd799439099') return chainLean(null);
      return chainLean(authUser());
    });
    mocks.userFind.mockReturnValue(chainSelectLean([]));
    mocks.userFindOneAndUpdate.mockResolvedValue({});
    mocks.salonExists.mockResolvedValue(null);
  });

  it('returns salons with active package rule counts', async () => {
    const salons = [{ _id: salonId, name: 'San Carlos', active: true, visibleOnWebsite: true }];
    mocks.salonFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(salons) }) });
    mocks.ruleFind.mockReturnValue(chainSelectLean([{ salonId }, { salonId }, { salonId }]));

    const response = await request(app).get('/api/salons').set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.salons[0]).toMatchObject({ name: 'San Carlos', activePackageCount: 3 });
    expect(mocks.salonFind).toHaveBeenCalledWith(expect.objectContaining({ deletedAt: null }));
  });

  it('updates general salon data', async () => {
    mocks.salonFindOneAndUpdate.mockResolvedValue({ toObject: () => ({ _id: salonId, name: 'San Carlos Norte', slug: 'san-carlos-norte', visibleOnWebsite: true }) });

    const response = await request(app)
      .patch(`/api/salons/${salonId}`)
      .set('Cookie', adminCookie)
      .send({ name: 'San Carlos Norte', slug: 'san-carlos-norte', locality: 'San Carlos', maxCapacity: 180 });

    expect(response.status).toBe(200);
    expect(mocks.salonFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: salonId, deletedAt: null },
      expect.objectContaining({ name: 'San Carlos Norte', updatedBy: adminId }),
      { new: true }
    );
  });

  it('returns a salon detail by id', async () => {
    mocks.salonFindOne.mockReturnValue(chainLean({ _id: salonId, name: 'San Carlos', slug: 'san-carlos', visibleOnWebsite: true }));

    const response = await request(app).get(`/api/salons/${salonId}`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.salons).toBeUndefined();
    expect(response.body.data.salon).toMatchObject({ _id: salonId, name: 'San Carlos' });
  });

  it('allows assigning an active manager user', async () => {
    mocks.salonFindOneAndUpdate.mockResolvedValue({ toObject: () => ({ _id: salonId, name: 'San Carlos', slug: 'san-carlos', managerUserId: managerId, visibleOnWebsite: true }) });

    const response = await request(app)
      .patch(`/api/salons/${salonId}`)
      .set('Cookie', adminCookie)
      .send({ managerUserId: managerId });

    expect(response.status).toBe(200);
    expect(mocks.userFindOneAndUpdate).toHaveBeenCalledWith({ _id: managerId, active: true, deletedAt: null }, { $addToSet: { salonIds: salonId } });
  });

  it('rejects an unknown manager user', async () => {
    const response = await request(app)
      .patch(`/api/salons/${salonId}`)
      .set('Cookie', adminCookie)
      .send({ managerUserId: '507f1f77bcf86cd799439099' });

    expect(response.status).toBe(422);
    expect(mocks.salonFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('updates the venue package rule for a salon without updating the global template', async () => {
    mocks.salonFindOne.mockReturnValue(chainLean({ _id: salonId, name: 'San Carlos' }));
    mocks.packageExists.mockResolvedValue({ _id: packageTemplateId });
    mocks.ruleFindOneAndUpdate.mockResolvedValue({ _id: '507f1f77bcf86cd799439015', packageTemplateId, salonId, pricePerPerson: 123000 });

    const response = await request(app)
      .patch(`/api/salons/${salonId}/package-rules/${packageTemplateId}`)
      .set('Cookie', adminCookie)
      .send({ active: true, pricePerPerson: 123000, discountPercentage: 10, depositAmount: 500000 });

    expect(response.status).toBe(200);
    expect(mocks.ruleFindOneAndUpdate).toHaveBeenCalledWith(
      { packageTemplateId, salonId },
      expect.objectContaining({ pricePerPerson: 123000, packageTemplateId, salonId }),
      expect.objectContaining({ upsert: true, new: true })
    );
    expect(mocks.packageFind).not.toHaveBeenCalled();
  });

  it('returns package rules for a salon detail tab', async () => {
    mocks.salonFindOne.mockReturnValue(chainLean({ _id: salonId, name: 'San Carlos' }));
    mocks.packageFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: packageTemplateId, name: 'Magic Night', active: true, isGlobal: true }]) }) });
    mocks.ruleFind.mockReturnValue(chainLean([{ packageTemplateId, salonId, active: true, pricePerPerson: 100000 }]));

    const response = await request(app).get(`/api/salons/${salonId}/package-rules`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.packageRules[0]).toMatchObject({ packageTemplateId, packageName: 'Magic Night', ruleConfigured: true, pricePerPerson: 100000 });
  });

  it('returns extras for a salon detail tab', async () => {
    mocks.salonFindOne.mockReturnValue(chainLean({ _id: salonId, name: 'San Carlos', extraServices: [{ name: 'Fotografía', basePrice: 1000, active: true }] }));

    const response = await request(app).get(`/api/salons/${salonId}/extras`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.extras).toEqual([{ name: 'Fotografía', basePrice: 1000, active: true }]);
  });

  it('updates extras for a salon detail tab', async () => {
    const extras = [{ name: 'Fotografía', description: '', basePrice: 1000, active: true, includedByDefault: false, publicVisible: true }];
    mocks.salonFindOneAndUpdate.mockResolvedValue({ extraServices: extras });

    const response = await request(app).patch(`/api/salons/${salonId}/extras`).set('Cookie', adminCookie).send({ extras });

    expect(response.status).toBe(200);
    expect(response.body.data.extras).toEqual(extras);
    expect(mocks.salonFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: salonId, deletedAt: null },
      expect.objectContaining({ extraServices: extras, updatedBy: adminId }),
      { new: true }
    );
  });

  it('soft deletes salons', async () => {
    mocks.salonFindOneAndUpdate.mockResolvedValue({ _id: salonId, deletedAt: new Date() });

    const response = await request(app).delete(`/api/salons/${salonId}`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(mocks.salonFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: salonId, deletedAt: null },
      expect.objectContaining({ deletedAt: expect.any(Date), deletedBy: adminId }),
      { new: true }
    );
  });

  it('returns only active and website-visible salons publicly', async () => {
    mocks.salonFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ _id: salonId, name: 'San Carlos', active: true, visibleOnWebsite: true }])
        })
      })
    });

    const response = await request(app).get('/api/public/salons');

    expect(response.status).toBe(200);
    expect(response.body.data.salons).toHaveLength(1);
    expect(mocks.salonFind).toHaveBeenCalledWith(expect.objectContaining({ active: true, deletedAt: null }));
  });
});
