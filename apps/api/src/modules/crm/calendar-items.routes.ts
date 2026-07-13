import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import { CalendarItem } from './crm.models';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { writeAuditLog } from '../audit/audit.service';
import { isCalendarItemOwner } from './calendar-item-access';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const itemTypes = ['event', 'alert', 'reminder', 'note', 'task', 'payment_window'] as const;
const itemStatuses = ['pending', 'scheduled', 'done', 'cancelled'] as const;
const priorities = ['low', 'normal', 'high', 'critical'] as const;
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const listSchema = z.object({ body: z.unknown().optional(), params: z.object({}), query: z.record(z.string(), z.unknown()) });
const notificationSchema = z.object({
  enabled: z.boolean().optional(),
  channels: z.array(z.enum(['system', 'email', 'whatsapp'])).optional(),
  offsetValue: z.coerce.number().positive().optional(),
  offsetUnit: z.enum(['minutes', 'hours', 'days', 'weeks']).optional(),
  sendAt: z.coerce.date().optional(),
  status: z.enum(['pending', 'scheduled', 'sent', 'failed', 'cancelled']).optional()
}).partial();
const itemBodyBase = z.object({
  type: z.enum(itemTypes),
  title: z.string().trim().min(1),
  description: z.string().trim().optional().or(z.literal('')),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  allDay: z.boolean().optional(),
  status: z.enum(itemStatuses).optional(),
  priority: z.enum(priorities).optional(),
  visibility: z.enum(['private', 'shared']).optional(),
  salonId: objectId.optional().or(z.literal('')),
  assignedToUserId: objectId.optional().or(z.literal('')),
  leadId: objectId.optional().or(z.literal('')),
  customerId: objectId.optional().or(z.literal('')),
  eventId: objectId.optional().or(z.literal('')),
  quoteId: objectId.optional().or(z.literal('')),
  contractId: objectId.optional().or(z.literal('')),
  paymentId: objectId.optional().or(z.literal('')),
  supplierId: objectId.optional().or(z.literal('')),
  source: z.enum(['manual', 'event', 'payment', 'contract', 'system']).optional(),
  notification: notificationSchema.optional(),
  metadata: z.unknown().optional()
});
const itemBody = itemBodyBase.refine((body) => !body.endAt || body.endAt >= body.startAt, 'La fecha de fin debe ser posterior al inicio.');
const createSchema = z.object({ body: itemBody, params: z.object({}), query: z.object({}) });
const updateSchema = z.object({ body: itemBodyBase.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.').refine((body) => !body.endAt || !body.startAt || body.endAt >= body.startAt, 'La fecha de fin debe ser posterior al inicio.'), params: z.object({ id: objectId }), query: z.object({}) });

const router = Router();

function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }

function cleanRelations(body: Record<string, unknown>) {
  const next = { ...body };
  for (const key of ['salonId', 'assignedToUserId', 'leadId', 'customerId', 'eventId', 'quoteId', 'contractId', 'paymentId', 'supplierId']) {
    if (next[key] === '') next[key] = undefined;
  }
  return next;
}

function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  terms.push({ $or: [{ visibility: 'shared' }, { createdBy: request.user!.id }] });
  const type = queryValue(request.query.type);
  if (type && itemTypes.includes(type as any)) terms.push({ type });
  const status = queryValue(request.query.status);
  if (status && itemStatuses.includes(status as any)) terms.push({ status });
  const salonId = queryValue(request.query.salonId);
  if (salonId && objectId.safeParse(salonId).success) terms.push({ salonId });
  const dateFrom = queryValue(request.query.dateFrom);
  const dateTo = queryValue(request.query.dateTo);
  const dateRange: Record<string, Date> = {};
  if (dateFrom) {
    const parsed = new Date(dateFrom);
    if (!Number.isNaN(parsed.getTime())) dateRange.$gte = parsed;
  }
  if (dateTo) {
    const parsed = new Date(dateTo);
    if (!Number.isNaN(parsed.getTime())) dateRange.$lte = parsed;
  }
  if (Object.keys(dateRange).length) terms.push({ startAt: dateRange });
  const search = queryValue(request.query.search);
  if (search) terms.push({ $or: ['title', 'description'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  return terms.length === 1 ? terms[0] : { $and: terms };
}

async function ensureItemAccess(request: Request, item: any): Promise<void> {
  if (!item || item.deletedAt) throw new ApiError(404, 'CALENDAR_ITEM_NOT_FOUND');
  if (item.visibility !== 'shared' && item.createdBy?.toString() !== request.user!.id) throw new ApiError(403, 'FORBIDDEN');
}

async function ensureItemMutationAccess(request: Request, item: any): Promise<void> {
  await ensureItemAccess(request, item);
  if (!isCalendarItemOwner(item, request.user!.id)) throw new ApiError(403, 'FORBIDDEN');
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.EVENTS_READ), validateRequest(listSchema), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(queryValue(request.query.page)) || 1);
  const limit = Math.min(200, Math.max(1, Number(queryValue(request.query.limit)) || 100));
  const query = buildQuery(request);
  const totalItems = await CalendarItem.countDocuments(query);
  const items = await CalendarItem.find(query)
    .populate('salonId', 'name')
    .populate('assignedToUserId', 'firstName lastName fullName email')
    .populate('leadId', 'fullName firstName lastName phone email')
    .populate('customerId', 'fullName phone email')
    .populate('eventId', 'eventName eventType eventDate status')
    .populate('quoteId', 'quoteNumber contactName totalAmount status')
    .populate('contractId', 'contractNumber status totalAmount balanceAmount')
    .populate('paymentId', 'paymentNumber status amount dueDate')
    .populate('supplierId', 'name businessName phone email contactPerson')
    .populate('createdBy', 'firstName lastName fullName email username')
    .sort({ startAt: 1, createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } });
}));

router.post('/', requirePermission(Permission.EVENTS_UPDATE), validateRequest(createSchema), asyncHandler(async (request, response) => {
  const body = cleanRelations(request.body);
  if (body.salonId && !canAccessSalon(request.user!, String(body.salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const item = await CalendarItem.create({ ...body, visibility: body.visibility ?? 'private', source: body.source ?? 'manual', createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'CALENDAR_ITEM_CREATE', 'CalendarItem', item._id.toString());
  return sendSuccess(response, { item }, 201, 'Item de calendario creado correctamente.');
}));

router.get('/:id', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const item = await CalendarItem.findOne({ _id: request.params.id, deletedAt: null })
    .populate('salonId', 'name')
    .populate('assignedToUserId', 'firstName lastName fullName email username')
    .populate('leadId', 'fullName firstName lastName phone email')
    .populate('customerId', 'fullName phone email')
    .populate('eventId', 'eventName eventType eventDate status')
    .populate('quoteId', 'quoteNumber contactName totalAmount status')
    .populate('contractId', 'contractNumber status totalAmount balanceAmount')
    .populate('paymentId', 'paymentNumber status amount dueDate')
    .populate('supplierId', 'name businessName phone email contactPerson')
    .populate('createdBy', 'firstName lastName fullName email username')
    .lean();
  await ensureItemAccess(request, item);
  return sendSuccess(response, { item });
}));

router.patch('/:id', requirePermission(Permission.EVENTS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const existing = await CalendarItem.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureItemMutationAccess(request, existing);
  const body = cleanRelations(request.body);
  if (body.salonId && !canAccessSalon(request.user!, String(body.salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const item = await CalendarItem.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...body, updatedBy: request.user!.id }, { new: true, runValidators: true });
  await writeAuditLog(request, 'CALENDAR_ITEM_UPDATE', 'CalendarItem', request.params.id);
  return sendSuccess(response, { item }, 200, 'Item de calendario actualizado correctamente.');
}));

router.delete('/:id', requirePermission(Permission.EVENTS_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const existing = await CalendarItem.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureItemMutationAccess(request, existing);
  const item = await CalendarItem.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id }, { new: true });
  await writeAuditLog(request, 'CALENDAR_ITEM_DELETE', 'CalendarItem', request.params.id);
  return sendSuccess(response, { item }, 200, 'Item de calendario eliminado correctamente.');
}));

export default router;
