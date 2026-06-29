import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
import { Contract, Payment } from './crm.models';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { writeAuditLog } from '../audit/audit.service';
import { cancelPayment, createPayment, markPaymentPaid, paymentSummary, recalculateContractPayments, refundPayment, updatePayment } from './payments.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const paymentTypes = ['deposit', 'installment', 'balance', 'addendum', 'extra', 'security_deposit', 'adjustment', 'refund', 'other'] as const;
const paymentMethods = ['cash', 'bank_transfer', 'mercado_pago', 'card', 'other'] as const;
const paymentStatuses = ['pending', 'paid', 'cancelled', 'refunded'] as const;
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const listSchema = z.object({ body: z.unknown().optional(), params: z.object({}), query: z.record(z.string(), z.unknown()) });
const paymentBody = z.object({
  customerId: objectId.optional(),
  eventId: objectId.optional(),
  contractId: objectId,
  quoteId: objectId.optional(),
  salonId: objectId.optional(),
  type: z.enum(paymentTypes).optional(),
  method: z.enum(paymentMethods).optional(),
  status: z.enum(paymentStatuses).optional(),
  amount: z.coerce.number().positive(),
  dueDate: z.coerce.date().optional(),
  paidAt: z.coerce.date().optional(),
  receiptNumber: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  affectsContractBalance: z.boolean().optional()
});
const createSchema = z.object({ body: paymentBody, params: z.object({}), query: z.object({}) });
const updateSchema = z.object({ body: paymentBody.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) });
const actionSchema = z.object({ body: paymentBody.pick({ method: true, paidAt: true, receiptNumber: true, reference: true, notes: true, amount: true }).partial().optional().default({}), params: z.object({ id: objectId }), query: z.object({}) });

const router = Router();

function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function scopedQuery(request: Request): Record<string, unknown>[] {
  return request.user!.roles.includes(Role.ADMIN) ? [] : [{ salonId: { $in: request.user!.salonIds } }];
}
function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }, ...scopedQuery(request)];
  for (const key of ['customerId', 'eventId', 'contractId', 'quoteId', 'salonId']) {
    const value = queryValue(request.query[key]);
    if (value && objectId.safeParse(value).success) terms.push({ [key]: value });
  }
  const status = queryValue(request.query.status);
  if (status && paymentStatuses.includes(status as any)) terms.push({ status });
  const type = queryValue(request.query.type);
  if (type && paymentTypes.includes(type as any)) terms.push({ type });
  const method = queryValue(request.query.method);
  if (method && paymentMethods.includes(method as any)) terms.push({ method });
  const search = queryValue(request.query.search);
  if (search) terms.push({ $or: ['paymentNumber', 'receiptNumber', 'reference', 'notes'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  return terms.length === 1 ? terms[0] : { $and: terms };
}
async function ensurePaymentAccess(request: Request, payment: any): Promise<void> {
  if (!payment || payment.deletedAt) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  if (payment.salonId && !canAccessSalon(request.user!, payment.salonId.toString())) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}
async function ensureContractAccess(request: Request, contractId: string): Promise<void> {
  const contract = await Contract.findOne({ _id: contractId, deletedAt: null }).lean();
  if (!contract) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  if ((contract as any).salonId && !canAccessSalon(request.user!, (contract as any).salonId.toString())) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.PAYMENTS_READ), validateRequest(listSchema), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(queryValue(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(queryValue(request.query.limit)) || 20));
  const query = buildQuery(request);
  const totalItems = await Payment.countDocuments(query);
  const items = await Payment.find(query)
    .populate('customerId', 'fullName phone email')
    .populate('eventId', 'eventName eventType eventDate')
    .populate('contractId', 'contractNumber totalAmount balanceAmount status')
    .populate('salonId', 'name')
    .sort({ paidAt: -1, dueDate: 1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } });
}));

router.post('/', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(createSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, request.body.contractId);
  const payment = await createPayment(request.body, request.user!.id);
  await writeAuditLog(request, 'PAYMENT_CREATE', 'Payment', payment._id.toString(), { contractId: payment.contractId });
  return sendSuccess(response, { payment }, 201, getApiMessage('PAYMENT_CREATED'));
}));

router.get('/summary/contracts/:id', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, request.params.id);
  return sendSuccess(response, { summary: await paymentSummary({ contractId: request.params.id }) });
}));

router.get('/:id', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const payment = await Payment.findOne({ _id: request.params.id, deletedAt: null })
    .populate('customerId', 'fullName phone email')
    .populate('eventId', 'eventName eventType eventDate')
    .populate('contractId', 'contractNumber totalAmount paidAmount balanceAmount status')
    .populate('salonId', 'name')
    .populate('quoteId', 'quoteNumber totalAmount status')
    .lean();
  await ensurePaymentAccess(request, payment);
  return sendSuccess(response, { payment });
}));

router.patch('/:id', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const existing = await Payment.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensurePaymentAccess(request, existing);
  const payment = await updatePayment(request.params.id, request.body, request.user!.id);
  await writeAuditLog(request, 'PAYMENT_UPDATE', 'Payment', payment._id.toString());
  return sendSuccess(response, { payment }, 200, getApiMessage('PAYMENT_UPDATED'));
}));

router.post('/:id/mark-paid', requirePermission(Permission.PAYMENTS_APPROVE), validateRequest(actionSchema), asyncHandler(async (request, response) => {
  await ensurePaymentAccess(request, await Payment.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const payment = await markPaymentPaid(request.params.id, request.body, request.user!.id);
  await writeAuditLog(request, 'PAYMENT_MARK_PAID', 'Payment', payment._id.toString());
  return sendSuccess(response, { payment }, 200, getApiMessage('PAYMENT_UPDATED'));
}));

router.post('/:id/cancel', requirePermission(Permission.PAYMENTS_REJECT), validateRequest(idSchema), asyncHandler(async (request, response) => {
  await ensurePaymentAccess(request, await Payment.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const payment = await cancelPayment(request.params.id, request.user!.id);
  await writeAuditLog(request, 'PAYMENT_CANCEL', 'Payment', payment._id.toString());
  return sendSuccess(response, { payment }, 200, getApiMessage('PAYMENT_CANCELLED'));
}));

router.post('/:id/refund', requirePermission(Permission.PAYMENTS_APPROVE), validateRequest(actionSchema), asyncHandler(async (request, response) => {
  await ensurePaymentAccess(request, await Payment.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const result = await refundPayment(request.params.id, request.body, request.user!.id);
  await writeAuditLog(request, 'PAYMENT_REFUND', 'Payment', result.payment._id.toString(), { originalPaymentId: request.params.id });
  return sendSuccess(response, result, 201, getApiMessage('PAYMENT_REFUNDED'));
}));

router.delete('/:id', requirePermission(Permission.PAYMENTS_REJECT), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const payment: any = await Payment.findOne({ _id: request.params.id, deletedAt: null });
  await ensurePaymentAccess(request, payment);
  payment.deletedAt = new Date();
  payment.deletedBy = request.user!.id;
  payment.updatedBy = request.user!.id;
  await payment.save();
  await recalculateContractPayments(payment.contractId.toString());
  await writeAuditLog(request, 'PAYMENT_DELETE', 'Payment', payment._id.toString());
  return sendSuccess(response, { deleted: true }, 200, getApiMessage('PAYMENT_DELETED'));
}));

export default router;
