import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contractFindOne: vi.fn(),
  eventFindOne: vi.fn(),
  paymentFindOne: vi.fn(),
  sendEmail: vi.fn()
}));

vi.mock('../src/modules/crm/crm.models', () => ({
  Contract: { findOne: mocks.contractFindOne },
  Event: { findOne: mocks.eventFindOne },
  Payment: { findOne: mocks.paymentFindOne }
}));
vi.mock('../src/modules/email/email.service', () => ({ sendEmail: mocks.sendEmail }));

import {
  paymentCollectionWhatsAppUrl,
  resolvePaymentCollectionContact,
  sendPaymentCollectionEmail
} from '../src/modules/crm/payment-collection.service';

function populateQuery<T>(result: T) {
  const query: any = { populate: vi.fn(), lean: vi.fn().mockResolvedValue(result) };
  query.populate.mockReturnValue(query);
  return query;
}

function leanQuery<T>(result: T) {
  const query: any = { sort: vi.fn(), select: vi.fn(), lean: vi.fn().mockResolvedValue(result) };
  query.sort.mockReturnValue(query);
  query.select.mockReturnValue(query);
  return query;
}

describe('payment collection service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.contractFindOne.mockReturnValue(leanQuery(undefined));
    mocks.eventFindOne.mockReturnValue(populateQuery(undefined));
    mocks.paymentFindOne.mockReturnValue(populateQuery(undefined));
    mocks.sendEmail.mockResolvedValue(true);
  });

  it('prepares a professional, cordial payment reminder for an overdue ledger payment', async () => {
    mocks.paymentFindOne.mockReturnValue(populateQuery({
      _id: '507f1f77bcf86cd799439011',
      salonId: '507f1f77bcf86cd799439012',
      source: 'manual',
      status: 'pending',
      paymentNumber: 'PAG-0007',
      amount: 85_000,
      dueDate: '2026-07-20',
      customerId: { _id: '507f1f77bcf86cd799439013', fullName: 'Ana Pérez', email: 'ana@example.com', phone: '+54 9 11 5555 5555' },
      eventId: { eventName: 'Cumpleaños de Ana', status: 'confirmed' }
    }));

    const contact = await resolvePaymentCollectionContact({ source: 'payment', paymentId: '507f1f77bcf86cd799439011' }, new Date('2026-07-28T15:00:00.000Z'));

    expect(contact).toMatchObject({
      customer: { fullName: 'Ana Pérez', email: 'ana@example.com' },
      obligation: { label: 'el pago PAG-0007', amount: 85_000, dueDate: '2026-07-20', eventName: 'Cumpleaños de Ana' }
    });
    expect(contact.email.subject).toContain('Recordatorio cordial');
    expect(contact.email.message).toContain('Esperamos que estés muy bien.');
    expect(contact.email.message).toContain('Si ya realizaste el pago, por favor desestimá este mensaje');
    expect(contact.whatsapp.message).toContain('estamos a disposición para ayudarte');
    expect(paymentCollectionWhatsAppUrl(contact, contact.whatsapp.message)).toContain('https://wa.me/5491155555555?text=');
  });

  it('does not allow collection contact for a payment that is not yet overdue', async () => {
    mocks.paymentFindOne.mockReturnValue(populateQuery({
      _id: '507f1f77bcf86cd799439011',
      source: 'manual',
      status: 'pending',
      dueDate: '2026-07-28'
    }));

    await expect(resolvePaymentCollectionContact({ source: 'payment', paymentId: '507f1f77bcf86cd799439011' }, new Date('2026-07-28T15:00:00.000Z')))
      .rejects.toMatchObject({ code: 'PAYMENT_COLLECTION_NOT_OVERDUE' });
  });

  it('uses the remaining amount of an overdue installment from the event plan', async () => {
    mocks.eventFindOne.mockReturnValue(populateQuery({
      _id: '507f1f77bcf86cd799439021',
      salonId: '507f1f77bcf86cd799439022',
      status: 'confirmed',
      eventName: 'Boda de Sol y Martín',
      customerId: { _id: '507f1f77bcf86cd799439023', fullName: 'Sol Díaz', phone: '+54 9 11 4444 4444' },
      paymentPlanSnapshot: [{ id: 'second-installment', label: 'Segunda cuota', amount: 120_000, paidAmount: 35_000, status: 'partial', dueDate: '2026-07-18' }]
    }));
    mocks.contractFindOne.mockReturnValue(leanQuery({ _id: '507f1f77bcf86cd799439024', paymentPlanSnapshot: [] }));

    const contact = await resolvePaymentCollectionContact({ source: 'installment', eventId: '507f1f77bcf86cd799439021', installmentId: 'second-installment' }, new Date('2026-07-28T15:00:00.000Z'));

    expect(contact).toMatchObject({
      auditEntity: { type: 'Event', id: '507f1f77bcf86cd799439021' },
      obligation: { label: 'la cuota Segunda cuota', amount: 85_000, dueDate: '2026-07-18', eventName: 'Boda de Sol y Martín' }
    });
  });

  it('sends the edited email copy and reports unavailable SMTP explicitly', async () => {
    const contact = {
      target: { source: 'payment' as const, paymentId: '507f1f77bcf86cd799439011' },
      auditEntity: { type: 'Payment' as const, id: '507f1f77bcf86cd799439011' },
      customer: { fullName: 'Ana Pérez', email: 'ana@example.com' },
      obligation: { label: 'el pago pendiente', amount: 1, dueDate: '2026-07-20' },
      email: { subject: '', message: '' },
      whatsapp: { message: '' }
    };
    await sendPaymentCollectionEmail(contact, 'Seguimiento de pago', 'Hola Ana,\n\nQuedamos atentos.');
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'ana@example.com',
      subject: 'Seguimiento de pago',
      text: 'Hola Ana,\n\nQuedamos atentos.',
      html: '<p>Hola Ana,</p><p>Quedamos atentos.</p>'
    }));

    mocks.sendEmail.mockResolvedValueOnce(false);
    await expect(sendPaymentCollectionEmail(contact, 'Seguimiento', 'Mensaje')).rejects.toMatchObject({ code: 'PAYMENT_COLLECTION_EMAIL_UNAVAILABLE' });
  });
});
