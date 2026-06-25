import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(), packageFind: vi.fn(), packageFindOne: vi.fn(), ruleFindOne: vi.fn(), salonCount: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: {}, LeadActivity: {}, PackageTemplate: { find: mocks.packageFind, findOne: mocks.packageFindOne }, Quote: {}, QuoteRevision: {}, VenuePackageRule: { findOne: mocks.ruleFindOne }
}));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { countDocuments: mocks.salonCount } }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));

import app from '../src/app';

const adminCookie = `accessToken=${generateAccessToken({ sub: '507f1f77bcf86cd799439011', username: 'admin' })}`;
const packageId = '507f1f77bcf86cd799439012';
const salonId = '507f1f77bcf86cd799439013';

describe('quote package templates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }) });
  });

  it('returns active commercial templates from GET /api/quotes/packages', async () => {
    const templates = [{ _id: packageId, name: 'Magic Night', active: true }];
    mocks.packageFind.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(templates) }) });

    const response = await request(app).get('/api/quotes/packages').set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.packages).toEqual(templates);
    expect(mocks.packageFind).toHaveBeenCalledWith(expect.objectContaining({ active: true, deletedAt: null }));
  });

  it('reports when a selected salon has no commercial rule for a template', async () => {
    mocks.salonCount.mockResolvedValue(1);
    mocks.packageFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: packageId, name: 'Magic Night', active: true, isGlobal: true }) });
    mocks.ruleFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const response = await request(app).get(`/api/quotes/packages/${packageId}/salons/${salonId}`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.package).toMatchObject({ name: 'Magic Night', ruleConfigured: false });
  });
});
