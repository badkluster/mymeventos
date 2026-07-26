import { Router } from 'express';
import { z } from 'zod';
import { Permission, PROMOTION_DISCOUNT_TYPES, Role } from '@mym/shared';
import { requireAuth, requirePermission, accessibleSalonIds, canAccessSalon } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { Promotion } from './marketing.models';

const router = Router();
router.use(requireAuth);

const id = z.string().regex(/^[0-9a-fA-F]{24}$/);
const schema = (body: z.ZodTypeAny, params: z.ZodRawShape = {}) => z.object({ body, params: z.object(params), query: z.object({}).passthrough() });

const promotionBodyBase = z.object({
  name: z.string().trim().min(2).max(180),
  internalDescription: z.string().max(2000).optional(),
  publicTitle: z.string().max(200).optional(),
  publicDescription: z.string().max(2000).optional(),
  code: z.string().trim().max(40).optional().or(z.literal('')),
  discountType: z.enum(PROMOTION_DISCOUNT_TYPES),
  discountValue: z.coerce.number().min(0).optional(),
  minimumAmount: z.coerce.number().min(0).optional(),
  maximumDiscount: z.coerce.number().min(0).optional(),
  validFrom: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional(),
  usageLimit: z.coerce.number().int().min(0).optional(),
  usageLimitPerCustomer: z.coerce.number().int().min(0).optional(),
  applicableSalonIds: z.array(id).optional(),
  applicablePackageIds: z.array(id).optional(),
  applicableServiceIds: z.array(id).optional(),
  eventTypes: z.array(z.string().max(80)).optional(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
  termsAndConditions: z.string().max(8000).optional(),
  bannerImageUrl: z.string().url().optional().or(z.literal('')),
  buttonLabel: z.string().max(80).optional(),
  buttonUrl: z.string().url().optional().or(z.literal(''))
});

function refinePromotion<T extends z.ZodTypeAny>(schemaToRefine: T) {
  return schemaToRefine.superRefine((value: any, ctx: z.RefinementCtx) => {
    if (value.discountType === 'percentage' && value.discountValue !== undefined && (value.discountValue < 0 || value.discountValue > 100)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'El porcentaje debe estar entre 0 y 100.' });
    }
    if (value.validFrom && value.validUntil && value.validUntil < value.validFrom) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validUntil'], message: 'La vigencia final debe ser posterior a la inicial.' });
    }
  });
}

const promotionBody = refinePromotion(promotionBodyBase);
const promotionUpdateBody = refinePromotion(promotionBodyBase.partial());

function assertSalonAccess(user: NonNullable<Express.Request['user']>, salonIds: string[] | undefined) {
  if (user.roles.includes(Role.ADMIN) || !salonIds?.length) return;
  if (!salonIds.every((salonId) => canAccessSalon(user, salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}

router.get('/', requirePermission(Permission.PROMOTIONS_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
  const and: Record<string, unknown>[] = [];
  if (!request.user!.roles.includes(Role.ADMIN)) {
    const salons = accessibleSalonIds(request.user!);
    and.push({ $or: [{ applicableSalonIds: { $size: 0 } }, { applicableSalonIds: { $in: salons } }] });
  }
  const status = typeof request.query.status === 'string' ? request.query.status : undefined;
  const now = new Date();
  and.push({ archivedAt: status === 'archived' ? { $ne: null } : null });
  if (status === 'active') and.push({ isActive: true, $or: [{ validUntil: null }, { validUntil: { $gte: now } }] });
  if (status === 'scheduled') and.push({ isActive: true, validFrom: { $gt: now } });
  if (status === 'expired') and.push({ validUntil: { $lt: now } });
  if (status === 'inactive') and.push({ isActive: false });
  const salonIdFilter = typeof request.query.salonId === 'string' ? request.query.salonId : undefined;
  if (salonIdFilter) and.push({ applicableSalonIds: salonIdFilter });
  const discountTypeFilter = typeof request.query.discountType === 'string' ? request.query.discountType : undefined;
  if (discountTypeFilter) and.push({ discountType: discountTypeFilter });
  const search = typeof request.query.search === 'string' ? request.query.search.trim() : undefined;
  if (search) and.push({ $or: [{ name: { $regex: search, $options: 'i' } }, { code: { $regex: search, $options: 'i' } }] });

  const query = and.length ? { $and: and } : {};
  const [items, totalItems] = await Promise.all([
    Promotion.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Promotion.countDocuments(query)
  ]);
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)) } });
}));

router.get('/:id', requirePermission(Permission.PROMOTIONS_READ), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const promotion = await Promotion.findOne({ _id: request.params.id }).lean();
  if (!promotion) throw new ApiError(404, 'NOT_FOUND');
  return sendSuccess(response, { promotion });
}));

router.post('/', requirePermission(Permission.PROMOTIONS_CREATE), validateRequest(schema(promotionBody)), asyncHandler(async (request, response) => {
  assertSalonAccess(request.user!, request.body.applicableSalonIds);
  const code = request.body.code ? request.body.code.trim().toUpperCase() : undefined;
  if (code) {
    const existing = await Promotion.findOne({ code }).lean();
    if (existing) throw new ApiError(409, 'VALIDATION_ERROR', 'Ya existe una promoción con ese código.');
  }
  const promotion = await Promotion.create({ ...request.body, code, createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'MARKETING_PROMOTION_CREATE', 'Promotion', String(promotion._id));
  return sendSuccess(response, { promotion }, 201);
}));

router.patch('/:id', requirePermission(Permission.PROMOTIONS_UPDATE), validateRequest(schema(promotionUpdateBody, { id })), asyncHandler(async (request, response) => {
  const promotion = await Promotion.findOne({ _id: request.params.id });
  if (!promotion) throw new ApiError(404, 'NOT_FOUND');
  assertSalonAccess(request.user!, promotion.applicableSalonIds?.map(String));
  assertSalonAccess(request.user!, request.body.applicableSalonIds);
  if (request.body.code !== undefined) {
    const code = request.body.code ? request.body.code.trim().toUpperCase() : undefined;
    if (code) {
      const existing = await Promotion.findOne({ code, _id: { $ne: promotion._id } }).lean();
      if (existing) throw new ApiError(409, 'VALIDATION_ERROR', 'Ya existe una promoción con ese código.');
    }
    request.body.code = code;
  }
  Object.assign(promotion, request.body, { updatedBy: request.user!.id });
  await promotion.save();
  await writeAuditLog(request, 'MARKETING_PROMOTION_UPDATE', 'Promotion', String(promotion._id), request.body);
  return sendSuccess(response, { promotion });
}));

router.post('/:id/duplicate', requirePermission(Permission.PROMOTIONS_CREATE), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const source: any = await Promotion.findOne({ _id: request.params.id }).lean();
  if (!source) throw new ApiError(404, 'NOT_FOUND');
  const { _id, createdAt, updatedAt, usedCount, code, ...rest } = source;
  const promotion = await Promotion.create({ ...rest, name: `${source.name} (copia)`, isActive: false, usedCount: 0, createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'MARKETING_PROMOTION_DUPLICATE', 'Promotion', String(promotion._id), { sourceId: request.params.id });
  return sendSuccess(response, { promotion }, 201);
}));

router.post('/:id/archive', requirePermission(Permission.PROMOTIONS_UPDATE), validateRequest(schema(z.unknown(), { id })), asyncHandler(async (request, response) => {
  const promotion = await Promotion.findOneAndUpdate({ _id: request.params.id }, { archivedAt: new Date(), isActive: false, updatedBy: request.user!.id }, { new: true });
  if (!promotion) throw new ApiError(404, 'NOT_FOUND');
  await writeAuditLog(request, 'MARKETING_PROMOTION_ARCHIVE', 'Promotion', String(promotion._id));
  return sendSuccess(response, { promotion });
}));

export default router;
