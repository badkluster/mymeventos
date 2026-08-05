import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  catalogItemFind: vi.fn(),
  catalogItemCreate: vi.fn(),
  catalogItemFindOneAndUpdate: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne, find: vi.fn() } }));
vi.mock('../src/modules/operations/operations.models', () => ({
  CatalogItem: { find: mocks.catalogItemFind, create: mocks.catalogItemCreate, findOne: vi.fn(), findOneAndUpdate: mocks.catalogItemFindOneAndUpdate },
  ServiceExtra: { find: vi.fn(), create: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() }
}));

import app from '../src/app';

const managerId = '507f1f77bcf86cd799439012';
const salonManagerId = '507f1f77bcf86cd799439015';
const managerCookie = `accessToken=${generateAccessToken({ sub: managerId, username: 'manager' })}`;
const salonManagerCookie = `accessToken=${generateAccessToken({ sub: salonManagerId, username: 'salon-manager' })}`;

function chainLean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}
function findChain(value: unknown) {
  return { populate: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) };
}

describe('catalog routes — production product picker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.catalogItemFind.mockReturnValue(findChain([]));
  });

  it('lets a MANAGER list catalog items', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: managerId, roles: [Role.MANAGER], permissionOverrides: [], salonIds: [], active: true }));

    const response = await request(app).get('/api/catalog/items').set('Cookie', managerCookie);

    expect(response.status).toBe(200);
  });

  it('rejects listing catalog items for a role without catalog.read', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: salonManagerId, roles: [Role.SALON_MANAGER], permissionOverrides: [], salonIds: [], active: true }));

    const response = await request(app).get('/api/catalog/items').set('Cookie', salonManagerCookie);

    expect(response.status).toBe(403);
  });

  it('lets a MANAGER create a new catalog product', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: managerId, roles: [Role.MANAGER], permissionOverrides: [], salonIds: [], active: true }));
    mocks.catalogItemCreate.mockResolvedValue({ _id: '507f1f77bcf86cd799439099', name: 'Champagne', type: 'BEVERAGE', unitOfMeasure: 'botella' });

    const response = await request(app).post('/api/catalog/items').set('Cookie', managerCookie).send({ name: 'Champagne', type: 'BEVERAGE', beverageType: 'ALCOHOLIC', unitOfMeasure: 'botella' });

    expect(response.status).toBe(201);
    expect(mocks.catalogItemCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Champagne', type: 'BEVERAGE', unitOfMeasure: 'botella' }));
  });

  it('rejects creating a catalog product for a role without catalog.create', async () => {
    mocks.userFindOne.mockReturnValue(chainLean({ _id: salonManagerId, roles: [Role.SALON_MANAGER], permissionOverrides: [], salonIds: [], active: true }));

    const response = await request(app).post('/api/catalog/items').set('Cookie', salonManagerCookie).send({ name: 'Champagne', type: 'BEVERAGE', unitOfMeasure: 'botella' });

    expect(response.status).toBe(403);
    expect(mocks.catalogItemCreate).not.toHaveBeenCalled();
  });
});
