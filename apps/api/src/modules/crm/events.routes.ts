import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
import { Contract, Customer, Event, Payment } from './crm.models';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { writeAuditLog } from '../audit/audit.service';
import { createContractFromEvent } from './event-to-contract.service';
import { paymentSummary } from './payments.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const eventStatuses = ['draft', 'quoted', 'contract_draft', 'deposit_pending', 'reserved', 'confirmed', 'cancelled', 'lost'] as const;
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const statusSchema = z.object({ body: z.object({ status: z.enum(eventStatuses) }), params: z.object({ id: objectId }), query: z.object({}) });
const updateSchema = z.object({
  body: z.object({
    eventType: z.string().trim().optional(),
    eventName: z.string().trim().optional(),
    eventDate: z.coerce.date().optional(),
    startTime: z.string().trim().optional(),
    endTime: z.string().trim().optional(),
    guestCount: z.coerce.number().int().positive().optional(),
    status: z.enum(eventStatuses).optional(),
    estimatedAmount: z.coerce.number().min(0).optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    notes: z.string().trim().optional(),
    commercialSnapshot: z.unknown().optional(),
    menuSnapshot: z.unknown().optional(),
    servicesSnapshot: z.unknown().optional(),
    paymentSnapshot: z.unknown().optional(),
    contractReadyChecklist: z.unknown().optional()
  }).refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'),
  params: z.object({ id: objectId }),
  query: z.object({})
});

const router = Router();

function getQueryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function ensureEventAccess(request: Request, event: any): Promise<void> {
  if (!event || event.deletedAt) throw new ApiError(404, 'EVENT_NOT_FOUND');
  if (event.salonId && !canAccessSalon(request.user!, event.salonId.toString())) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}

function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  if (!request.user!.roles.includes(Role.ADMIN)) terms.push({ salonId: { $in: request.user!.salonIds } });
  const status = getQueryString(request.query.status);
  if (status && eventStatuses.includes(status as any)) terms.push({ status });
  const salonId = getQueryString(request.query.salonId);
  if (salonId && objectId.safeParse(salonId).success) terms.push({ salonId });
  const customerId = getQueryString(request.query.customerId);
  if (customerId && objectId.safeParse(customerId).success) terms.push({ customerId });
  const sourceQuoteId = getQueryString(request.query.sourceQuoteId);
  if (sourceQuoteId && objectId.safeParse(sourceQuoteId).success) terms.push({ sourceQuoteId });
  const term = getQueryString(request.query.search);
  if (term) terms.push({ $or: ['eventName', 'eventType', 'notes'].map((field) => ({ [field]: { $regex: term, $options: 'i' } })) });
  return terms.length === 1 ? terms[0] : { $and: terms };
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.EVENTS_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(getQueryString(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(getQueryString(request.query.limit)) || 20));
  const sortBy = ['createdAt', 'eventDate', 'status', 'eventName'].includes(getQueryString(request.query.sortBy) ?? '') ? getQueryString(request.query.sortBy)! : 'createdAt';
  const sortOrder = getQueryString(request.query.sortOrder) === 'asc' ? 1 : -1;
  const query = buildQuery(request);
  const totalItems = await Event.countDocuments(query);
  const items = await Event.find(query)
    .populate('customerId', 'fullName phone email')
    .populate('salonId', 'name')
    .populate('sourceLeadId', 'fullName phone email')
    .populate('sourceQuoteId', 'quoteNumber totalAmount status')
    .sort({ [sortBy]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } });
}));

router.get('/customers/:id', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer = await Customer.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND');
  return sendSuccess(response, { customer });
}));

router.get('/:id/payments', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const items = await Payment.find({ eventId: request.params.id, deletedAt: null }).populate('customerId', 'fullName phone email').populate('contractId', 'contractNumber totalAmount balanceAmount status').populate('salonId', 'name').sort({ paidAt: -1, dueDate: 1, createdAt: -1 }).lean();
  const summary = await paymentSummary({ eventId: request.params.id });
  return sendSuccess(response, { items, summary });
}));

router.get('/:id/payment-summary', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  return sendSuccess(response, { summary: await paymentSummary({ eventId: request.params.id }) });
}));

router.get('/:id', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null })
    .populate('customerId')
    .populate('salonId', 'name address locality city')
    .populate('leadId', 'fullName phone email eventType')
    .populate('quoteId')
    .populate('sourceLeadId', 'fullName phone email eventType')
    .populate('sourceQuoteId')
    .lean();
  await ensureEventAccess(request, event);
  const contract = await Contract.findOne({ eventId: request.params.id, deletedAt: null }).select('contractNumber status eventId customerId salonId createdAt sentAt signedAt').lean();
  return sendSuccess(response, { event, contract });
}));

router.post('/:id/create-contract', requirePermission(Permission.EVENTS_CREATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const result = await createContractFromEvent({ eventId: request.params.id, userId: request.user!.id });
  await writeAuditLog(request, result.created ? 'EVENT_CREATE_CONTRACT' : 'EVENT_GET_EXISTING_CONTRACT', 'Contract', result.contract._id.toString(), { eventId: request.params.id });
  return sendSuccess(response, { contract: result.contract, created: result.created }, result.created ? 201 : 200, result.created ? getApiMessage('CONTRACT_CREATED') : getApiMessage('CONTRACT_ALREADY_EXISTS'));
}));

router.patch('/:id', requirePermission(Permission.EVENTS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  Object.assign(event, request.body, { updatedBy: request.user!.id });
  await event.save();
  await writeAuditLog(request, 'EVENT_UPDATE', 'Event', event._id.toString());
  return sendSuccess(response, { event }, 200, getApiMessage('EVENT_UPDATED'));
}));

router.patch('/:id/status', requirePermission(Permission.EVENTS_UPDATE), validateRequest(statusSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  event.status = request.body.status;
  event.updatedBy = request.user!.id;
  await event.save();
  await writeAuditLog(request, 'EVENT_STATUS_UPDATE', 'Event', event._id.toString(), { status: event.status });
  return sendSuccess(response, { event }, 200, getApiMessage('EVENT_UPDATED'));
}));

export default router;
