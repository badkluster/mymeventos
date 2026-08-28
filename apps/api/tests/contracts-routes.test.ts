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
  writeAuditLog: vi.fn(),
  cancelContract: vi.fn()
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
vi.mock('../src/modules/crm/event-to-contract.service', () => ({ approveContract: vi.fn(), requestContractChanges: vi.fn(), cancelContract: mocks.cancelContract, recalculateContractTotals: vi.fn(), createAddendum: vi.fn(), updateAddendum: vi.fn(), approveAddendum: vi.fn(), createContractFromEvent: vi.fn() }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/crm/quote-pdf.service', () => ({ generateAndUploadQuotePdf: vi.fn() }));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const salonManagerId = '507f1f77bcf86cd799439099';
const contractId = '507f1f77bcf86cd799439012';
const salonId = '507f1f77bcf86cd799439013';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;
const salonManagerCookie = `accessToken=${generateAccessToken({ sub: salonManagerId, username: 'salon-manager' })}`;

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

  it('lets the assigned salon manager open a contract whose salon is populated', async () => {
    const contract = { _id: contractId, contractNumber: 'C-2026-00001', salonId: { _id: salonId, name: 'Villa Elisa' } };
    mocks.userFindOne.mockReturnValue(chainLean({ _id: salonManagerId, roles: [Role.SALON_MANAGER], permissionOverrides: [], permissionDeniedOverrides: [], salonIds: [salonId], active: true }));
    mocks.contractFindOne.mockReturnValue(detailChain(contract));

    const response = await request(app).get(`/api/contracts/${contractId}`).set('Cookie', salonManagerCookie);

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

  it('rejects cancellation without a reason', async () => {
    mocks.contractFindOne.mockReturnValue(chainLean({ _id: contractId, salonId }));

    const response = await request(app).post(`/api/contracts/${contractId}/cancel`).set('Cookie', adminCookie).send({});

    expect(response.status).toBe(400);
    expect(mocks.cancelContract).not.toHaveBeenCalled();
  });

  it('cancels a contract with a reason', async () => {
    mocks.contractFindOne.mockReturnValue(chainLean({ _id: contractId, salonId }));
    mocks.cancelContract.mockResolvedValue({ _id: contractId, status: 'cancelled', cancellationReason: 'El cliente rescindió el contrato.' });

    const response = await request(app).post(`/api/contracts/${contractId}/cancel`).set('Cookie', adminCookie).send({ reason: 'El cliente rescindió el contrato.' });

    expect(response.status).toBe(200);
    expect(mocks.cancelContract).toHaveBeenCalledWith(contractId, adminId, 'El cliente rescindió el contrato.');
  });

  it('rejects setting status=cancelled through the generic status route (must use /cancel)', async () => {
    const contract = { _id: contractId, salonId, status: 'approved', save: vi.fn().mockResolvedValue(undefined) };
    mocks.contractFindOne.mockResolvedValue(contract);

    const response = await request(app).patch(`/api/contracts/${contractId}/status`).set('Cookie', adminCookie).send({ status: 'cancelled' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('CONTRACT_STATUS_CANCEL_NOT_ALLOWED');
    expect(contract.save).not.toHaveBeenCalled();
  });

  it('generates a dynamic PDF preview before approval, without persisting or uploading anything', async () => {
    const draftContract = {
      _id: contractId,
      salonId,
      contractNumber: 'C-2026-00001',
      status: 'draft',
      versionNumber: 1,
      totalAmount: 1750000,
      balanceAmount: 1750000,
      customerSnapshot: { fullName: 'Manuela Albarracín', documentNumber: '30111222', phone: '+5491111111', email: 'manuela@example.com' },
      eventSnapshot: { eventName: 'Cumple de 40 años', eventType: 'Cumpleaños', eventDate: new Date('2026-09-10T00:00:00.000Z'), guestCount: 80, startTime: '21:00', endTime: '05:00', salonName: 'San Carlos', salonAddress: 'Calle Falsa 123' },
      commercialSnapshot: { depositAmount: 400000, paymentTerms: 'Seña + 12 cuotas' },
      paymentPlanSnapshot: [{ label: 'Cuota 1 de 12', amount: 112500, paymentWindowStart: '2026-09-01', paymentWindowEnd: '2026-09-10' }],
      servicesSnapshot: ['Servicio de salón: DJ y sonido'],
      menuSnapshot: [{ title: 'Entrada', items: ['Bruschettas'] }],
      legalTermsSnapshot: { clauses: [{ title: 'Reserva', text: 'La reserva se confirma con el pago de la seña.' }] }
    };
    mocks.contractFindOne.mockReturnValue(detailChain(draftContract));

    const response = await request(app)
      .get(`/api/contracts/${contractId}/preview-pdf`)
      .set('Cookie', adminCookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('inline');
    expect(response.headers['content-disposition']).toContain('C-2026-00001');
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect((response.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});
