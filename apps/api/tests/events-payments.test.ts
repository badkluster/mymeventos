import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Role } from '@mym/shared';
import { generateAccessToken } from '../src/utils/tokens';

const mocks = vi.hoisted(() => ({
  userFindOne: vi.fn(),
  eventFindOne: vi.fn(),
  contractFindOne: vi.fn(),
  customerFindOne: vi.fn(),
  createPayment: vi.fn(),
  generateAndUploadPaymentReceiptPdf: vi.fn(),
  sendEmail: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock('../src/modules/users/user.model', () => ({ User: { findOne: mocks.userFindOne, find: vi.fn() } }));
vi.mock('../src/modules/salons/salon.model', () => ({ Salon: { countDocuments: vi.fn(), exists: vi.fn(), find: vi.fn() } }));
vi.mock('../src/modules/crm/crm.models', () => ({
  Lead: {}, LeadActivity: { find: vi.fn(), create: vi.fn() }, Customer: { findOne: mocks.customerFindOne }, ContactPerson: {},
  PackageTemplate: { find: vi.fn(), findOne: vi.fn() },
  VenuePackageRule: { find: vi.fn(), findOne: vi.fn() },
  Quote: { findOne: vi.fn() }, QuoteRevision: {},
  Event: { findOne: mocks.eventFindOne, find: vi.fn() },
  EventStaffAssignment: { find: vi.fn() },
  QuoteRequest: { findOne: vi.fn(), countDocuments: vi.fn(), find: vi.fn() },
  Contract: { findOne: mocks.contractFindOne }, ContractAddendum: {},
  Payment: { countDocuments: vi.fn(), find: vi.fn(), findOne: vi.fn() }
}));
vi.mock('../src/modules/crm/payments.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/crm/payments.service')>();
  return { ...actual, createPayment: mocks.createPayment };
});
vi.mock('../src/modules/crm/payment-receipt-pdf.service', () => ({ generateAndUploadPaymentReceiptPdf: mocks.generateAndUploadPaymentReceiptPdf }));
vi.mock('../src/modules/email/email.service', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));

import app from '../src/app';

const adminId = '507f1f77bcf86cd799439011';
const eventId = '507f1f77bcf86cd799439013';
const contractId = '507f1f77bcf86cd799439014';
const salonId = '507f1f77bcf86cd799439015';
const adminCookie = `accessToken=${generateAccessToken({ sub: adminId, username: 'admin' })}`;

function chainLean(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}
function installmentPlan(count: number, amountPerInstallment: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `installment-${index + 1}`, label: `Cuota ${index + 1} de ${count}`, amount: amountPerInstallment, status: 'scheduled' }));
}

describe('event payment registration and the installment plan', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.userFindOne.mockReturnValue(chainLean({ _id: adminId, roles: [Role.ADMIN], permissionOverrides: [], salonIds: [], active: true }));
    mocks.customerFindOne.mockReturnValue(chainLean(null));
    mocks.generateAndUploadPaymentReceiptPdf.mockResolvedValue({});
    mocks.contractFindOne
      .mockReturnValueOnce({ sort: vi.fn().mockResolvedValue({ _id: contractId, balanceAmount: 1750000, status: 'approved', save: vi.fn().mockResolvedValue(undefined) }) })
      .mockResolvedValueOnce({ _id: contractId, balanceAmount: 1350000, status: 'approved', save: vi.fn().mockResolvedValue(undefined) });
  });

  it('does not touch the installment plan when the payment is a deposit ("seña")', async () => {
    const plan = installmentPlan(12, 112500);
    const event: any = { _id: eventId, salonId, customerId: undefined, quoteId: undefined, paymentPlanSnapshot: plan, save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);
    mocks.createPayment.mockResolvedValue({ _id: 'payment-1', paymentNumber: 'PAY-2026-00001', amount: 400000, save: vi.fn().mockResolvedValue(undefined) });

    const response = await request(app).post(`/api/events/${eventId}/payments`).set('Cookie', adminCookie).send({ amount: 400000, method: 'cash', type: 'deposit', reference: 'Seña' });

    expect(response.status).toBe(201);
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ type: 'deposit' }), adminId);
    expect(event.paymentPlanSnapshot).toEqual(plan);
    expect(event.save).not.toHaveBeenCalled();
    expect(response.body.data.paymentPlanSnapshot).toEqual(plan);
    expect(response.body.data.planOverpaymentAmount).toBe(0);
  });

  it('still cascades an installment payment across the plan (default type)', async () => {
    const plan = installmentPlan(12, 112500);
    const event: any = { _id: eventId, salonId, customerId: undefined, quoteId: undefined, paymentPlanSnapshot: plan, save: vi.fn().mockResolvedValue(undefined) };
    mocks.eventFindOne.mockResolvedValue(event);
    mocks.createPayment.mockResolvedValue({ _id: 'payment-2', paymentNumber: 'PAY-2026-00002', amount: 400000, save: vi.fn().mockResolvedValue(undefined) });

    const response = await request(app).post(`/api/events/${eventId}/payments`).set('Cookie', adminCookie).send({ amount: 400000, method: 'cash' });

    expect(response.status).toBe(201);
    expect(mocks.createPayment).toHaveBeenCalledWith(expect.objectContaining({ type: 'installment' }), adminId);
    expect(event.paymentPlanSnapshot[0]).toMatchObject({ status: 'paid', paidAmount: 112500 });
    expect(event.paymentPlanSnapshot[3]).toMatchObject({ status: 'partial', paidAmount: 62500 });
    expect(event.save).toHaveBeenCalled();
  });
});
