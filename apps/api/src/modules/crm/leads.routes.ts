import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
import { CalendarItem, Event, Lead, LeadActivity, Quote, QuoteRequest } from './crm.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { accessibleSalonIds, canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { writeAuditLog } from '../audit/audit.service';
import { getEntityChangeHistory } from '../audit/entity-change-history.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const leadStatuses = ['new', 'contacted', 'follow_up', 'quote_sent', 'negotiation', 'won', 'lost', 'converted'] as const;
const commercialOrigins = ['meta_ads_whatsapp', 'organic_whatsapp', 'instagram', 'google', 'referral', 'returning_customer', 'other', 'unknown'] as const;
const lostReasons = ['price', 'date_unavailable', 'other_venue', 'no_response', 'event_postponed', 'other'] as const;
const leadSources = [
  'web_form',
  'quick_quote',
  'whatsapp',
  'phone',
  'email',
  'instagram',
  'facebook',
  'tiktok',
  'google',
  'referral',
  'walk_in',
  'manual',
  'promotion',
  'ticket',
  'invitation',
  'other'
] as const;

const leadFields = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z.string().trim().min(6),
  email: z.string().trim().email().optional().or(z.literal('')),
  alternativePhone: z.string().trim().optional(),
  eventType: z.string().trim().min(1),
  eventDate: z.coerce.date().optional(),
  guestCount: z.coerce.number().int().positive(),
  salonId: objectId,
  salonIds: z.array(objectId).min(1).optional(),
  assignedUserId: objectId.optional(),
  source: z.enum(leadSources).default('manual'),
  message: z.string().trim().optional(),
  notes: z.string().trim().optional()
});

const createLeadSchema = z.object({ body: leadFields, params: z.object({}), query: z.object({}) });
const updateLeadSchema = z.object({
  body: leadFields.omit({ assignedUserId: true }).partial().refine(
    (body) => Object.keys(body).length > 0,
    'Debe enviar al menos un campo para actualizar.'
  ),
  params: z.object({ id: objectId }),
  query: z.object({})
});
const idParamsSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const assignmentSchema = z.object({
  body: z.object({ assignedUserId: objectId.nullable() }),
  params: z.object({ id: objectId }),
  query: z.object({})
});

type LeadLike = { salonId?: { toString(): string } | string | null; salonIds?: Array<{ toString(): string } | string> };

const router = Router();

function normalizedSalonIds(lead: LeadLike): string[] {
  const ids = [lead.salonId, ...(lead.salonIds ?? [])]
    .filter((value): value is { toString(): string } | string => Boolean(value))
    .map((value) => value.toString());

  return [...new Set(ids)];
}

function normalizeRequestedSalonIds(salonId: string, salonIds?: string[]): string[] {
  return [...new Set([salonId, ...(salonIds ?? [])])];
}

async function ensureLeadAccess(request: Request, lead: LeadLike | null): Promise<void> {
  if (!lead) throw new ApiError(404, 'LEAD_NOT_FOUND');

  const salonIds = normalizedSalonIds(lead);
  if (!salonIds.some((salonId) => canAccessSalon(request.user!, salonId))) {
    throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  }
}

async function ensureRequestedSalonsAreAccessible(request: Request, salonIds: string[]): Promise<void> {
  if (salonIds.some((salonId) => !canAccessSalon(request.user!, salonId))) {
    throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  }

  const activeSalons = await Salon.countDocuments({ _id: { $in: salonIds }, active: true, deletedAt: null });
  if (activeSalons !== salonIds.length) throw new ApiError(404, 'SALON_NOT_FOUND');
}

function getSingleQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function buildLeadQuery(request: Request): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [{ deletedAt: null }];
  const user = request.user!;

  if (!user.roles.includes(Role.ADMIN)) {
    const scopedSalonIds = accessibleSalonIds(user);
    conditions.push({
      $or: [
        { salonId: { $in: scopedSalonIds } },
        { salonIds: { $in: scopedSalonIds } }
      ]
    });
  }

  const status = getSingleQueryValue(request.query.status);
  if (status && leadStatuses.includes(status as (typeof leadStatuses)[number])) conditions.push({ status });

  const source = getSingleQueryValue(request.query.source);
  if (source && leadSources.includes(source as (typeof leadSources)[number])) conditions.push({ source });

  const salonId = getSingleQueryValue(request.query.salonId);
  if (salonId && objectId.safeParse(salonId).success) {
    conditions.push({ $or: [{ salonId }, { salonIds: salonId }] });
  }

  const eventType = getSingleQueryValue(request.query.eventType);
  if (eventType) conditions.push({ eventType: { $regex: eventType, $options: 'i' } });

  const term = getSingleQueryValue(request.query.q) ?? getSingleQueryValue(request.query.search);
  if (term) {
    conditions.push({
      $or: ['firstName', 'lastName', 'fullName', 'phone', 'email', 'eventType', 'message', 'notes']
        .map((field) => ({ [field]: { $regex: term, $options: 'i' } }))
    });
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

function scopedSalonQuery(request: Request, field = 'salonId'): Record<string, unknown>[] {
  return request.user!.roles.includes(Role.ADMIN) ? [] : [{ [field]: { $in: accessibleSalonIds(request.user!) } }];
}

function scopedQuoteRequestQuery(request: Request): Record<string, unknown>[] {
  return request.user!.roles.includes(Role.ADMIN) ? [] : [{ interestedSalonIds: { $in: accessibleSalonIds(request.user!) } }, { $or: [{ assignedToUserId: { $exists: false } }, { assignedToUserId: null }, { assignedToUserId: request.user!.id }] }];
}

function getPagination(request: Request): { page: number; limit: number } {
  const page = Math.max(1, Number(getSingleQueryValue(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(getSingleQueryValue(request.query.limit)) || 10));
  return { page, limit };
}

function getSort(request: Request): { sortBy: string; sortOrder: 1 | -1 } {
  const allowedFields = ['fullName', 'phone', 'email', 'eventType', 'eventDate', 'guestCount', 'status', 'source', 'createdAt', 'updatedAt'];
  const requestedSortBy = getSingleQueryValue(request.query.sortBy);
  const sortBy = requestedSortBy && allowedFields.includes(requestedSortBy) ? requestedSortBy : 'createdAt';
  const sortOrder = getSingleQueryValue(request.query.sortOrder) === 'asc' ? 1 : -1;
  return { sortBy, sortOrder };
}

router.use(requireAuth);

router.get(
  '/',
  requirePermission(Permission.LEADS_READ),
  asyncHandler(async (request, response) => {
    const query = buildLeadQuery(request);
    const { page, limit } = getPagination(request);
    const { sortBy, sortOrder } = getSort(request);
    const totalItems = await Lead.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const items = await Lead.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return sendSuccess(response, {
      items,
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        sortBy,
        sortOrder: sortOrder === 1 ? 'asc' : 'desc'
      }
    });
  })
);

router.get(
  '/export',
  requirePermission(Permission.LEADS_READ),
  asyncHandler(async (request, response) => {
    const query = buildLeadQuery(request);
    const { sortBy, sortOrder } = getSort(request);
    const items = await Lead.find(query)
      .select('firstName lastName fullName phone email alternativePhone eventType eventDate guestCount salonId salonIds source status message notes createdAt updatedAt')
      .sort({ [sortBy]: sortOrder })
      .limit(10_000)
      .lean();

    return sendSuccess(response, { items, totalItems: items.length }, 200, getApiMessage('LEADS_EXPORTED'));
  })
);

router.post(
  '/',
  requirePermission(Permission.LEADS_CREATE),
  validateRequest(createLeadSchema),
  asyncHandler(async (request, response) => {
    const salonIds = normalizeRequestedSalonIds(request.body.salonId, request.body.salonIds);
    await ensureRequestedSalonsAreAccessible(request, salonIds);

    const lead = await Lead.create({
      ...request.body,
      salonId: request.body.salonId,
      salonIds,
      fullName: `${request.body.firstName} ${request.body.lastName}`.trim(),
      createdBy: request.user!.id,
      updatedBy: request.user!.id
    });
    await LeadActivity.create({ leadId: lead._id, type: 'system', title: 'Lead creado', createdBy: request.user!.id });
    await writeAuditLog(request, 'LEAD_CREATE', 'Lead', lead._id.toString());
    return sendSuccess(response, { lead }, 201, getApiMessage('LEAD_CREATED'));
  })
);

router.get(
  '/:id',
  requirePermission(Permission.LEADS_READ),
  validateRequest(idParamsSchema),
  asyncHandler(async (request, response) => {
    const lead: any = await Lead.findOne({ _id: request.params.id, deletedAt: null }).lean();
    await ensureLeadAccess(request, lead as LeadLike | null);
    const changeHistory = await getEntityChangeHistory({
      entityType: 'Lead',
      entityId: request.params.id,
      entity: lead,
      actions: ['LEAD_CREATE', 'LEAD_UPDATE', 'LEAD_STATUS_UPDATE', 'LEAD_ASSIGN', 'LEAD_MARK_LOST']
    });
    return sendSuccess(response, { lead, changeHistory });
  })
);

router.patch(
  '/:id',
  requirePermission(Permission.LEADS_UPDATE),
  validateRequest(updateLeadSchema),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead as LeadLike | null);

    const update = request.body as z.infer<typeof updateLeadSchema>['body'];
    const currentSalonIds = normalizedSalonIds(lead!);
    const primarySalonId = update.salonId ?? lead!.salonId?.toString();
    const salonIds = update.salonIds
      ? normalizeRequestedSalonIds(primarySalonId!, update.salonIds)
      : currentSalonIds;

    if (update.salonId && !update.salonIds && !salonIds.includes(update.salonId)) salonIds.push(update.salonId);
    await ensureRequestedSalonsAreAccessible(request, salonIds);

    Object.assign(lead, update, {
      salonId: primarySalonId,
      salonIds,
      updatedBy: request.user!.id
    });
    if (update.firstName !== undefined || update.lastName !== undefined) {
      lead!.fullName = `${lead!.firstName} ${lead!.lastName}`.trim();
    }
    await lead!.save();
    await writeAuditLog(request, 'LEAD_UPDATE', 'Lead', lead!._id.toString());
    return sendSuccess(response, { lead }, 200, getApiMessage('LEAD_UPDATED'));
  })
);

router.patch(
  '/:id/status',
  requirePermission(Permission.LEADS_UPDATE),
  validateRequest(z.object({ body: z.object({ status: z.enum(leadStatuses) }), params: z.object({ id: objectId }), query: z.object({}) })),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);
    if (request.body.status === 'lost') throw new ApiError(422, 'LEAD_LOSS_REASON_REQUIRED', 'Usá la acción de pérdida con un motivo.');
    lead!.status = request.body.status;
    lead!.updatedBy = request.user!.id;
    await lead!.save();
    if (['won', 'converted'].includes(lead!.status)) await CalendarItem.updateOne({ automationKey: `lead_next_contact:${lead!._id}` }, { $set: { status: 'cancelled', 'notification.status': 'cancelled' } });
    await LeadActivity.create({ leadId: lead!._id, type: 'status_change', title: 'Estado actualizado', metadata: { status: request.body.status }, createdBy: request.user!.id });
    await writeAuditLog(request, 'LEAD_STATUS_UPDATE', 'Lead', lead!._id.toString());
    return sendSuccess(response, { lead }, 200, getApiMessage('LEAD_STATUS_UPDATED'));
  })
);

router.patch(
  '/:id/assign',
  requirePermission(Permission.LEADS_ASSIGN),
  validateRequest(assignmentSchema),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);

    if (request.body.assignedUserId) {
      const assignee: any = await User.findOne({ _id: request.body.assignedUserId, active: true, deletedAt: null }).lean();
      if (!assignee) throw new ApiError(404, 'USER_NOT_FOUND');

      const leadSalons = normalizedSalonIds(lead!);
      const assigneeSalonIds = assignee.salonIds.map((salonId: { toString(): string }) => salonId.toString());
      if (!assignee.roles.includes(Role.ADMIN) && !leadSalons.some((salonId) => assigneeSalonIds.includes(salonId))) {
        throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
      }
    }

    lead!.assignedUserId = request.body.assignedUserId ?? undefined;
    lead!.updatedBy = request.user!.id;
    await lead!.save();
    if (request.body.assignedUserId) await CalendarItem.updateOne({ automationKey: `lead_next_contact:${lead!._id}` }, { $set: { assignedToUserId: request.body.assignedUserId } });
    await LeadActivity.create({
      leadId: lead!._id,
      type: 'assignment',
      title: request.body.assignedUserId ? 'Lead asignado' : 'Lead desasignado',
      metadata: { assignedUserId: request.body.assignedUserId },
      createdBy: request.user!.id
    });
    await writeAuditLog(request, 'LEAD_ASSIGN', 'Lead', lead!._id.toString(), { assignedUserId: request.body.assignedUserId });
    return sendSuccess(response, { lead }, 200, getApiMessage('LEAD_UPDATED'));
  })
);

router.post(
  '/:id/activities',
  requirePermission(Permission.LEADS_UPDATE),
  validateRequest(z.object({ body: z.object({ description: z.string().trim().min(1) }), params: z.object({ id: objectId }), query: z.object({}) })),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);
    const activity = await LeadActivity.create({ leadId: lead!._id, type: 'note', title: 'Nota', description: request.body.description, createdBy: request.user!.id });
    return sendSuccess(response, { activity }, 201, getApiMessage('ACTIVITY_CREATED'));
  })
);

router.get(
  '/:id/activities',
  requirePermission(Permission.LEADS_READ),
  validateRequest(idParamsSchema),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);
    const activities = await LeadActivity.find({ leadId: lead!._id }).sort({ createdAt: -1 }).lean();
    return sendSuccess(response, { activities });
  })
);

router.get(
  '/:id/quotes',
  requirePermission(Permission.LEADS_READ),
  validateRequest(idParamsSchema),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);
    const quotes = await Quote.find({ $and: [{ leadId: request.params.id, deletedAt: null }, ...scopedSalonQuery(request)] }).populate('salonId', 'name').sort({ createdAt: -1 }).lean();
    return sendSuccess(response, { quotes });
  })
);

router.get(
  '/:id/events',
  requirePermission(Permission.EVENTS_READ),
  validateRequest(idParamsSchema),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);
    const events = await Event.find({ $and: [{ $or: [{ leadId: request.params.id }, { sourceLeadId: request.params.id }], deletedAt: null }, ...scopedSalonQuery(request)] }).populate('salonId', 'name').populate('customerId', 'fullName phone email').sort({ eventDate: -1, createdAt: -1 }).lean();
    return sendSuccess(response, { events });
  })
);

router.get(
  '/:id/commercial-history',
  requirePermission(Permission.LEADS_READ),
  validateRequest(idParamsSchema),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null }).populate('convertedCustomerId', 'fullName phone email').lean();
    const leadForAccess = lead as LeadLike | null;
    await ensureLeadAccess(request, leadForAccess);
    const [quoteRequests, quotes, events, activities] = await Promise.all([
      QuoteRequest.find({ $and: [{ leadId: request.params.id, deletedAt: null }, ...scopedQuoteRequestQuery(request)] }).sort({ createdAt: -1 }).lean(),
      Quote.find({ $and: [{ leadId: request.params.id, deletedAt: null }, ...scopedSalonQuery(request)] }).populate('salonId', 'name').sort({ createdAt: -1 }).lean(),
      Event.find({ $and: [{ $or: [{ leadId: request.params.id }, { sourceLeadId: request.params.id }], deletedAt: null }, ...scopedSalonQuery(request)] }).populate('salonId', 'name').populate('customerId', 'fullName phone email').sort({ eventDate: -1, createdAt: -1 }).lean(),
      LeadActivity.find({ leadId: request.params.id }).sort({ createdAt: -1 }).limit(50).lean()
    ]);
    return sendSuccess(response, { lead, quoteRequests, quotes, events, activities, convertedCustomer: (lead as any)?.convertedCustomerId });
  })
);

router.post(
  '/:id/mark-lost',
  requirePermission(Permission.LEADS_UPDATE),
  validateRequest(z.object({ body: z.object({ lostReason: z.enum(lostReasons), observation: z.string().trim().max(1000).optional() }), params: z.object({ id: objectId }), query: z.object({}) })),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);
    lead!.status = 'lost';
    lead!.lostReason = request.body.lostReason;
    lead!.lostAt = new Date();
    lead!.lostBy = request.user!.id;
    lead!.lostObservation = request.body.observation;
    lead!.updatedBy = request.user!.id;
    await lead!.save();
    await CalendarItem.updateOne({ automationKey: `lead_next_contact:${lead!._id}` }, { $set: { status: 'cancelled', 'notification.status': 'cancelled' } });
    await LeadActivity.create({ leadId: lead!._id, type: 'lost', title: 'Lead perdido', description: request.body.observation, metadata: { reason: lead!.lostReason, at: lead!.lostAt }, createdBy: request.user!.id });
    await writeAuditLog(request, 'LEAD_MARK_LOST', 'Lead', lead!._id.toString());
    return sendSuccess(response, { lead }, 200, getApiMessage('LEAD_LOST'));
  })
);

router.patch('/:id/attribution', requirePermission(Permission.LEADS_UPDATE), validateRequest(z.object({
  body: z.object({ origin: z.enum(commercialOrigins), campaignCode: z.string().trim().max(120).optional(), adCode: z.string().trim().max(120).optional() }),
  params: z.object({ id: objectId }), query: z.object({})
})), asyncHandler(async (request, response) => {
  const lead: any = await Lead.findOne({ _id: request.params.id, deletedAt: null });
  await ensureLeadAccess(request, lead);
  const before = { origin: lead.commercialOrigin ?? 'unknown', campaignCode: lead.campaignCode, adCode: lead.adCode };
  lead.commercialOrigin = request.body.origin;
  lead.originAttribution = request.body.origin === 'unknown' ? 'unknown' : 'manual';
  lead.campaignCode = request.body.campaignCode || undefined;
  lead.adCode = request.body.adCode || undefined;
  lead.updatedBy = request.user!.id;
  await lead.save();
  await LeadActivity.create({ leadId: lead._id, type: 'attribution', title: 'Origen comercial actualizado', metadata: { before, after: { origin: lead.commercialOrigin, campaignCode: lead.campaignCode, adCode: lead.adCode }, attribution: lead.originAttribution }, createdBy: request.user!.id });
  await writeAuditLog(request, 'LEAD_ATTRIBUTION_UPDATE', 'Lead', lead._id.toString());
  return sendSuccess(response, { lead });
}));

router.post('/:id/follow-up', requirePermission(Permission.LEADS_UPDATE), validateRequest(z.object({
  body: z.object({ lastContactAt: z.coerce.date().optional(), nextContactAt: z.coerce.date().optional(), result: z.string().trim().min(1).max(500) }),
  params: z.object({ id: objectId }), query: z.object({})
})), asyncHandler(async (request, response) => {
  const lead: any = await Lead.findOne({ _id: request.params.id, deletedAt: null });
  await ensureLeadAccess(request, lead);
  const now = new Date();
  if (['won', 'converted', 'lost'].includes(lead.status) && request.body.nextContactAt) throw new ApiError(422, 'LEAD_FOLLOW_UP_CLOSED');
  if (request.body.nextContactAt && request.body.nextContactAt <= now) throw new ApiError(400, 'FOLLOW_UP_DATE_INVALID');
  lead.lastContactAt = request.body.lastContactAt ?? now;
  lead.nextContactAt = request.body.nextContactAt;
  lead.followUpResult = request.body.result;
  if (!['won', 'converted', 'lost'].includes(lead.status)) lead.status = request.body.nextContactAt ? 'follow_up' : 'contacted';
  lead.updatedBy = request.user!.id;
  await lead.save();
  await CalendarItem.updateMany({ leadId: lead._id, 'metadata.leadFollowUp': true, status: { $ne: 'cancelled' } }, { $set: { status: 'cancelled', 'notification.status': 'cancelled' } });
  const automationKey = `lead_next_contact:${lead._id}`;
  if (lead.nextContactAt) {
    await CalendarItem.findOneAndUpdate({ automationKey }, { $set: {
      type: 'reminder', source: 'manual', title: `Contactar a ${lead.fullName || 'lead'}`,
      description: lead.followUpResult, startAt: lead.nextContactAt, status: 'scheduled',
      visibility: 'shared', salonId: lead.salonId, leadId: lead._id,
      assignedToUserId: lead.assignedUserId ?? request.user!.id,
      'notification.enabled': true, 'notification.channels': ['system'],
      'notification.sendAt': lead.nextContactAt, 'notification.status': 'scheduled',
      updatedBy: request.user!.id,
    }, $setOnInsert: { automationKey, createdBy: request.user!.id } }, { upsert: true, new: true });
  } else {
    await CalendarItem.updateOne({ automationKey, deletedAt: null }, { $set: { status: 'cancelled', 'notification.status': 'cancelled', updatedBy: request.user!.id } });
  }
  await LeadActivity.create({ leadId: lead._id, type: 'follow_up', title: 'Seguimiento registrado', description: lead.followUpResult, metadata: { lastContactAt: lead.lastContactAt, nextContactAt: lead.nextContactAt }, createdBy: request.user!.id });
  await writeAuditLog(request, 'LEAD_FOLLOW_UP', 'Lead', lead._id.toString());
  return sendSuccess(response, { lead });
}));

router.get('/:id/visits', requirePermission(Permission.LEADS_READ), validateRequest(idParamsSchema), asyncHandler(async (request, response) => {
  const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
  await ensureLeadAccess(request, lead);
  const visits = await CalendarItem.find({ leadId: request.params.id, type: 'meeting', 'metadata.commercialVisit': true, deletedAt: null })
    .populate('salonId', 'name').populate('assignedToUserId', 'fullName firstName lastName').sort({ startAt: -1 }).lean();
  return sendSuccess(response, { visits: visits.filter((visit: any) => canAccessSalon(request.user!, visit.salonId?._id?.toString() ?? visit.salonId?.toString())) });
}));

router.get('/:id/visit-assignees', requirePermission(Permission.LEADS_READ), validateRequest(idParamsSchema), asyncHandler(async (request, response) => {
  const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
  await ensureLeadAccess(request, lead);
  const salonIds = normalizedSalonIds(lead!).filter((salonId) => canAccessSalon(request.user!, salonId));
  const users = await User.find({ deletedAt: null, active: true, $or: [{ roles: Role.ADMIN }, { salonIds: { $in: salonIds } }] })
    .select('_id fullName firstName lastName salonIds roles').sort({ fullName: 1 }).lean();
  return sendSuccess(response, { users });
}));

router.post('/:id/visits/offer', requirePermission(Permission.LEADS_UPDATE), validateRequest(z.object({ body: z.object({ observation: z.string().trim().max(1000).optional() }), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
  await ensureLeadAccess(request, lead);
  const activity = await LeadActivity.create({ leadId: lead!._id, type: 'visit', title: 'Visita ofrecida', description: request.body.observation, metadata: { action: 'offered' }, createdBy: request.user!.id });
  await writeAuditLog(request, 'LEAD_VISIT_OFFER', 'Lead', lead!._id.toString());
  return sendSuccess(response, { activity }, 201);
}));

router.post('/:id/visits', requirePermission(Permission.LEADS_UPDATE), validateRequest(z.object({
  body: z.object({ startAt: z.coerce.date(), salonId: objectId, assignedToUserId: objectId, observation: z.string().trim().max(1000).optional() }),
  params: z.object({ id: objectId }), query: z.object({})
})), asyncHandler(async (request, response) => {
  const lead: any = await Lead.findOne({ _id: request.params.id, deletedAt: null });
  await ensureLeadAccess(request, lead);
  if (!normalizedSalonIds(lead).includes(request.body.salonId) || !canAccessSalon(request.user!, request.body.salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const assignee: any = await User.findOne({ _id: request.body.assignedToUserId, active: true, deletedAt: null }).select('roles salonIds').lean();
  if (!assignee || (!assignee.roles.includes(Role.ADMIN) && !assignee.salonIds.some((value: any) => value.toString() === request.body.salonId))) throw new ApiError(422, 'VISIT_ASSIGNEE_INVALID');
  const visit = await CalendarItem.create({ type: 'meeting', title: `Visita comercial: ${lead.fullName}`, description: request.body.observation, startAt: request.body.startAt, status: 'scheduled', visibility: 'shared', salonId: request.body.salonId, leadId: lead._id, assignedToUserId: request.body.assignedToUserId, source: 'manual', metadata: { commercialVisit: true, visitOutcome: 'scheduled' }, createdBy: request.user!.id, updatedBy: request.user!.id });
  await LeadActivity.create({ leadId: lead._id, type: 'visit', title: 'Visita agendada', description: request.body.observation, metadata: { action: 'scheduled', visitId: visit._id, startAt: visit.startAt, salonId: visit.salonId, assignedToUserId: visit.assignedToUserId }, createdBy: request.user!.id });
  await writeAuditLog(request, 'LEAD_VISIT_SCHEDULE', 'CalendarItem', visit._id.toString());
  return sendSuccess(response, { visit }, 201);
}));

const visitActions = ['confirmed', 'completed', 'no_show', 'cancelled', 'rescheduled'] as const;
router.patch('/:id/visits/:visitId', requirePermission(Permission.LEADS_UPDATE), validateRequest(z.object({
  body: z.object({ action: z.enum(visitActions), startAt: z.coerce.date().optional(), salonId: objectId.optional(), assignedToUserId: objectId.optional(), observation: z.string().trim().max(1000).optional() }),
  params: z.object({ id: objectId, visitId: objectId }), query: z.object({})
})), asyncHandler(async (request, response) => {
  const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
  await ensureLeadAccess(request, lead);
  const visit: any = await CalendarItem.findOne({ _id: request.params.visitId, leadId: request.params.id, type: 'meeting', 'metadata.commercialVisit': true, deletedAt: null });
  if (!visit) throw new ApiError(404, 'VISIT_NOT_FOUND');
  if (!canAccessSalon(request.user!, visit.salonId?.toString())) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const action = request.body.action as typeof visitActions[number];
  if (action === 'rescheduled' && !request.body.startAt) throw new ApiError(400, 'VISIT_DATE_REQUIRED');
  if (action !== 'rescheduled' && (request.body.startAt || request.body.salonId || request.body.assignedToUserId)) throw new ApiError(400, 'VISIT_ACTION_INVALID');
  if (['done', 'cancelled'].includes(visit.status) && action !== 'rescheduled') throw new ApiError(422, 'VISIT_ALREADY_CLOSED');
  const before = { startAt: visit.startAt, salonId: visit.salonId, assignedToUserId: visit.assignedToUserId, status: visit.status, outcome: visit.metadata?.visitOutcome };
  if (action === 'rescheduled') {
    const salonId = request.body.salonId ?? visit.salonId.toString();
    if (!normalizedSalonIds(lead!).includes(salonId) || !canAccessSalon(request.user!, salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
    const assigneeId = request.body.assignedToUserId ?? visit.assignedToUserId?.toString();
    const assignee: any = await User.findOne({ _id: assigneeId, active: true, deletedAt: null }).select('roles salonIds').lean();
    if (!assignee || (!assignee.roles.includes(Role.ADMIN) && !assignee.salonIds.some((value: any) => value.toString() === salonId))) throw new ApiError(422, 'VISIT_ASSIGNEE_INVALID');
    visit.startAt = request.body.startAt;
    visit.salonId = salonId;
    visit.assignedToUserId = assigneeId;
    visit.status = 'scheduled';
  } else if (action === 'cancelled') visit.status = 'cancelled';
  else if (action === 'completed' || action === 'no_show') visit.status = 'done';
  visit.metadata = { ...(visit.metadata ?? {}), commercialVisit: true, visitOutcome: action };
  visit.description = request.body.observation ?? visit.description;
  visit.updatedBy = request.user!.id;
  await visit.save();
  await LeadActivity.create({ leadId: lead!._id, type: 'visit', title: `Visita ${action}`, description: request.body.observation, metadata: { action, visitId: visit._id, before, after: { startAt: visit.startAt, salonId: visit.salonId, assignedToUserId: visit.assignedToUserId, status: visit.status } }, createdBy: request.user!.id });
  await writeAuditLog(request, 'LEAD_VISIT_UPDATE', 'CalendarItem', visit._id.toString(), { action });
  return sendSuccess(response, { visit });
}));

router.delete(
  '/:id',
  requirePermission(Permission.LEADS_DELETE),
  validateRequest(idParamsSchema),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);
    lead!.deletedAt = new Date();
    lead!.deletedBy = request.user!.id;
    lead!.updatedBy = request.user!.id;
    await lead!.save();
    await writeAuditLog(request, 'LEAD_DELETE', 'Lead', lead!._id.toString());
    return sendSuccess(response, { deleted: true }, 200, getApiMessage('LEAD_DELETED'));
  })
);

export default router;
