import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
import { Contract, ContractAddendum, Payment } from './crm.models';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { writeAuditLog } from '../audit/audit.service';
import { getApiMessage } from '../../utils/messages';
import { approveAddendum, approveContract, cancelContract, createAddendum, recalculateContractTotals, requestContractChanges, updateAddendum } from './event-to-contract.service';
import { createPayment, paymentSummary } from './payments.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const statuses = ['draft', 'pending_approval', 'approved', 'requires_changes', 'cancelled', 'superseded'] as const;
const addendumStatuses = ['draft', 'pending_approval', 'approved', 'rejected', 'cancelled'] as const;
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const statusSchema = z.object({ body: z.object({ status: z.enum(statuses) }), params: z.object({ id: objectId }), query: z.object({}) });
const updateSchema = z.object({
  body: z.object({
    customerSnapshot: z.unknown().optional(),
    eventSnapshot: z.unknown().optional(),
    commercialSnapshot: z.unknown().optional(),
    menuSnapshot: z.unknown().optional(),
    servicesSnapshot: z.unknown().optional(),
    paymentAgreementSnapshot: z.unknown().optional(),
    legalTermsSnapshot: z.unknown().optional(),
    securityDeposit: z.unknown().optional(),
    securityDepositSnapshot: z.unknown().optional(),
    discountsAmount: z.coerce.number().min(0).optional(),
    paidAmount: z.coerce.number().min(0).optional(),
    observations: z.string().trim().optional()
  }).refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'),
  params: z.object({ id: objectId }),
  query: z.object({})
});
const addendumItemSchema = z.object({ type: z.enum(['extra_service', 'beverage', 'decoration', 'menu_upgrade', 'staff', 'hour_extension', 'other']).optional(), name: z.string().trim().min(1), description: z.string().trim().optional(), quantity: z.coerce.number().positive().optional(), unitPrice: z.coerce.number().min(0).optional(), totalPrice: z.coerce.number().min(0).optional() });
const addendumSchema = z.object({ body: z.object({ title: z.string().trim().min(1), description: z.string().trim().optional(), status: z.enum(addendumStatuses).optional(), items: z.array(addendumItemSchema).min(1), discountAmount: z.coerce.number().min(0).optional() }), params: z.object({ id: objectId }), query: z.object({}) });
const addendumPatchSchema = z.object({ body: addendumSchema.shape.body.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId, addendumId: objectId }), query: z.object({}) });
const addendumIdSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId, addendumId: objectId }), query: z.object({}) });
const paymentTypes = ['deposit', 'installment', 'balance', 'addendum', 'extra', 'security_deposit', 'adjustment', 'refund', 'other'] as const;
const paymentMethods = ['cash', 'bank_transfer', 'mercado_pago', 'card', 'other'] as const;
const paymentStatuses = ['pending', 'paid', 'cancelled', 'refunded'] as const;
const contractPaymentSchema = z.object({
  body: z.object({
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
  }),
  params: z.object({ id: objectId }),
  query: z.object({})
});

const router = Router();

function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function scopedQuery(request: Request): Record<string, unknown>[] {
  return request.user!.roles.includes(Role.ADMIN) ? [] : [{ salonId: { $in: request.user!.salonIds } }];
}
async function ensureContractAccess(request: Request, contract: any): Promise<void> {
  if (!contract || contract.deletedAt) throw new ApiError(404, 'CONTRACT_NOT_FOUND');
  if (contract.salonId && !canAccessSalon(request.user!, contract.salonId.toString())) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}
function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }, ...scopedQuery(request)];
  const status = queryValue(request.query.status);
  if (status && statuses.includes(status as any)) terms.push({ status });
  const customerId = queryValue(request.query.customerId);
  if (customerId && objectId.safeParse(customerId).success) terms.push({ customerId });
  const eventId = queryValue(request.query.eventId);
  if (eventId && objectId.safeParse(eventId).success) terms.push({ eventId });
  const salonId = queryValue(request.query.salonId);
  if (salonId && objectId.safeParse(salonId).success) terms.push({ salonId });
  const term = queryValue(request.query.search);
  if (term) terms.push({ $or: ['contractNumber', 'customerSnapshot.fullName', 'eventSnapshot.eventName', 'eventSnapshot.eventType'].map((field) => ({ [field]: { $regex: term, $options: 'i' } })) });
  return terms.length === 1 ? terms[0] : { $and: terms };
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.EVENTS_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(queryValue(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(queryValue(request.query.limit)) || 20));
  const query = buildQuery(request);
  const totalItems = await Contract.countDocuments(query);
  const items = await Contract.find(query)
    .populate('eventId', 'eventName eventType eventDate status')
    .populate('customerId', 'fullName phone email')
    .populate('salonId', 'name')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } });
}));

router.get('/:id', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const contract = await Contract.findOne({ _id: request.params.id, deletedAt: null })
    .populate('eventId', 'eventName eventType eventDate status')
    .populate('customerId', 'fullName phone email')
    .populate('salonId', 'name address locality city')
    .populate('quoteId', 'quoteNumber status totalAmount')
    .lean();
  await ensureContractAccess(request, contract);
  return sendSuccess(response, { contract });
}));

router.patch('/:id', requirePermission(Permission.EVENTS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const contract: any = await Contract.findOne({ _id: request.params.id, deletedAt: null });
  await ensureContractAccess(request, contract);
  Object.assign(contract, request.body, { updatedBy: request.user!.id });
  await contract.save();
  await recalculateContractTotals(contract._id.toString());
  await writeAuditLog(request, 'CONTRACT_UPDATE', 'Contract', contract._id.toString());
  return sendSuccess(response, { contract }, 200, getApiMessage('CONTRACT_UPDATED'));
}));

router.patch('/:id/status', requirePermission(Permission.EVENTS_UPDATE), validateRequest(statusSchema), asyncHandler(async (request, response) => {
  const contract: any = await Contract.findOne({ _id: request.params.id, deletedAt: null });
  await ensureContractAccess(request, contract);
  contract.status = request.body.status;
  contract.cancelledAt = request.body.status === 'cancelled' ? new Date() : contract.cancelledAt;
  contract.updatedBy = request.user!.id;
  await contract.save();
  await writeAuditLog(request, 'CONTRACT_STATUS_UPDATE', 'Contract', contract._id.toString(), { status: contract.status });
  return sendSuccess(response, { contract }, 200, getApiMessage('CONTRACT_UPDATED'));
}));

router.post('/:id/approve', requirePermission(Permission.EVENTS_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const contract = await approveContract(request.params.id, request.user!.id);
  await writeAuditLog(request, 'CONTRACT_APPROVE', 'Contract', contract._id.toString());
  return sendSuccess(response, { contract }, 200, getApiMessage('CONTRACT_UPDATED'));
}));

router.post('/:id/request-changes', requirePermission(Permission.EVENTS_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const contract = await requestContractChanges(request.params.id, request.user!.id);
  await writeAuditLog(request, 'CONTRACT_REQUEST_CHANGES', 'Contract', contract._id.toString());
  return sendSuccess(response, { contract }, 200, getApiMessage('CONTRACT_UPDATED'));
}));

router.post('/:id/cancel', requirePermission(Permission.EVENTS_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const contract = await cancelContract(request.params.id, request.user!.id);
  await writeAuditLog(request, 'CONTRACT_CANCEL', 'Contract', contract._id.toString());
  return sendSuccess(response, { contract }, 200, getApiMessage('CONTRACT_UPDATED'));
}));

router.get('/:id/payments', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const items = await Payment.find({ contractId: request.params.id, deletedAt: null }).populate('customerId', 'fullName phone email').populate('eventId', 'eventName eventType eventDate').populate('salonId', 'name').sort({ paidAt: -1, dueDate: 1, createdAt: -1 }).lean();
  const summary = await paymentSummary({ contractId: request.params.id });
  return sendSuccess(response, { items, summary });
}));

router.post('/:id/payments', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(contractPaymentSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const payment = await createPayment({ ...request.body, contractId: request.params.id }, request.user!.id);
  await writeAuditLog(request, 'CONTRACT_PAYMENT_CREATE', 'Payment', payment._id.toString(), { contractId: request.params.id });
  return sendSuccess(response, { payment }, 201, getApiMessage('PAYMENT_CREATED'));
}));

router.get('/:id/payment-summary', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  return sendSuccess(response, { summary: await paymentSummary({ contractId: request.params.id }) });
}));

router.get('/:id/addendums', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const items = await ContractAddendum.find({ contractId: request.params.id, deletedAt: null }).sort({ createdAt: -1 }).lean();
  return sendSuccess(response, { items });
}));

router.post('/:id/addendums', requirePermission(Permission.EVENTS_UPDATE), validateRequest(addendumSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const addendum = await createAddendum(request.params.id, request.body, request.user!.id);
  await writeAuditLog(request, 'CONTRACT_ADDENDUM_CREATE', 'ContractAddendum', addendum._id.toString(), { contractId: request.params.id });
  return sendSuccess(response, { addendum }, 201, getApiMessage('CONTRACT_ADDENDUM_CREATED'));
}));

router.get('/:id/addendums/:addendumId', requirePermission(Permission.EVENTS_READ), validateRequest(addendumIdSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const addendum = await ContractAddendum.findOne({ _id: request.params.addendumId, contractId: request.params.id, deletedAt: null }).lean();
  if (!addendum) throw new ApiError(404, 'CONTRACT_ADDENDUM_NOT_FOUND');
  return sendSuccess(response, { addendum });
}));

router.patch('/:id/addendums/:addendumId', requirePermission(Permission.EVENTS_UPDATE), validateRequest(addendumPatchSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const addendum = await updateAddendum(request.params.addendumId, request.body, request.user!.id);
  await writeAuditLog(request, 'CONTRACT_ADDENDUM_UPDATE', 'ContractAddendum', addendum._id.toString(), { contractId: request.params.id });
  return sendSuccess(response, { addendum }, 200, getApiMessage('CONTRACT_ADDENDUM_UPDATED'));
}));

router.post('/:id/addendums/:addendumId/approve', requirePermission(Permission.EVENTS_UPDATE), validateRequest(addendumIdSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const addendum = await approveAddendum(request.params.addendumId, request.user!.id);
  await writeAuditLog(request, 'CONTRACT_ADDENDUM_APPROVE', 'ContractAddendum', addendum._id.toString(), { contractId: request.params.id });
  return sendSuccess(response, { addendum }, 200, getApiMessage('CONTRACT_ADDENDUM_UPDATED'));
}));

for (const [path, status] of [['reject', 'rejected'], ['cancel', 'cancelled']] as const) router.post(`/:id/addendums/:addendumId/${path}`, requirePermission(Permission.EVENTS_UPDATE), validateRequest(addendumIdSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const addendum: any = await ContractAddendum.findOne({ _id: request.params.addendumId, contractId: request.params.id, deletedAt: null });
  if (!addendum) throw new ApiError(404, 'CONTRACT_ADDENDUM_NOT_FOUND');
  if (addendum.status === 'approved') throw new ApiError(422, 'CONTRACT_ADDENDUM_APPROVED_LOCKED');
  addendum.status = status;
  addendum.cancelledAt = status === 'cancelled' ? new Date() : addendum.cancelledAt;
  addendum.updatedBy = request.user!.id;
  await addendum.save();
  await recalculateContractTotals(request.params.id);
  await writeAuditLog(request, `CONTRACT_ADDENDUM_${status.toUpperCase()}`, 'ContractAddendum', addendum._id.toString(), { contractId: request.params.id });
  return sendSuccess(response, { addendum }, 200, getApiMessage('CONTRACT_ADDENDUM_UPDATED'));
}));

router.delete('/:id/addendums/:addendumId', requirePermission(Permission.EVENTS_UPDATE), validateRequest(addendumIdSchema), asyncHandler(async (request, response) => {
  await ensureContractAccess(request, await Contract.findOne({ _id: request.params.id, deletedAt: null }).lean());
  const addendum: any = await ContractAddendum.findOne({ _id: request.params.addendumId, contractId: request.params.id, deletedAt: null });
  if (!addendum) throw new ApiError(404, 'CONTRACT_ADDENDUM_NOT_FOUND');
  if (addendum.status === 'approved') throw new ApiError(422, 'CONTRACT_ADDENDUM_APPROVED_LOCKED');
  addendum.deletedAt = new Date();
  addendum.deletedBy = request.user!.id;
  addendum.updatedBy = request.user!.id;
  await addendum.save();
  await recalculateContractTotals(request.params.id);
  return sendSuccess(response, { deleted: true }, 200, getApiMessage('CONTRACT_ADDENDUM_DELETED'));
}));

router.delete('/:id', requirePermission(Permission.EVENTS_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const contract: any = await Contract.findOne({ _id: request.params.id, deletedAt: null });
  await ensureContractAccess(request, contract);
  contract.deletedAt = new Date();
  contract.deletedBy = request.user!.id;
  contract.updatedBy = request.user!.id;
  await contract.save();
  await writeAuditLog(request, 'CONTRACT_DELETE', 'Contract', contract._id.toString());
  return sendSuccess(response, { deleted: true }, 200, getApiMessage('CONTRACT_DELETED'));
}));

export default router;
