import { Router } from 'express';
import { Permission } from '@mym/shared';
import { z } from 'zod';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { ApiError } from '../../middlewares/errorHandler';
import { validateRequest } from '../../middlewares/validateRequest';
import { writeAuditLog } from '../audit/audit.service';
import { sendSuccess } from '../../utils/api';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  paymentCollectionWhatsAppUrl,
  resolvePaymentCollectionContact,
  sendPaymentCollectionEmail,
  type PaymentCollectionContact,
  type PaymentCollectionTarget
} from './payment-collection.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const targetSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('payment'), paymentId: objectId }),
  z.object({ source: z.literal('installment'), eventId: objectId, installmentId: z.string().trim().min(1).max(120) })
]);
const baseSchema = z.object({
  body: z.object({ target: targetSchema }),
  params: z.object({}),
  query: z.object({})
});
const emailSchema = z.object({
  body: z.object({
    target: targetSchema,
    subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value), 'El asunto no puede incluir saltos de línea.'),
    message: z.string().trim().min(1).max(5_000)
  }),
  params: z.object({}),
  query: z.object({})
});
const whatsappSchema = z.object({
  body: z.object({
    target: targetSchema,
    message: z.string().trim().min(1).max(5_000)
  }),
  params: z.object({}),
  query: z.object({})
});

const router = Router();

function contactMetadata(contact: PaymentCollectionContact): Record<string, unknown> {
  return {
    source: contact.target.source,
    paymentId: contact.target.source === 'payment' ? contact.target.paymentId : undefined,
    installmentId: contact.target.source === 'installment' ? contact.target.installmentId : undefined,
    eventId: contact.target.source === 'installment' ? contact.target.eventId : undefined,
    customerId: contact.customer.id,
    dueDate: contact.obligation.dueDate,
    amount: contact.obligation.amount
  };
}

function ensureCollectionAccess(request: Express.Request, contact: PaymentCollectionContact): void {
  if (contact.salonId && !canAccessSalon(request.user!, contact.salonId)) {
    throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  }
}

async function resolveAccessibleContact(request: Express.Request, target: PaymentCollectionTarget): Promise<PaymentCollectionContact> {
  const contact = await resolvePaymentCollectionContact(target);
  ensureCollectionAccess(request, contact);
  return contact;
}

router.use(requireAuth);

router.post('/preview', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(baseSchema), asyncHandler(async (request, response) => {
  const contact = await resolveAccessibleContact(request, request.body.target);
  return sendSuccess(response, { contact });
}));

router.post('/send-email', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(emailSchema), asyncHandler(async (request, response) => {
  const contact = await resolveAccessibleContact(request, request.body.target);
  await sendPaymentCollectionEmail(contact, request.body.subject, request.body.message);
  await writeAuditLog(request, 'PAYMENT_COLLECTION_EMAIL_SENT', contact.auditEntity.type, contact.auditEntity.id, contactMetadata(contact));
  return sendSuccess(response, { sent: true });
}));

router.post('/open-whatsapp', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(whatsappSchema), asyncHandler(async (request, response) => {
  const contact = await resolveAccessibleContact(request, request.body.target);
  const whatsappUrl = paymentCollectionWhatsAppUrl(contact, request.body.message);
  await writeAuditLog(request, 'PAYMENT_COLLECTION_WHATSAPP_DRAFT_PREPARED', contact.auditEntity.type, contact.auditEntity.id, contactMetadata(contact));
  return sendSuccess(response, { whatsappUrl });
}));

export default router;
