import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveContact: vi.fn(),
  sendEmail: vi.fn(),
  whatsappUrl: vi.fn(),
  scheduleFollowUp: vi.fn(),
  writeAuditLog: vi.fn(),
  canAccessSalon: vi.fn()
}));

vi.mock('../src/middlewares/auth', () => ({
  requireAuth: (request: any, _response: any, next: () => void) => { request.user = { id: 'user-1', roles: ['admin'] }; next(); },
  requirePermission: () => (_request: any, _response: any, next: () => void) => next(),
  canAccessSalon: mocks.canAccessSalon
}));
vi.mock('../src/modules/crm/payment-collection.service', () => ({
  resolvePaymentCollectionContact: mocks.resolveContact,
  sendPaymentCollectionEmail: mocks.sendEmail,
  paymentCollectionWhatsAppUrl: mocks.whatsappUrl,
  schedulePaymentCollectionFollowUp: mocks.scheduleFollowUp
}));
vi.mock('../src/modules/audit/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }));

import paymentCollectionRoutes from '../src/modules/crm/payment-collection.routes';
import { errorHandler } from '../src/middlewares/errorHandler';

const paymentId = '507f1f77bcf86cd799439011';
const contact = {
  target: { source: 'payment' as const, paymentId },
  auditEntity: { type: 'Payment' as const, id: paymentId },
  salonId: '507f1f77bcf86cd799439012',
  customer: { id: '507f1f77bcf86cd799439013', fullName: 'Ana Pérez', email: 'ana@example.com', phone: '5491155555555' },
  obligation: { label: 'el pago PAG-0007', amount: 85_000, dueDate: '2026-07-20' },
  email: { subject: 'Recordatorio cordial', message: 'Hola Ana' },
  whatsapp: { message: 'Hola Ana' }
};

const app = express();
app.use(express.json());
app.use('/api/payment-collections', paymentCollectionRoutes);
app.use(errorHandler);

describe('payment collection routes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveContact.mockResolvedValue(contact);
    mocks.canAccessSalon.mockReturnValue(true);
    mocks.sendEmail.mockResolvedValue(undefined);
    mocks.whatsappUrl.mockReturnValue('https://wa.me/5491155555555?text=Hola');
    mocks.scheduleFollowUp.mockResolvedValue(undefined);
    mocks.writeAuditLog.mockResolvedValue(undefined);
  });

  it('previews the editable contact content for an overdue payment', async () => {
    const response = await request(app).post('/api/payment-collections/preview').send({ target: contact.target });

    expect(response.status).toBe(200);
    expect(response.body.data.contact).toEqual(contact);
    expect(mocks.resolveContact).toHaveBeenCalledWith(contact.target);
  });

  it('does not expose a payment collection contact outside the assigned salon', async () => {
    mocks.canAccessSalon.mockReturnValue(false);

    const response = await request(app).post('/api/payment-collections/preview').send({ target: contact.target });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false, error: { code: 'SALON_SCOPE_FORBIDDEN' } });
  });

  it('sends the edited email and writes an audit entry without the message content', async () => {
    const response = await request(app).post('/api/payment-collections/send-email').send({ target: contact.target, subject: 'Seguimiento de pago', message: 'Mensaje editado' });

    expect(response.status).toBe(200);
    expect(mocks.sendEmail).toHaveBeenCalledWith(contact, 'Seguimiento de pago', 'Mensaje editado');
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.anything(), 'PAYMENT_COLLECTION_EMAIL_SENT', 'Payment', paymentId, expect.objectContaining({ amount: 85_000, dueDate: '2026-07-20' }));
    expect(mocks.writeAuditLog.mock.calls[0][4]).not.toHaveProperty('message');
  });

  it('schedules a follow-up reminder when the operator checks the box, but not by default', async () => {
    const withoutCheckbox = await request(app).post('/api/payment-collections/send-email').send({ target: contact.target, subject: 'Seguimiento', message: 'Mensaje' });
    expect(withoutCheckbox.status).toBe(200);
    expect(withoutCheckbox.body.data.followUpScheduled).toBe(false);
    expect(mocks.scheduleFollowUp).not.toHaveBeenCalled();

    const withCheckbox = await request(app).post('/api/payment-collections/send-email').send({ target: contact.target, subject: 'Seguimiento', message: 'Mensaje', scheduleFollowUp: true });
    expect(withCheckbox.status).toBe(200);
    expect(withCheckbox.body.data.followUpScheduled).toBe(true);
    expect(mocks.scheduleFollowUp).toHaveBeenCalledWith(contact, 'user-1');
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.anything(), 'PAYMENT_COLLECTION_FOLLOWUP_SCHEDULED', 'Payment', paymentId, expect.anything());
  });

  it('returns the WhatsApp draft URL and records it as prepared, not delivered', async () => {
    const response = await request(app).post('/api/payment-collections/open-whatsapp').send({ target: contact.target, message: 'Mensaje editado' });

    expect(response.status).toBe(200);
    expect(response.body.data.whatsappUrl).toBe('https://wa.me/5491155555555?text=Hola');
    expect(mocks.whatsappUrl).toHaveBeenCalledWith(contact, 'Mensaje editado');
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.anything(), 'PAYMENT_COLLECTION_WHATSAPP_DRAFT_PREPARED', 'Payment', paymentId, expect.anything());
  });
});
