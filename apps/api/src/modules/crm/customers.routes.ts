import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
import { Contract, Customer, Event, LeadActivity, Payment, Quote, QuoteRequest } from './crm.models';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { writeAuditLog } from '../audit/audit.service';
import { normalizeEmail, normalizePhone } from './contact-dedupe.service';
import { paymentSummary } from './payments.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const customerFields = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  fullName: z.string().trim().min(2).optional(),
  phone: z.string().trim().min(6).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  notes: z.string().trim().optional(),
  sourceLeadId: objectId.optional(),
  salonIds: z.array(objectId).optional()
});
const createSchema = z.object({ body: customerFields.refine((body) => Boolean(body.fullName || body.firstName), 'Debe indicar nombre.'), params: z.object({}), query: z.object({}) });
const updateSchema = z.object({ body: customerFields.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) });

const router = Router();

function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function splitName(body: Record<string, any>): { firstName: string; lastName: string; fullName: string } {
  const fullName = (body.fullName || [body.firstName, body.lastName].filter(Boolean).join(' ') || 'Cliente sin nombre').trim();
  const parts = fullName.split(/\s+/);
  return { firstName: body.firstName || parts[0] || 'Cliente', lastName: body.lastName || parts.slice(1).join(' ') || 'Sin apellido', fullName };
}
function scopedQuery(request: Request): Record<string, unknown>[] {
  return request.user!.roles.includes(Role.ADMIN) ? [] : [{ salonIds: { $in: request.user!.salonIds } }];
}
async function ensureCustomerAccess(request: Request, customer: any): Promise<void> {
  if (!customer || customer.deletedAt) throw new ApiError(404, 'CUSTOMER_NOT_FOUND');
  if (request.user!.roles.includes(Role.ADMIN)) return;
  const salonIds = (customer.salonIds ?? []).map((id: { toString(): string }) => id.toString());
  if (salonIds.length && !salonIds.some((salonId: string) => canAccessSalon(request.user!, salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}
function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }, ...scopedQuery(request)];
  const term = queryValue(request.query.search) ?? queryValue(request.query.q);
  if (term) terms.push({ $or: ['fullName', 'firstName', 'lastName', 'phone', 'email', 'notes'].map((field) => ({ [field]: { $regex: term, $options: 'i' } })) });
  const salonId = queryValue(request.query.salonId);
  if (salonId && objectId.safeParse(salonId).success) terms.push({ salonIds: salonId });
  return terms.length === 1 ? terms[0] : { $and: terms };
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.LEADS_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(queryValue(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(queryValue(request.query.limit)) || 20));
  const query = buildQuery(request);
  const totalItems = await Customer.countDocuments(query);
  const customers = await Customer.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  const ids = customers.map((customer: any) => customer._id);
  const [quoteCounts, eventCounts, lastEvents] = await Promise.all([
    Quote.aggregate([{ $match: { customerId: { $in: ids }, deletedAt: null } }, { $group: { _id: '$customerId', count: { $sum: 1 } } }]),
    Event.aggregate([{ $match: { customerId: { $in: ids }, deletedAt: null } }, { $group: { _id: '$customerId', count: { $sum: 1 } } }]),
    Event.aggregate([{ $match: { customerId: { $in: ids }, deletedAt: null } }, { $sort: { eventDate: -1, createdAt: -1 } }, { $group: { _id: '$customerId', eventDate: { $first: '$eventDate' }, eventName: { $first: '$eventName' } } }])
  ]);
  const quoteCountById = new Map(quoteCounts.map((item: any) => [item._id.toString(), item.count]));
  const eventCountById = new Map(eventCounts.map((item: any) => [item._id.toString(), item.count]));
  const lastEventById = new Map(lastEvents.map((item: any) => [item._id.toString(), item]));
  const items = customers.map((customer: any) => ({ ...customer, quoteCount: quoteCountById.get(customer._id.toString()) ?? 0, eventCount: eventCountById.get(customer._id.toString()) ?? 0, lastEvent: lastEventById.get(customer._id.toString()) }));
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } });
}));

router.post('/', requirePermission(Permission.LEADS_CREATE), validateRequest(createSchema), asyncHandler(async (request, response) => {
  const name = splitName(request.body);
  const customer = await Customer.create({ ...request.body, ...name, email: normalizeEmail(request.body.email), normalizedEmail: normalizeEmail(request.body.email), normalizedPhone: normalizePhone(request.body.phone), sourceLeadIds: request.body.sourceLeadId ? [request.body.sourceLeadId] : [], createdFromLeadId: request.body.sourceLeadId, createdBy: request.user!.id, updatedBy: request.user!.id });
  await LeadActivity.create({ customerId: customer._id, type: 'customer_created', title: 'Cliente creado', createdBy: request.user!.id });
  await writeAuditLog(request, 'CUSTOMER_CREATE', 'Customer', customer._id.toString());
  return sendSuccess(response, { customer }, 201, getApiMessage('CUSTOMER_CREATED'));
}));

router.get('/:id', requirePermission(Permission.LEADS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer = await Customer.findOne({ _id: request.params.id, deletedAt: null }).populate('sourceLeadId', 'fullName phone email').lean();
  await ensureCustomerAccess(request, customer);
  const [quotes, events, quoteRequests, contracts, payments, summary, activities] = await Promise.all([
    Quote.find({ customerId: request.params.id, deletedAt: null }).populate('salonId', 'name').sort({ createdAt: -1 }).lean(),
    Event.find({ customerId: request.params.id, deletedAt: null }).populate('salonId', 'name').sort({ eventDate: -1, createdAt: -1 }).lean(),
    QuoteRequest.find({ customerId: request.params.id, deletedAt: null }).sort({ createdAt: -1 }).lean(),
    Contract.find({ customerId: request.params.id, deletedAt: null }).populate('eventId', 'eventName eventType eventDate').populate('salonId', 'name').sort({ createdAt: -1 }).lean(),
    Payment.find({ customerId: request.params.id, deletedAt: null }).populate('contractId', 'contractNumber totalAmount balanceAmount status').populate('eventId', 'eventName eventType eventDate').populate('salonId', 'name').sort({ paidAt: -1, dueDate: 1, createdAt: -1 }).limit(50).lean(),
    paymentSummary({ customerId: request.params.id }),
    LeadActivity.find({ customerId: request.params.id }).sort({ createdAt: -1 }).limit(50).lean()
  ]);
  return sendSuccess(response, { customer, quotes, events, quoteRequests, contracts, payments, paymentSummary: summary, activities });
}));

router.patch('/:id', requirePermission(Permission.LEADS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const customer: any = await Customer.findOne({ _id: request.params.id, deletedAt: null });
  await ensureCustomerAccess(request, customer);
  Object.assign(customer, request.body, splitName({ ...customer.toObject(), ...request.body }), { email: normalizeEmail(request.body.email ?? customer.email), normalizedEmail: normalizeEmail(request.body.email ?? customer.email), normalizedPhone: normalizePhone(request.body.phone ?? customer.phone), updatedBy: request.user!.id });
  await customer.save();
  await writeAuditLog(request, 'CUSTOMER_UPDATE', 'Customer', customer._id.toString());
  return sendSuccess(response, { customer }, 200, getApiMessage('CUSTOMER_UPDATED'));
}));

router.delete('/:id', requirePermission(Permission.LEADS_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer: any = await Customer.findOne({ _id: request.params.id, deletedAt: null });
  await ensureCustomerAccess(request, customer);
  customer.deletedAt = new Date();
  customer.deletedBy = request.user!.id;
  customer.updatedBy = request.user!.id;
  await customer.save();
  await writeAuditLog(request, 'CUSTOMER_DELETE', 'Customer', customer._id.toString());
  return sendSuccess(response, { deleted: true }, 200, getApiMessage('CUSTOMER_DELETED'));
}));

router.get('/:id/quotes', requirePermission(Permission.QUOTES_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer = await Customer.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureCustomerAccess(request, customer);
  const quotes = await Quote.find({ customerId: request.params.id, deletedAt: null }).populate('salonId', 'name').sort({ createdAt: -1 }).lean();
  return sendSuccess(response, { quotes });
}));

router.get('/:id/events', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer = await Customer.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureCustomerAccess(request, customer);
  const events = await Event.find({ customerId: request.params.id, deletedAt: null }).populate('salonId', 'name').sort({ eventDate: -1, createdAt: -1 }).lean();
  return sendSuccess(response, { events });
}));

router.get('/:id/payments', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer = await Customer.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureCustomerAccess(request, customer);
  const items = await Payment.find({ customerId: request.params.id, deletedAt: null }).populate('contractId', 'contractNumber totalAmount balanceAmount status').populate('eventId', 'eventName eventType eventDate').populate('salonId', 'name').sort({ paidAt: -1, dueDate: 1, createdAt: -1 }).lean();
  const summary = await paymentSummary({ customerId: request.params.id });
  return sendSuccess(response, { items, summary });
}));

router.get('/:id/payment-summary', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer = await Customer.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureCustomerAccess(request, customer);
  return sendSuccess(response, { summary: await paymentSummary({ customerId: request.params.id }) });
}));

router.get('/:id/activity', requirePermission(Permission.LEADS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer = await Customer.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureCustomerAccess(request, customer);
  const activities = await LeadActivity.find({ customerId: request.params.id }).sort({ createdAt: -1 }).lean();
  return sendSuccess(response, { activities });
}));

export default router;
