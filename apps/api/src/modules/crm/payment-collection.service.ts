import { CalendarItem, Contract, Event, Payment } from './crm.models';
import { ApiError } from '../../middlewares/errorHandler';
import { sendEmail } from '../email/email.service';
import { argentinaDateKey, dueDateKey } from '../../utils/argentina-date';

const TERMINAL_EVENT_STATUSES = new Set(['cancelled', 'lost']);
const TERMINAL_INSTALLMENT_STATUSES = new Set(['paid', 'cancelled']);

export type PaymentCollectionTarget =
  | { source: 'payment'; paymentId: string }
  | { source: 'installment'; eventId: string; installmentId: string };

export type PaymentCollectionContact = {
  target: PaymentCollectionTarget;
  auditEntity: { type: 'Payment' | 'Event'; id: string };
  salonId?: string;
  customer: { id?: string; fullName: string; email?: string; phone?: string };
  obligation: { label: string; amount: number; dueDate: string; eventName?: string };
  email: { subject: string; message: string };
  whatsapp: { message: string };
};

function idOf(value: unknown): string | undefined {
  const item: any = value;
  const raw = item?._id ?? item;
  return raw?.toString?.() ?? (typeof raw === 'string' ? raw : undefined);
}

function money(value: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
}

function date(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00.000Z`));
}

function eventName(event: any): string | undefined {
  const name = event?.eventName || event?.eventType;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

function customerContact(value: unknown): { id?: string; fullName: string; email?: string; phone?: string } {
  const customer: any = typeof value === 'object' && value ? value : {};
  const fullName = String(customer.fullName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || '');
  return {
    id: idOf(customer),
    fullName: fullName.trim() || 'cliente',
    email: typeof customer.email === 'string' && customer.email.trim() ? customer.email.trim() : undefined,
    phone: typeof customer.phone === 'string' && customer.phone.trim() ? customer.phone.trim() : undefined
  };
}

function assertOverdue(status: unknown, dueKey: string | undefined, now: Date): asserts dueKey is string {
  if (String(status) !== 'pending' || !dueKey || dueKey >= argentinaDateKey(now)) {
    throw new ApiError(422, 'PAYMENT_COLLECTION_NOT_OVERDUE', 'Sólo podés solicitar el pago de obligaciones pendientes y vencidas.');
  }
}

function remainingInstallmentAmount(installment: any): number {
  return Math.max(0, Number(installment?.amount ?? 0) - Number(installment?.paidAmount ?? 0));
}

function paymentPlan(event: any, contract: any): any[] {
  if (Array.isArray(event?.paymentPlanSnapshot) && event.paymentPlanSnapshot.length) return event.paymentPlanSnapshot;
  return Array.isArray(contract?.paymentPlanSnapshot) ? contract.paymentPlanSnapshot : [];
}

function paymentDescription(obligation: { label: string; amount: number; dueDate: string; eventName?: string }, recipient: string): { subject: string; email: string; whatsapp: string } {
  const eventLine = obligation.eventName ? ` Corresponde a ${obligation.eventName}.` : '';
  const amount = money(obligation.amount);
  const dueDate = date(obligation.dueDate);
  const greeting = recipient === 'cliente' ? 'Hola,' : `Hola ${recipient},`;
  const whatsappGreeting = recipient === 'cliente' ? 'Hola, ¿cómo estás?' : `Hola ${recipient}, ¿cómo estás?`;
  const email = [
    greeting,
    'Esperamos que estés muy bien.',
    `Te escribimos desde M&M Eventos para recordarte cordialmente que figura pendiente ${obligation.label} por ${amount}, con vencimiento el ${dueDate}.${eventLine}`,
    'Si ya realizaste el pago, por favor desestimá este mensaje y, si es posible, compartinos el comprobante para actualizar el registro. Si necesitás coordinar una alternativa de pago o tenés alguna consulta, estamos a disposición para ayudarte.',
    'Agradecemos mucho tu atención y quedamos atentos.',
    'Saludos cordiales,\nEquipo de M&M Eventos'
  ].join('\n\n');
  const whatsapp = [
    whatsappGreeting,
    `Te escribimos desde M&M Eventos para recordarte cordialmente que figura pendiente ${obligation.label} por ${amount}, con vencimiento el ${dueDate}.${eventLine}`,
    'Si ya realizaste el pago, por favor desestimá este mensaje y, si podés, envianos el comprobante. Si necesitás coordinar una alternativa de pago o tenés alguna consulta, estamos a disposición para ayudarte.',
    'Muchas gracias. Saludos cordiales,\nEquipo de M&M Eventos'
  ].join('\n\n');
  return {
    subject: `Recordatorio cordial de pago pendiente${obligation.eventName ? ` · ${obligation.eventName}` : ''}`,
    email,
    whatsapp
  };
}

function contactFromObligation(input: {
  target: PaymentCollectionTarget;
  auditEntity: PaymentCollectionContact['auditEntity'];
  salonId?: string;
  customer: unknown;
  obligation: PaymentCollectionContact['obligation'];
}): PaymentCollectionContact {
  const customer = customerContact(input.customer);
  const content = paymentDescription(input.obligation, customer.fullName);
  return {
    target: input.target,
    auditEntity: input.auditEntity,
    salonId: input.salonId,
    customer,
    obligation: input.obligation,
    email: { subject: content.subject, message: content.email },
    whatsapp: { message: content.whatsapp }
  };
}

async function contactForPayment(paymentId: string, now: Date): Promise<PaymentCollectionContact> {
  const payment: any = await Payment.findOne({ _id: paymentId, deletedAt: null })
    .populate('customerId', 'fullName firstName lastName phone email')
    .populate('eventId', 'eventName eventType status')
    .lean();
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  if (payment.source === 'ticket_order') throw new ApiError(422, 'PAYMENT_TICKET_ORDER_READONLY');
  const dueDate = dueDateKey(payment.dueDate);
  assertOverdue(payment.status, dueDate, now);
  return contactFromObligation({
    target: { source: 'payment', paymentId },
    auditEntity: { type: 'Payment', id: idOf(payment._id) ?? paymentId },
    salonId: idOf(payment.salonId),
    customer: payment.customerId,
    obligation: {
      label: payment.paymentNumber ? `el pago ${payment.paymentNumber}` : 'el pago pendiente',
      amount: Math.max(0, Number(payment.amount ?? 0)),
      dueDate,
      eventName: eventName(payment.eventId)
    }
  });
}

async function contactForInstallment(eventId: string, installmentId: string, now: Date): Promise<PaymentCollectionContact> {
  const event: any = await Event.findOne({ _id: eventId, deletedAt: null })
    .populate('customerId', 'fullName firstName lastName phone email')
    .lean();
  if (!event || TERMINAL_EVENT_STATUSES.has(String(event.status))) throw new ApiError(404, 'EVENT_NOT_FOUND');
  const contract: any = await Contract.findOne({ eventId: event._id, deletedAt: null, status: 'approved' })
    .sort({ versionNumber: -1, createdAt: -1 })
    .select('_id paymentPlanSnapshot')
    .lean();
  if (!contract) throw new ApiError(422, 'PAYMENT_COLLECTION_INSTALLMENT_NOT_FOUND', 'No se encontró un contrato aprobado para esta cuota.');
  const installment = paymentPlan(event, contract).find((item: any) => String(item?.id ?? '') === installmentId);
  const dueDate = dueDateKey(installment?.paymentWindowEnd ?? installment?.dueDate);
  const remainingAmount = remainingInstallmentAmount(installment);
  if (!installment || TERMINAL_INSTALLMENT_STATUSES.has(String(installment.status ?? '')) || remainingAmount <= 0) {
    throw new ApiError(422, 'PAYMENT_COLLECTION_INSTALLMENT_NOT_FOUND', 'La cuota ya no está pendiente de cobro.');
  }
  assertOverdue('pending', dueDate, now);
  return contactFromObligation({
    target: { source: 'installment', eventId, installmentId },
    auditEntity: { type: 'Event', id: idOf(event._id) ?? eventId },
    salonId: idOf(event.salonId),
    customer: event.customerId,
    obligation: {
      label: installment.label ? `la cuota ${String(installment.label)}` : 'la cuota pendiente',
      amount: remainingAmount,
      dueDate,
      eventName: eventName(event)
    }
  });
}

export async function resolvePaymentCollectionContact(target: PaymentCollectionTarget, now = new Date()): Promise<PaymentCollectionContact> {
  return target.source === 'payment'
    ? contactForPayment(target.paymentId, now)
    : contactForInstallment(target.eventId, target.installmentId, now);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

export async function sendPaymentCollectionEmail(contact: PaymentCollectionContact, subject: string, message: string): Promise<void> {
  if (!contact.customer.email) throw new ApiError(422, 'PAYMENT_COLLECTION_EMAIL_MISSING', 'El cliente no tiene un email registrado.');
  const plainText = message.trim();
  const sent = await sendEmail({
    to: contact.customer.email,
    subject: subject.trim(),
    text: plainText,
    html: plainText.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`).join('')
  });
  if (!sent) throw new ApiError(503, 'PAYMENT_COLLECTION_EMAIL_UNAVAILABLE', 'El envío de email no está configurado en este momento.');
}

export function paymentCollectionWhatsAppUrl(contact: PaymentCollectionContact, message: string): string {
  const phone = contact.customer.phone?.replace(/\D/g, '') ?? '';
  if (phone.length < 8) throw new ApiError(422, 'PAYMENT_COLLECTION_WHATSAPP_MISSING', 'El cliente no tiene un número de WhatsApp válido registrado.');
  return `https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`;
}

function collectionTargetKey(target: PaymentCollectionTarget): string {
  return target.source === 'payment' ? `payment:${target.paymentId}` : `installment:${target.eventId}:${target.installmentId}`;
}

const DEFAULT_FOLLOW_UP_DAYS = 3;

/**
 * The "reintentar automáticamente si sigue sin pagarse" checkbox on the manual collection
 * screen. Distinct from client-payment-reminders.service.ts's blanket opt-in policy: this is a
 * single, operator-initiated internal follow-up nudge (to the same operator, not the client),
 * scoped to the one obligation they just contacted the client about. Re-checking the box just
 * reschedules the same follow-up rather than stacking a new one, since the automationKey is
 * keyed by the obligation, not by when it was scheduled.
 */
export async function schedulePaymentCollectionFollowUp(contact: PaymentCollectionContact, operatorUserId: string, followUpInDays = DEFAULT_FOLLOW_UP_DAYS): Promise<void> {
  const targetKey = collectionTargetKey(contact.target);
  const automationKey = `collection_followup:${targetKey}`;
  const sendAt = new Date(Date.now() + followUpInDays * 86_400_000);
  await CalendarItem.findOneAndUpdate(
    { automationKey },
    {
      $set: {
        type: 'reminder',
        source: 'system',
        title: `Seguimiento de cobro — ${contact.obligation.label}`,
        description: `Revisar si ${contact.customer.fullName} ya pagó ${contact.obligation.label} (${money(contact.obligation.amount)}). Si sigue pendiente, contactalo de nuevo.`,
        startAt: sendAt,
        allDay: false,
        status: 'scheduled',
        priority: 'normal',
        visibility: 'private',
        eventId: contact.target.source === 'installment' ? contact.target.eventId : undefined,
        paymentId: contact.target.source === 'payment' ? contact.target.paymentId : undefined,
        customerId: contact.customer.id,
        salonId: contact.salonId,
        assignedToUserId: operatorUserId,
        metadata: { collectionFollowUp: true, targetKey, source: contact.target.source },
        // Reset unconditionally (not $setOnInsert): re-checking the box is a deliberate
        // reschedule, even if a prior follow-up for this same obligation already fired.
        notification: { enabled: true, channels: ['system', 'email'], sendAt, status: 'scheduled', attemptCount: 0 }
      }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );
}
