import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
import { Lead, LeadActivity } from './crm.models';
import { Salon } from '../salons/salon.model';
import { User } from '../users/user.model';
import { canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { writeAuditLog } from '../audit/audit.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const leadStatuses = ['new', 'contacted', 'follow_up', 'quote_sent', 'negotiation', 'won', 'lost', 'converted'] as const;
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
    conditions.push({
      $or: [
        { salonId: { $in: user.salonIds } },
        { salonIds: { $in: user.salonIds } }
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
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);
    return sendSuccess(response, { lead });
  })
);

router.patch(
  '/:id',
  requirePermission(Permission.LEADS_UPDATE),
  validateRequest(updateLeadSchema),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);

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
    lead!.status = request.body.status;
    lead!.updatedBy = request.user!.id;
    await lead!.save();
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

router.post(
  '/:id/mark-lost',
  requirePermission(Permission.LEADS_UPDATE),
  validateRequest(z.object({ body: z.object({ lostReason: z.string().trim().min(1) }), params: z.object({ id: objectId }), query: z.object({}) })),
  asyncHandler(async (request, response) => {
    const lead = await Lead.findOne({ _id: request.params.id, deletedAt: null });
    await ensureLeadAccess(request, lead);
    lead!.status = 'lost';
    lead!.lostReason = request.body.lostReason;
    lead!.updatedBy = request.user!.id;
    await lead!.save();
    await LeadActivity.create({ leadId: lead!._id, type: 'lost', title: 'Lead perdido', description: lead!.lostReason, createdBy: request.user!.id });
    await writeAuditLog(request, 'LEAD_MARK_LOST', 'Lead', lead!._id.toString());
    return sendSuccess(response, { lead }, 200, getApiMessage('LEAD_LOST'));
  })
);

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
