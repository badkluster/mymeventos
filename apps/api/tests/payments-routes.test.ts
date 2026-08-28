import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  paymentCount: vi.fn(),
  paymentFind: vi.fn(),
  paymentFindOne: vi.fn(),
  contractFindOne: vi.fn(),
  markPaymentPaid: vi.fn(),
  cancelPayment: vi.fn(),
  createPayment: vi.fn(),
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
  Contract: { findOne: mocks.contractFindOne, countDocuments: vi.fn(), find: vi.fn() },
  ContractAddendum: { find: vi.fn(), findOne: vi.fn(), countDocuments: vi.fn(), create: vi.fn() },
  Payment: { countDocuments: mocks.paymentCount, find: mocks.paymentFind, findOne: mocks.paymentFindOne, create: vi.fn() }
}));
vi.mock('../src/modules/crm/payments.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/crm/payments.service')>();
  return { ...actual, markPaymentPaid: mocks.markPaymentPaid, cancelPayment: mocks.cancelPayment, createPayment: mocks.createPayment };
});
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock('../src/modules/crm/quote-pdf.service', () => ({ generateAndUploadQuotePdf: vi.fn() }));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const salonManagerId = '507f1f77bcf86cd799439099';
const paymentId = '507f1f77bcf86cd799439012';
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

describe('payments routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
  });

  it('lists payments', async () => {
    const payments = [{ _id: paymentId, paymentNumber: 'PAY-2026-00001', salonId, status: 'paid', amount: 20000 }];
    mocks.paymentCount.mockResolvedValue(1);
    mocks.paymentFind.mockReturnValue(listChain(payments));

    const response = await request(app).get('/api/payments').set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual(payments);
  });

  it('lets the assigned salon manager open a payment whose salon is populated', async () => {
    const payment = { _id: paymentId, paymentNumber: 'PAY-2026-00001', salonId: { _id: salonId, name: 'Villa Elisa' }, status: 'paid', amount: 20000 };
    mocks.userFindOne.mockReturnValue(chainLean({ _id: salonManagerId, roles: [Role.SALON_MANAGER], permissionOverrides: [], permissionDeniedOverrides: [], salonIds: [salonId], active: true }));
    mocks.paymentFindOne.mockReturnValue(detailChain(payment));

    const response = await request(app).get(`/api/payments/${paymentId}`).set('Cookie', salonManagerCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.payment).toEqual(payment);
  });

  it('marks a payment as paid', async () => {
    const existing = { _id: paymentId, salonId, status: 'pending' };
    const paid = { ...existing, status: 'paid', method: 'cash' };
    mocks.paymentFindOne.mockReturnValue(detailChain(existing));
    mocks.markPaymentPaid.mockResolvedValue(paid);

    const response = await request(app).post(`/api/payments/${paymentId}/mark-paid`).set('Cookie', adminCookie).send({ method: 'cash' });

    expect(response.status).toBe(200);
    expect(response.body.data.payment.status).toBe('paid');
    expect(mocks.markPaymentPaid).toHaveBeenCalledWith(paymentId, expect.objectContaining({ method: 'cash' }), adminId);
  });

  it('rejects cancellation without a reason', async () => {
    mocks.paymentFindOne.mockReturnValue(detailChain({ _id: paymentId, salonId }));

    const response = await request(app).post(`/api/payments/${paymentId}/cancel`).set('Cookie', adminCookie).send({});

    expect(response.status).toBe(400);
    expect(mocks.cancelPayment).not.toHaveBeenCalled();
  });

  it('cancels a payment with a reason (user with PAYMENTS_CANCEL)', async () => {
    mocks.paymentFindOne.mockReturnValue(detailChain({ _id: paymentId, salonId }));
    mocks.cancelPayment.mockResolvedValue({ _id: paymentId, status: 'cancelled', cancellationReason: 'El cliente pidió cancelar.' });

    const response = await request(app).post(`/api/payments/${paymentId}/cancel`).set('Cookie', adminCookie).send({ reason: 'El cliente pidió cancelar.' });

    expect(response.status).toBe(200);
    expect(mocks.cancelPayment).toHaveBeenCalledWith(paymentId, adminId, 'El cliente pidió cancelar.');
  });

  it('rejects payment cancellation for a user without PAYMENTS_CANCEL', async () => {
    const managerId = '507f1f77bcf86cd799439099';
    const managerCookie = `accessToken=${generateAccessToken({ sub: managerId, username: 'manager' })}`;
    mocks.userFindOne.mockReturnValue(chainLean({ _id: managerId, roles: [Role.MANAGER], permissionOverrides: [], salonIds: [], active: true }));
    mocks.paymentFindOne.mockReturnValue(detailChain({ _id: paymentId, salonId }));

    const response = await request(app).post(`/api/payments/${paymentId}/cancel`).set('Cookie', managerCookie).send({ reason: 'Motivo cualquiera.' });

    expect(response.status).toBe(403);
    expect(mocks.cancelPayment).not.toHaveBeenCalled();
  });

  it('rejects an overpayment override requested by a user without PAYMENTS_APPROVE', async () => {
    const managerId = '507f1f77bcf86cd799439098';
    const managerCookie = `accessToken=${generateAccessToken({ sub: managerId, username: 'manager' })}`;
    mocks.userFindOne.mockReturnValue(chainLean({ _id: managerId, roles: [Role.MANAGER], permissionOverrides: [], salonIds: [salonId], active: true }));
    const contractId = '507f1f77bcf86cd799439097';
    mocks.contractFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: contractId, salonId }) });

    const response = await request(app).post('/api/payments').set('Cookie', managerCookie).send({ contractId, amount: 999999, type: 'balance', status: 'paid', method: 'cash', allowOverpayment: true, overrideReason: 'Quiero forzarlo.' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PAYMENT_OVERRIDE_NOT_AUTHORIZED');
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });
});
