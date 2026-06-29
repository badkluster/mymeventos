import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  contractCount: vi.fn(),
  contractFind: vi.fn(),
  contractFindOne: vi.fn(),
  addendumFind: vi.fn(),
  addendumFindOne: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne, find: vi.fn() } }));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { countDocuments: vi.fn(), exists: vi.fn(), find: vi.fn() } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: { findOne: vi.fn(), countDocuments: vi.fn(), find: vi.fn(), create: vi.fn() },
  LeadActivity: { find: vi.fn(), create: vi.fn() },
  Customer: { findOne: vi.fn(), countDocuments: vi.fn(), find: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  ContactPerson: {},
  PackageTemplate: { find: vi.fn(), findOne: vi.fn(), exists: vi.fn() },
  VenuePackageRule: { find: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn() },
  Quote: { findOne: vi.fn(), find: vi.fn(), aggregate: vi.fn() },
  QuoteRevision: { findOne: vi.fn(), create: vi.fn() },
  Event: { findOne: vi.fn(), find: vi.fn(), aggregate: vi.fn(), countDocuments: vi.fn(), findOneAndUpdate: vi.fn() },
  QuoteRequest: { findOne: vi.fn(), countDocuments: vi.fn(), find: vi.fn(), create: vi.fn() },
  Contract: { countDocuments: mocks.contractCount, find: mocks.contractFind, findOne: mocks.contractFindOne },
  ContractAddendum: { find: mocks.addendumFind, findOne: mocks.addendumFindOne, countDocuments: vi.fn(), create: vi.fn() },
  Payment: { countDocuments: vi.fn(), find: vi.fn(), findOne: vi.fn(), create: vi.fn() }
}));
vi.mock('../src/modules/crm/event-to-contract.service', () => ({ approveContract: vi.fn(), requestContractChanges: vi.fn(), cancelContract: vi.fn(), recalculateContractTotals: vi.fn(), createAddendum: vi.fn(), updateAddendum: vi.fn(), approveAddendum: vi.fn(), createContractFromEvent: vi.fn() }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/crm/quote-pdf.service', () => ({ generateAndUploadQuotePdf: vi.fn() }));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const contractId = '507f1f77bcf86cd799439012';
const salonId = '507f1f77bcf86cd799439013';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;

function chainLean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}
function listChain(value: unknown) {
  return { populate: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) };
}
function detailChain(value: unknown) {
  return { populate: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(value) };
}

describe('contracts routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
  });

  it('lists contracts', async () => {
    const contracts = [{ _id: contractId, contractNumber: 'C-2026-00001', salonId }];
    mocks.contractCount.mockResolvedValue(1);
    mocks.contractFind.mockReturnValue(listChain(contracts));

    const response = await request(app).get('/api/contracts').set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual(contracts);
  });

  it('gets a contract by id', async () => {
    const contract = { _id: contractId, contractNumber: 'C-2026-00001', salonId };
    mocks.contractFindOne.mockReturnValue(detailChain(contract));

    const response = await request(app).get(`/api/contracts/${contractId}`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.contract).toEqual(contract);
  });

  it('edits a contract', async () => {
    const contract = { _id: contractId, salonId, observations: '', save: vi.fn().mockResolvedValue(undefined) };
    mocks.contractFindOne.mockResolvedValue(contract);

    const response = await request(app).patch(`/api/contracts/${contractId}`).set('Cookie', adminCookie).send({ observations: 'Nueva observación' });

    expect(response.status).toBe(200);
    expect(contract.observations).toBe('Nueva observación');
    expect(contract.save).toHaveBeenCalled();
  });

  it('soft deletes a contract', async () => {
    const contract = { _id: contractId, salonId, save: vi.fn().mockResolvedValue(undefined) };
    mocks.contractFindOne.mockResolvedValue(contract);

    const response = await request(app).delete(`/api/contracts/${contractId}`).set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.deleted).toBe(true);
    expect(contract.deletedAt).toBeInstanceOf(Date);
  });
});
