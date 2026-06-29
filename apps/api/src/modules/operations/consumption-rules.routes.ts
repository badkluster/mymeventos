import { Router, type Request } from 'express';
import { z } from 'zod';
import { ConsumptionRuleTarget, Permission, RoundingMode } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { CatalogItem, ConsumptionRule, ServiceExtra } from './operations.models';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const optionalText = z.string().trim().optional().or(z.literal(''));
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const ruleBaseBody = z.object({
  name: z.string().trim().min(2),
  description: optionalText,
  active: z.boolean().optional(),
  salonId: objectId.optional().or(z.literal('')),
  eventType: optionalText,
  catalogItemId: objectId.optional().or(z.literal('')),
  serviceExtraId: objectId.optional().or(z.literal('')),
  target: z.nativeEnum(ConsumptionRuleTarget),
  quantityPerTarget: z.coerce.number().min(0),
  unitOfMeasure: z.string().trim().min(1),
  minimumQuantity: z.coerce.number().min(0).optional(),
  roundingMode: z.nativeEnum(RoundingMode).default(RoundingMode.CEIL),
  packageSize: z.coerce.number().positive().optional(),
  appliesWhen: z.object({ includesAlcohol: z.boolean().optional(), eventType: optionalText, minGuests: z.coerce.number().min(0).optional(), maxGuests: z.coerce.number().min(0).optional() }).optional(),
  notes: optionalText,
});
const ruleBody = ruleBaseBody.refine((body) => Boolean(body.catalogItemId || body.serviceExtraId), 'Debe asociar producto o servicio.');
const calculationSchema = z.object({
  body: z.object({
    salonId: objectId.optional(),
    eventType: optionalText,
    totalGuests: z.coerce.number().min(0).default(0),
    adultsCount: z.coerce.number().min(0).default(0),
    minorsCount: z.coerce.number().min(0).default(0),
    childrenCount: z.coerce.number().min(0).default(0),
    teenagersCount: z.coerce.number().min(0).default(0),
    adultsWithAlcoholCount: z.coerce.number().min(0).default(0),
    includesAlcohol: z.boolean().optional(),
    durationHours: z.coerce.number().min(0).default(0),
    tablesCount: z.coerce.number().min(0).default(0),
    selectedCatalogItemIds: z.array(objectId).optional(),
    selectedServiceExtraIds: z.array(objectId).optional(),
  }),
  params: z.object({}),
  query: z.object({}),
});
function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  const search = queryValue(request.query.search); if (search) terms.push({ $or: ['name', 'description', 'eventType', 'notes'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  const salonId = queryValue(request.query.salonId); if (salonId && objectId.safeParse(salonId).success) terms.push({ $or: [{ salonId }, { salonId: { $exists: false } }] });
  const active = queryValue(request.query.active); if (active === 'true') terms.push({ active: true }); if (active === 'false') terms.push({ active: false });
  return terms.length === 1 ? terms[0] : { $and: terms };
}
function cleanRefs(body: Record<string, unknown>) { return { ...body, salonId: body.salonId || undefined, catalogItemId: body.catalogItemId || undefined, serviceExtraId: body.serviceExtraId || undefined }; }
function targetValue(target: ConsumptionRuleTarget, payload: any): number {
  const values: Record<ConsumptionRuleTarget, number> = {
    [ConsumptionRuleTarget.TOTAL_GUESTS]: payload.totalGuests,
    [ConsumptionRuleTarget.ADULTS]: payload.adultsCount,
    [ConsumptionRuleTarget.MINORS]: payload.minorsCount,
    [ConsumptionRuleTarget.CHILDREN]: payload.childrenCount,
    [ConsumptionRuleTarget.TEENAGERS]: payload.teenagersCount,
    [ConsumptionRuleTarget.ADULTS_WITH_ALCOHOL]: payload.adultsWithAlcoholCount,
    [ConsumptionRuleTarget.TABLES]: payload.tablesCount,
    [ConsumptionRuleTarget.EVENT_DURATION_HOURS]: payload.durationHours,
  };
  return Number(values[target] ?? 0);
}
function roundQuantity(value: number, mode: RoundingMode, packageSize?: number): number {
  if (mode === RoundingMode.FLOOR) return Math.floor(value);
  if (mode === RoundingMode.ROUND) return Math.round(value);
  if (mode === RoundingMode.PACKAGE_SIZE && packageSize) return Math.ceil(value / packageSize) * packageSize;
  if (mode === RoundingMode.NONE) return value;
  return Math.ceil(value);
}
function ruleApplies(rule: any, payload: any): boolean {
  if (!rule.active) return false;
  if (rule.salonId && payload.salonId && rule.salonId.toString() !== payload.salonId) return false;
  if (rule.eventType && payload.eventType && rule.eventType !== payload.eventType) return false;
  const when = rule.appliesWhen ?? {};
  if (when.includesAlcohol !== undefined && when.includesAlcohol !== payload.includesAlcohol) return false;
  if (when.eventType && payload.eventType && when.eventType !== payload.eventType) return false;
  if (when.minGuests !== undefined && payload.totalGuests < when.minGuests) return false;
  if (when.maxGuests !== undefined && payload.totalGuests > when.maxGuests) return false;
  return true;
}

router.use(requireAuth);
router.get('/', requirePermission(Permission.CONSUMPTION_RULES_READ), asyncHandler(async (request, response) => {
  const items = await ConsumptionRule.find(buildQuery(request)).populate('catalogItemId', 'name unitCost suggestedSalePrice unitOfMeasure').populate('serviceExtraId', 'name basePrice cost type').populate('salonId', 'name').sort({ name: 1 }).lean();
  return sendSuccess(response, { items, targets: Object.values(ConsumptionRuleTarget), roundingModes: Object.values(RoundingMode) });
}));
router.post('/', requirePermission(Permission.CONSUMPTION_RULES_CREATE), validateRequest(z.object({ body: ruleBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const rule = await ConsumptionRule.create({ ...cleanRefs(request.body), createdBy: request.user!.id, updatedBy: request.user!.id });
  return sendSuccess(response, { rule }, 201);
}));
router.post('/calculate', requirePermission(Permission.CONSUMPTION_RULES_READ), validateRequest(calculationSchema), asyncHandler(async (request, response) => {
  const payload = request.body;
  const query: Record<string, unknown> = { active: true, deletedAt: null };
  const rules: any[] = await ConsumptionRule.find(query).populate('catalogItemId').populate('serviceExtraId').lean();
  const selectedCatalog = new Set(payload.selectedCatalogItemIds ?? []);
  const selectedServices = new Set(payload.selectedServiceExtraIds ?? []);
  const suggestedItems = rules.filter((rule) => ruleApplies(rule, payload)).filter((rule) => {
    if (selectedCatalog.size && rule.catalogItemId && !selectedCatalog.has(rule.catalogItemId._id.toString())) return false;
    if (selectedServices.size && rule.serviceExtraId && !selectedServices.has(rule.serviceExtraId._id.toString())) return false;
    return true;
  }).map((rule) => {
    const source = rule.catalogItemId ?? rule.serviceExtraId;
    const rawQuantity = targetValue(rule.target, payload) * Number(rule.quantityPerTarget ?? 0);
    const quantity = Math.max(Number(rule.minimumQuantity ?? 0), roundQuantity(rawQuantity, rule.roundingMode, rule.packageSize));
    const unitCost = Number(source?.unitCost ?? source?.cost ?? 0);
    const suggestedSalePrice = Number(source?.suggestedSalePrice ?? source?.basePrice ?? 0);
    return { ruleId: rule._id, catalogItemId: rule.catalogItemId?._id, serviceExtraId: rule.serviceExtraId?._id, name: source?.name ?? rule.name, quantity, unit: rule.unitOfMeasure, unitCost, suggestedSalePrice, totalCost: quantity * unitCost, totalPrice: quantity * suggestedSalePrice, warnings: quantity === 0 ? ['Sin cantidad sugerida para los datos ingresados.'] : [] };
  });
  return sendSuccess(response, { suggestedItems, totalCost: suggestedItems.reduce((sum, item) => sum + item.totalCost, 0), totalPrice: suggestedItems.reduce((sum, item) => sum + item.totalPrice, 0) });
}));
router.get('/:id', requirePermission(Permission.CONSUMPTION_RULES_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const rule = await ConsumptionRule.findOne({ _id: request.params.id, deletedAt: null }).populate('catalogItemId', 'name').populate('serviceExtraId', 'name').populate('salonId', 'name').lean();
  if (!rule) throw new ApiError(404, 'CONSUMPTION_RULE_NOT_FOUND');
  return sendSuccess(response, { rule });
}));
router.patch('/:id', requirePermission(Permission.CONSUMPTION_RULES_UPDATE), validateRequest(z.object({ body: ruleBaseBody.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const rule = await ConsumptionRule.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...cleanRefs(request.body), updatedBy: request.user!.id }, { new: true, runValidators: true });
  if (!rule) throw new ApiError(404, 'CONSUMPTION_RULE_NOT_FOUND');
  return sendSuccess(response, { rule });
}));
router.delete('/:id', requirePermission(Permission.CONSUMPTION_RULES_DELETE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const rule = await ConsumptionRule.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id, active: false }, { new: true });
  if (!rule) throw new ApiError(404, 'CONSUMPTION_RULE_NOT_FOUND');
  return sendSuccess(response, { deleted: true });
}));

export default router;
