import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, Role } from '@mym/shared';
import { Salon } from './salon.model';
import { PackageTemplate, VenuePackageRule } from '../crm/crm.models';
import { User } from '../users/user.model';
import { syncSalonManager } from '../users/user.service';
import { accessibleSalonIds, canAccessSalon, requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { writeAuditLog } from '../audit/audit.service';
import { ApiError } from '../../middlewares/errorHandler';
import { idParams } from '../common.schemas';
import { getApiMessage } from '../../utils/messages';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const optionalText = z.string().trim().optional().or(z.literal(''));
const eventTypes = ['birthday', 'wedding', 'fifteen', 'graduates', 'corporate', 'baptism_communion', 'other'] as const;
const urlField = optionalText.refine((value) => !value || z.string().url().safeParse(value).success, 'Debe ser una URL válida.');
const menuSectionsSchema = z.array(z.object({ title: z.string().trim().min(1), items: z.array(z.string().trim().min(1)) }));

const extraSchema = z.object({
  _id: objectId.optional(),
  name: z.string().trim().min(2),
  description: optionalText,
  basePrice: z.coerce.number().min(0).default(0),
  active: z.boolean().default(true),
  applicablePackageIds: z.array(objectId).optional(),
  includedByDefault: z.boolean().default(false),
  publicVisible: z.boolean().default(false)
});
const mediaSchema = z.object({
  _id: objectId.optional(),
  url: z.string().url(),
  secureUrl: z.string().url().optional().or(z.literal('')),
  publicId: optionalText,
  resourceType: z.enum(['image', 'video', 'raw']).default('image'),
  format: optionalText,
  title: optionalText,
  altText: optionalText,
  displayOrder: z.coerce.number().int().min(0).default(0),
  publicVisible: z.boolean().default(true),
  bytes: z.coerce.number().min(0).optional(),
  width: z.coerce.number().min(0).optional(),
  height: z.coerce.number().min(0).optional(),
  duration: z.coerce.number().min(0).optional()
});

const salonBaseFields = z.object({
  name: z.string().trim().min(2),
  slug: z.string().trim().min(2).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  address: optionalText,
  city: optionalText,
  locality: optionalText,
  province: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  email: z.string().email().optional().or(z.literal('')),
  instagramUrl: urlField,
  facebookUrl: urlField,
  tiktokUrl: urlField,
  managerUserId: objectId.optional().or(z.literal('')),
  active: z.boolean().optional(),
  internalDescription: optionalText,
  publicTitle: optionalText,
  publicDescription: optionalText,
  publicShortDescription: optionalText,
  visibleOnWebsite: z.boolean().optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
  minCapacity: z.coerce.number().int().min(0).optional(),
  maxCapacity: z.coerce.number().int().min(0).optional(),
  recommendedCapacity: z.coerce.number().int().min(0).optional(),
  allowedEventTypes: z.array(z.enum(eventTypes)).optional(),
  defaultStartTime: optionalText,
  defaultEndTime: optionalText,
  defaultDurationHours: z.coerce.number().positive().optional(),
  allowsExtraHour: z.boolean().optional(),
  extraHourPrice: z.coerce.number().min(0).optional(),
  operationalNotes: optionalText,
  defaultDepositAmount: z.coerce.number().min(0).optional(),
  minimumDepositAmount: z.coerce.number().min(0).optional(),
  defaultSecurityDepositAmount: z.coerce.number().min(0).optional(),
  defaultLateFeePercentage: z.coerce.number().min(0).max(100).optional(),
  defaultPaymentTerms: optionalText,
  defaultQuoteValidityDays: z.coerce.number().int().positive().optional(),
  defaultContractTerms: optionalText,
  commercialNotes: optionalText,
  activePromotionIds: z.array(objectId).optional(),
  heroImageUrl: urlField,
  galleryImageUrls: z.array(urlField).optional(),
  mediaGallery: z.array(mediaSchema).optional(),
  seoTitle: optionalText,
  seoDescription: optionalText,
  locationText: optionalText,
  mapUrl: urlField,
  extraServices: z.array(extraSchema).optional()
});

function validateCapacityRange(body: { minCapacity?: number; maxCapacity?: number; recommendedCapacity?: number }, context: z.RefinementCtx): void {
  const min = body.minCapacity ?? 0;
  const max = body.maxCapacity ?? 0;
  const recommended = body.recommendedCapacity ?? 0;
  if (max && min && max < min) context.addIssue({ code: z.ZodIssueCode.custom, path: ['maxCapacity'], message: 'La capacidad máxima debe ser mayor o igual a la mínima.' });
  if (recommended && min && recommended < min) context.addIssue({ code: z.ZodIssueCode.custom, path: ['recommendedCapacity'], message: 'La capacidad recomendada debe estar dentro del rango.' });
  if (recommended && max && recommended > max) context.addIssue({ code: z.ZodIssueCode.custom, path: ['recommendedCapacity'], message: 'La capacidad recomendada debe estar dentro del rango.' });
}

const salonFields = salonBaseFields.superRefine(validateCapacityRange);

const createSchema = z.object({ body: salonFields, params: z.object({}), query: z.object({}) });
const updateSchema = z.object({ body: salonBaseFields.partial().superRefine(validateCapacityRange).refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: idParams.shape.params, query: z.object({}) });
const commercialSchema = z.object({
  body: salonBaseFields.pick({
    defaultDepositAmount: true, minimumDepositAmount: true, defaultSecurityDepositAmount: true, defaultLateFeePercentage: true, defaultPaymentTerms: true,
    defaultQuoteValidityDays: true, defaultContractTerms: true, commercialNotes: true, activePromotionIds: true
  }).partial(),
  params: idParams.shape.params,
  query: z.object({})
});
const extrasSchema = z.object({ body: z.object({ extras: z.array(extraSchema) }), params: idParams.shape.params, query: z.object({}) });
const ruleSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).optional(),
    durationHours: z.coerce.number().positive().optional(),
    startTime: optionalText,
    endTime: optionalText,
    active: z.boolean().optional(),
    pricingMode: z.enum(['per_person', 'fixed']).optional(),
    pricePerPerson: z.coerce.number().min(0).optional(),
    fixedPrice: z.coerce.number().min(0).optional(),
    discountPercentage: z.coerce.number().min(0).max(100).optional(),
    finalPricePerPerson: z.coerce.number().min(0).optional(),
    finalFixedPrice: z.coerce.number().min(0).optional(),
    depositAmount: z.coerce.number().min(0).optional(),
    paymentTerms: optionalText,
    promotionText: optionalText,
    giftText: optionalText,
    menuSections: menuSectionsSchema.optional(),
    includedServices: z.array(z.string().trim().min(1)).optional(),
    notes: optionalText
  }),
  params: z.object({ id: objectId, packageTemplateId: objectId }),
  query: z.object({})
});
const ruleParamsSchema = z.object({ body: z.object({}).optional(), params: z.object({ id: objectId, packageTemplateId: objectId }), query: z.object({}) });

function listScope(request: Request): Record<string, unknown> {
  if (request.user!.roles.includes(Role.ADMIN)) return {};
  return { _id: { $in: accessibleSalonIds(request.user!) } };
}

async function ensureSalonAccess(request: Request, salonId: string): Promise<void> {
  if (!canAccessSalon(request.user!, salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}

async function getSalonOrFail(request: Request, salonId: string): Promise<any> {
  await ensureSalonAccess(request, salonId);
  const salon = await Salon.findOne({ _id: salonId, deletedAt: null }).lean();
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  return enrichSalon(salon);
}

async function ensureManagerIsValid(managerUserId?: string): Promise<void> {
  if (!managerUserId) return;
  const manager: any = await User.findOne({ _id: managerUserId, active: true, deletedAt: null }).lean();
  if (!manager) throw new ApiError(422, 'SALON_MANAGER_NOT_FOUND');
  if (!(manager.roles ?? []).some((role: Role) => [Role.ADMIN, Role.MANAGER, Role.SALON_MANAGER].includes(role))) throw new ApiError(422, 'SALON_MANAGER_ROLE_INVALID');
}

async function attachManagerToSalon(managerUserId: string | undefined, salonId: string): Promise<void> {
  if (!managerUserId) return;
  await syncSalonManager(salonId, managerUserId);
}

function managerIdsFrom(salons: any[]): string[] {
  return [...new Set(salons.map((salon) => salon.managerUserId?.toString()).filter(Boolean))];
}

function safeVisible(value: unknown): boolean {
  return value === undefined || value === null ? true : Boolean(value);
}

async function managersById(salons: any[]): Promise<Map<string, any>> {
  const managerIds = managerIdsFrom(salons);
  if (!managerIds.length) return new Map();
  const users = await User.find({ _id: { $in: managerIds }, deletedAt: null }).select('_id firstName lastName email phone roles active').lean();
  return new Map(users.map((user: any) => [user._id.toString(), user]));
}

async function enrichSalon(salon: any): Promise<any> {
  const managers = await managersById([salon]);
  const manager = salon.managerUserId ? managers.get(salon.managerUserId.toString()) : undefined;
  return { ...salon, visibleOnWebsite: safeVisible(salon.visibleOnWebsite), manager };
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.SALONS_READ), asyncHandler(async (request, response) => {
  const query: Record<string, unknown> = { deletedAt: null, ...listScope(request) };
  if (request.query.active === 'true') query.active = true;
  if (request.query.active === 'false') query.active = false;
  if (request.query.visibleOnWebsite === 'true') query.visibleOnWebsite = true;
  if (request.query.visibleOnWebsite === 'false') query.visibleOnWebsite = false;
  if (typeof request.query.search === 'string' && request.query.search.trim()) {
    const term = { $regex: request.query.search.trim(), $options: 'i' };
    query.$or = [{ name: term }, { city: term }, { locality: term }, { address: term }];
  }
  const salons = await Salon.find(query).sort({ displayOrder: 1, name: 1 }).lean();
  const salonIds = salons.map((salon: any) => salon._id);
  const rules = salonIds.length ? await VenuePackageRule.find({ salonId: { $in: salonIds }, active: true, deletedAt: null }).select('salonId').lean() : [];
  const counts = new Map<string, number>();
  for (const rule of rules as any[]) {
    const key = rule.salonId.toString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const managers = await managersById(salons);
  return sendSuccess(response, { salons: salons.map((salon: any) => {
    const manager = salon.managerUserId ? managers.get(salon.managerUserId.toString()) : undefined;
    return { ...salon, visibleOnWebsite: safeVisible(salon.visibleOnWebsite), manager, activePackageCount: counts.get(salon._id.toString()) ?? 0 };
  }) });
}));

router.post('/', requirePermission(Permission.SALONS_UPDATE), validateRequest(createSchema), asyncHandler(async (request, response) => {
  const duplicate = await Salon.exists({ slug: request.body.slug, deletedAt: null });
  if (duplicate) throw new ApiError(409, 'SALON_SLUG_ALREADY_EXISTS');
  await ensureManagerIsValid(request.body.managerUserId);
  const salon = await Salon.create({ ...request.body, locality: request.body.locality || request.body.city, createdBy: request.user!.id, updatedBy: request.user!.id });
  await syncSalonManager(salon._id.toString(), request.body.managerUserId, request.user!.id);
  await writeAuditLog(request, 'SALON_CREATE', 'Salon', salon._id.toString());
  return sendSuccess(response, { salon }, 201, getApiMessage('SALON_CREATED'));
}));

router.get('/:id', requirePermission(Permission.SALONS_READ), validateRequest(idParams), asyncHandler(async (request, response) => {
  return sendSuccess(response, { salon: await getSalonOrFail(request, request.params.id) });
}));

router.patch('/:id', requirePermission(Permission.SALONS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  await ensureSalonAccess(request, request.params.id);
  if (request.body.slug) {
    const duplicate = await Salon.exists({ _id: { $ne: request.params.id }, slug: request.body.slug, deletedAt: null });
    if (duplicate) throw new ApiError(409, 'SALON_SLUG_ALREADY_EXISTS');
  }
  await ensureManagerIsValid(request.body.managerUserId);
  const previousSalon: any = await Salon.findOne({ _id: request.params.id, deletedAt: null }).select('managerUserId').lean();
  const { managerUserId, ...body } = request.body;
  let update: Record<string, unknown> = { ...body, locality: body.locality || body.city, updatedBy: request.user!.id };
  if (managerUserId) update.managerUserId = managerUserId;
  if (managerUserId === '') update = { $set: update, $unset: { managerUserId: 1 } };
  const salon = await Salon.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, update, { new: true });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  if (request.body.managerUserId !== undefined) await syncSalonManager(request.params.id, request.body.managerUserId || undefined, request.user!.id, previousSalon?.managerUserId?.toString());
  await writeAuditLog(request, 'SALON_UPDATE', 'Salon', request.params.id);
  return sendSuccess(response, { salon: await enrichSalon(salon.toObject ? salon.toObject() : salon) }, 200, getApiMessage('SALON_UPDATED'));
}));

router.patch('/:id/activate', requirePermission(Permission.SALONS_UPDATE), validateRequest(idParams), asyncHandler(async (request, response) => {
  await ensureSalonAccess(request, request.params.id);
  const salon = await Salon.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { active: true, updatedBy: request.user!.id }, { new: true });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  await writeAuditLog(request, 'SALON_ACTIVATE', 'Salon', request.params.id);
  return sendSuccess(response, { salon }, 200, getApiMessage('SALON_UPDATED'));
}));

router.patch('/:id/deactivate', requirePermission(Permission.SALONS_UPDATE), validateRequest(idParams), asyncHandler(async (request, response) => {
  await ensureSalonAccess(request, request.params.id);
  const salon = await Salon.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { active: false, updatedBy: request.user!.id }, { new: true });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  await writeAuditLog(request, 'SALON_DEACTIVATE', 'Salon', request.params.id);
  return sendSuccess(response, { salon }, 200, getApiMessage('SALON_UPDATED'));
}));

router.get('/:id/commercial-config', requirePermission(Permission.SALONS_READ), validateRequest(idParams), asyncHandler(async (request, response) => {
  const salon = await getSalonOrFail(request, request.params.id);
  return sendSuccess(response, { commercialConfig: {
    defaultDepositAmount: salon.defaultDepositAmount ?? 0,
    minimumDepositAmount: salon.minimumDepositAmount ?? 0,
    defaultSecurityDepositAmount: salon.defaultSecurityDepositAmount ?? 0,
    defaultLateFeePercentage: salon.defaultLateFeePercentage ?? 0,
    defaultPaymentTerms: salon.defaultPaymentTerms ?? '',
    defaultQuoteValidityDays: salon.defaultQuoteValidityDays ?? 7,
    defaultContractTerms: salon.defaultContractTerms ?? '',
    commercialNotes: salon.commercialNotes ?? '',
    activePromotionIds: salon.activePromotionIds ?? []
  } });
}));

router.patch('/:id/commercial-config', requirePermission(Permission.SALONS_UPDATE), validateRequest(commercialSchema), asyncHandler(async (request, response) => {
  await ensureSalonAccess(request, request.params.id);
  const salon = await Salon.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...request.body, updatedBy: request.user!.id }, { new: true });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  await writeAuditLog(request, 'SALON_COMMERCIAL_UPDATE', 'Salon', request.params.id);
  return sendSuccess(response, { salon }, 200, getApiMessage('SALON_UPDATED'));
}));

router.get('/:id/package-rules', requirePermission(Permission.SALONS_READ), validateRequest(idParams), asyncHandler(async (request, response) => {
  const salon = await getSalonOrFail(request, request.params.id);
  const templates = await PackageTemplate.find({ active: true, deletedAt: null, $or: [{ isGlobal: true }, { salonIds: salon._id }] }).sort({ name: 1 }).lean();
  const rules = await VenuePackageRule.find({ salonId: request.params.id, deletedAt: null }).lean();
  const byTemplate = new Map(rules.map((rule: any) => [rule.packageTemplateId.toString(), rule]));
  return sendSuccess(response, {
    packageRules: templates.map((template: any) => {
      const rule = byTemplate.get(template._id.toString());
      return { ...template, ...rule, packageTemplateId: template._id, packageName: rule?.name ?? template.name, ruleConfigured: Boolean(rule) };
    })
  });
}));

router.patch('/:id/package-rules/:packageTemplateId', requirePermission(Permission.SALONS_UPDATE), validateRequest(ruleSchema), asyncHandler(async (request, response) => {
  await ensureSalonAccess(request, request.params.id);
  const template = await PackageTemplate.exists({ _id: request.params.packageTemplateId, deletedAt: null });
  if (!template) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_FOUND');
  const rule = await VenuePackageRule.findOneAndUpdate(
    { packageTemplateId: request.params.packageTemplateId, salonId: request.params.id },
    { ...request.body, packageTemplateId: request.params.packageTemplateId, salonId: request.params.id, updatedBy: request.user!.id, deletedAt: null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await writeAuditLog(request, 'VENUE_PACKAGE_RULE_UPDATE_FROM_SALON', 'VenuePackageRule', rule._id.toString());
  return sendSuccess(response, { rule }, 200, getApiMessage('PACKAGE_RULE_UPDATED'));
}));

router.delete('/:id/package-rules/:packageTemplateId', requirePermission(Permission.SALONS_UPDATE), validateRequest(ruleParamsSchema), asyncHandler(async (request, response) => {
  await ensureSalonAccess(request, request.params.id);
  const globalTemplate = await PackageTemplate.exists({ _id: request.params.packageTemplateId, isGlobal: true, deletedAt: null });
  if (globalTemplate) throw new ApiError(422, 'GLOBAL_PACKAGE_RULE_CANNOT_BE_DELETED');
  const rule = await VenuePackageRule.findOneAndUpdate(
    { packageTemplateId: request.params.packageTemplateId, salonId: request.params.id, deletedAt: null },
    { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id },
    { new: true }
  );
  if (!rule) throw new ApiError(404, 'PACKAGE_RULE_NOT_FOUND');
  await writeAuditLog(request, 'VENUE_PACKAGE_RULE_DELETE_FROM_SALON', 'VenuePackageRule', rule._id.toString());
  return sendSuccess(response, { deleted: true });
}));

router.get('/:id/extras', requirePermission(Permission.SALONS_READ), validateRequest(idParams), asyncHandler(async (request, response) => {
  const salon = await getSalonOrFail(request, request.params.id);
  return sendSuccess(response, { extras: salon.extraServices ?? [] });
}));

router.patch('/:id/extras', requirePermission(Permission.SALONS_UPDATE), validateRequest(extrasSchema), asyncHandler(async (request, response) => {
  await ensureSalonAccess(request, request.params.id);
  const salon = await Salon.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { extraServices: request.body.extras, updatedBy: request.user!.id }, { new: true });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  await writeAuditLog(request, 'SALON_EXTRAS_UPDATE', 'Salon', request.params.id);
  return sendSuccess(response, { extras: salon.extraServices ?? [] }, 200, getApiMessage('SALON_UPDATED'));
}));

router.delete('/:id', requirePermission(Permission.SALONS_UPDATE), validateRequest(idParams), asyncHandler(async (request, response) => {
  await ensureSalonAccess(request, request.params.id);
  const salon = await Salon.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id }, { new: true });
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
  await writeAuditLog(request, 'SALON_DELETE', 'Salon', request.params.id);
  return sendSuccess(response, { deleted: true }, 200, getApiMessage('SALON_DELETED'));
}));

export default router;
