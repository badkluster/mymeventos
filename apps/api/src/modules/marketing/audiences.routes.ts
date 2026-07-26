import { Router } from 'express';
import { z } from 'zod';
import { MARKETING_AUDIENCE_SOURCES, Permission, Role } from '@mym/shared';
import { requireAuth, requirePermission, accessibleSalonIds, canAccessSalon } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { MarketingAudience } from './marketing.models';
import { resolveAudienceContacts, type SalonScope } from './marketing-audience.service';

const router = Router();
router.use(requireAuth);

const id = z.string().regex(/^[0-9a-fA-F]{24}$/);
const schema = (body: z.ZodTypeAny, params: z.ZodRawShape = {}) => z.object({ body, params: z.object(params), query: z.object({}).passthrough() });

const manualMemberSchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(120).optional(),
  lastName: z.string().max(120).optional(),
  sourceType: z.enum(MARKETING_AUDIENCE_SOURCES).optional(),
  sourceId: id.optional()
});

const exclusionSchema = z.object({ sourceType: z.enum(MARKETING_AUDIENCE_SOURCES), sourceId: id });

const filtersSchema = z
  .object({
    lead: z.record(z.string(), z.unknown()).optional(),
    customer: z.record(z.string(), z.unknown()).optional()
  })
  .optional();

const audienceBody = z.object({
  name: z.string().trim().min(2).max(180),
  description: z.string().max(2000).optional(),
  sourceTypes: z.array(z.enum(MARKETING_AUDIENCE_SOURCES)).min(1),
  filters: filtersSchema,
  manualRecipients: z.array(manualMemberSchema).optional(),
  excludedMembers: z.array(exclusionSchema).optional(),
  salonId: id.optional().or(z.literal('')),
  isDynamic: z.boolean().optional()
});

const estimateBody = z.object({
  sourceTypes: z.array(z.enum(MARKETING_AUDIENCE_SOURCES)).min(1),
  filters: filtersSchema,
  manualRecipients: z.array(manualMemberSchema).optional(),
  excludedMembers: z.array(exclusionSchema).optional(),
  extraExcludedEmails: z.array(z.string()).optional(),
  sampleSize: z.coerce.number().int().min(1).max(50).optional()
});

function scopeFor(user: NonNullable<Express.Request['user']>): SalonScope {
  return { isAdmin: user.roles.includes(Role.ADMIN), salonIds: accessibleSalonIds(user) };
}

router.get('/', requirePermission(Permission.MARKETING_AUDIENCES_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  if (!request.user!.roles.includes(Role.ADMIN)) and.push({ $or: [{ salonId: null }, { salonId: { $in: accessibleSalonIds(request.user!) } }] });
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : undefined;
  if (search) and.push({ name: { $regex: search, $options: 'i' } });
  const query = { $and: and };
  const [items, totalItems] = await Promise.all([
    MarketingAudience.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    MarketingAudience.countDocuments(query)
  ]);
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) } });
}));

router.get('/:id', requirePermission(Permission.MARKETING_AUDIENCES_READ), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const audience = await MarketingAudience.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!audience) throw new ApiError(404, 'NOT_FOUND');
  return sendSuccess(response, { audience });
}));

router.post('/estimate', requirePermission(Permission.MARKETING_AUDIENCES_READ), validateRequest(schema(estimateBody)), asyncHandler(async (request, response) => {
  const resolution = await resolveAudienceContacts({ ...request.body, scope: scopeFor(request.user!) });
  return sendSuccess(response, {
    estimatedCount: resolution.contacts.length,
    totalMatched: resolution.totalMatched,
    duplicatesRemoved: resolution.duplicatesRemoved,
    invalidEmailExcluded: resolution.invalidEmailExcluded,
    unsubscribedExcluded: resolution.unsubscribedExcluded,
    manuallyExcluded: resolution.manuallyExcluded
  });
}));

router.post('/preview', requirePermission(Permission.MARKETING_AUDIENCES_READ), validateRequest(schema(estimateBody)), asyncHandler(async (request, response) => {
  const resolution = await resolveAudienceContacts({ ...request.body, scope: scopeFor(request.user!) });
  const sampleSize = request.body.sampleSize ?? 10;
  return sendSuccess(response, {
    sample: resolution.contacts.slice(0, sampleSize),
    estimatedCount: resolution.contacts.length,
    totalMatched: resolution.totalMatched,
    duplicatesRemoved: resolution.duplicatesRemoved,
    invalidEmailExcluded: resolution.invalidEmailExcluded,
    unsubscribedExcluded: resolution.unsubscribedExcluded,
    manuallyExcluded: resolution.manuallyExcluded
  });
}));

router.post('/', requirePermission(Permission.MARKETING_AUDIENCES_MANAGE), validateRequest(schema(audienceBody)), asyncHandler(async (request, response) => {
  if (request.body.salonId && !canAccessSalon(request.user!, request.body.salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const resolution = await resolveAudienceContacts({ ...request.body, scope: scopeFor(request.user!) });
  const audience = await MarketingAudience.create({
    ...request.body,
    salonId: request.body.salonId || undefined,
    estimatedCount: resolution.contacts.length,
    lastCalculatedAt: new Date(),
    createdBy: request.user!.id,
    updatedBy: request.user!.id
  });
  await writeAuditLog(request, 'MARKETING_AUDIENCE_CREATE', 'MarketingAudience', String(audience._id));
  return sendSuccess(response, { audience }, 201);
}));

router.patch('/:id', requirePermission(Permission.MARKETING_AUDIENCES_MANAGE), validateRequest(schema(audienceBody.partial(), { id })), asyncHandler(async (request, response) => {
  const audience = await MarketingAudience.findOne({ _id: request.params.id, deletedAt: null });
  if (!audience) throw new ApiError(404, 'NOT_FOUND');
  if (audience.salonId && !canAccessSalon(request.user!, String(audience.salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  if (request.body.salonId && !canAccessSalon(request.user!, request.body.salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  Object.assign(audience, request.body, { salonId: request.body.salonId || audience.salonId, updatedBy: request.user!.id });
  if (audience.isDynamic) {
    const resolution = await resolveAudienceContacts({
      sourceTypes: audience.sourceTypes,
      filters: audience.filters as any,
      manualRecipients: audience.manualRecipients as any,
      excludedMembers: audience.excludedMembers as any,
      scope: scopeFor(request.user!)
    });
    audience.estimatedCount = resolution.contacts.length;
    audience.lastCalculatedAt = new Date();
  }
  await audience.save();
  await writeAuditLog(request, 'MARKETING_AUDIENCE_UPDATE', 'MarketingAudience', String(audience._id));
  return sendSuccess(response, { audience });
}));

router.delete('/:id', requirePermission(Permission.MARKETING_AUDIENCES_MANAGE), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const audience = await MarketingAudience.findOne({ _id: request.params.id, deletedAt: null });
  if (!audience) throw new ApiError(404, 'NOT_FOUND');
  audience.deletedAt = new Date();
  audience.deletedBy = request.user!.id as any;
  await audience.save();
  await writeAuditLog(request, 'MARKETING_AUDIENCE_DELETE', 'MarketingAudience', String(audience._id));
  return sendSuccess(response, { success: true });
}));

export default router;
