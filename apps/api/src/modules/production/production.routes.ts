import { Router } from 'express';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission, userHasPermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { CatalogItem } from '../operations/operations.models';
import { Event } from '../crm/crm.models';
import { parseReportPeriod, resolveReportScope } from '../reporting/report-filter';
import { consolidatedProduction, generateProductionPlan, normalizeProductName, productionPlanDetail, productionPlanFreshness, refreshPlanStatus } from './production.service';
import { ProductionItem, ProductionPlan, ProductionRule, ProductionSection } from './production.models';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const sectionType = z.enum(['savory', 'sweet', 'beverages', 'cake', 'bakery', 'kitchen', 'bar', 'miscellaneous']);
const itemStatus = z.enum(['pending', 'in_progress', 'ready', 'checked', 'blocked', 'cancelled']);
const ruleShape = z.object({
  name: z.string().trim().min(2), packageId: objectId.optional().or(z.literal('')), serviceId: objectId.optional().or(z.literal('')),
  productId: objectId, eventType: z.string().trim().optional().or(z.literal('')), guestsFrom: z.coerce.number().min(0).optional(),
  guestsTo: z.coerce.number().min(0).optional(), quantityPerGuest: z.coerce.number().min(0).default(0), fixedQuantity: z.coerce.number().min(0).default(0),
  roundingMode: z.enum(['none', 'ceil', 'floor', 'round', 'package_size']).default('ceil'), packageSize: z.coerce.number().min(0).optional(),
  wastePercentage: z.coerce.number().min(0).max(100).default(0), salonId: objectId.optional().or(z.literal('')), sectionType: sectionType.default('miscellaneous'),
  isActive: z.boolean().default(true), validFrom: z.coerce.date().optional(), validUntil: z.coerce.date().optional(), notes: z.string().trim().optional().or(z.literal('')),
});
const ruleBody = ruleShape.refine((body) => body.guestsTo === undefined || body.guestsFrom === undefined || body.guestsTo >= body.guestsFrom, 'El máximo de invitados debe ser mayor o igual al mínimo.');

function cleanReferences(body: Record<string, unknown>) {
  return { ...body, salonId: body.salonId || undefined, packageId: body.packageId || undefined, serviceId: body.serviceId || undefined };
}

router.use(requireAuth);

router.get('/products', requirePermission(Permission.PRODUCTION_VIEW), asyncHandler(async (_request, response) => {
  const items = await CatalogItem.find({ deletedAt: null, active: true }).select('name category unitOfMeasure').sort({ name: 1 }).lean();
  return sendSuccess(response, { items });
}));

router.get('/plans', requirePermission(Permission.PRODUCTION_VIEW), asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(request.query.limit) || 25));
  const query: any = { deletedAt: null, isCurrent: true, ...scope.match(), eventDate: { $gte: period.from, $lt: period.toExclusive } };
  if (request.query.status) query.status = String(request.query.status);
  const search = String(request.query.search || '').trim();
  const eventIds = search ? (await Event.find({ deletedAt: null, $or: [{ eventName: { $regex: search, $options: 'i' } }, { eventType: { $regex: search, $options: 'i' } }] }).select('_id').lean()).map((event: any) => event._id) : undefined;
  if (eventIds) query.eventId = { $in: eventIds };
  const [plans, totalItems, statusSummary] = await Promise.all([
    ProductionPlan.find(query).populate('eventId', 'eventName eventType eventDate startTime guestCount updatedAt').populate('salonId', 'name').populate('customerId', 'fullName').sort({ eventDate: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    ProductionPlan.countDocuments(query),
    ProductionPlan.aggregate([{ $match: query }, { $group: { _id: '$status', value: { $sum: 1 } } }]),
  ]);
  const planIds = plans.map((plan: any) => plan._id);
  const itemSummaries: any[] = await ProductionItem.aggregate([{ $match: { productionPlanId: { $in: planIds }, deletedAt: null, status: { $ne: 'cancelled' } } }, { $group: { _id: '$productionPlanId', total: { $sum: 1 }, checked: { $sum: { $cond: [{ $eq: ['$status', 'checked'] }, 1, 0] } }, blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } } } }]);
  const itemMap = new Map(itemSummaries.map((item) => [item._id.toString(), item]));
  return sendSuccess(response, {
    items: plans.map((plan: any) => ({ ...plan, itemSummary: itemMap.get(plan._id.toString()) ?? { total: 0, checked: 0, blocked: 0 } })),
    summary: statusSummary,
    meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 },
  });
}));

router.get('/candidates', requirePermission(Permission.PRODUCTION_GENERATE), asyncHandler(async (request, response) => {
  const scope = resolveReportScope(request);
  const now = new Date();
  const until = new Date(now.getTime() + 120 * 86_400_000);
  const plans: any[] = await ProductionPlan.find({ deletedAt: null, isCurrent: true }).select('eventId').lean();
  const items = await Event.find({ deletedAt: null, ...scope.match(), eventDate: { $gte: now, $lt: until }, status: { $nin: ['cancelled', 'lost'] }, _id: { $nin: plans.map((plan) => plan.eventId) } })
    .populate('salonId', 'name').populate('customerId', 'fullName').sort({ eventDate: 1 }).limit(100).lean();
  return sendSuccess(response, { items });
}));

router.post('/plans/generate', requirePermission(Permission.PRODUCTION_GENERATE), validateRequest(z.object({
  body: z.object({ eventId: objectId, regenerate: z.boolean().optional(), reason: z.string().trim().optional().or(z.literal('')) }), params: z.object({}), query: z.object({}),
})), asyncHandler(async (request, response) => {
  if (request.body.regenerate) {
    const existing: any = await ProductionPlan.findOne({ eventId: request.body.eventId, isCurrent: true, deletedAt: null }).lean();
    if (existing?.status === 'closed' && !userHasPermission(request.user!, Permission.PRODUCTION_REOPEN)) throw new ApiError(403, 'FORBIDDEN');
  }
  const result = await generateProductionPlan(request, request.body.eventId, { regenerate: request.body.regenerate, reason: request.body.reason });
  const message = result.requiresRegeneration ? 'La fuente del evento cambió. Revisá y confirmá la regeneración.' : result.regenerated ? 'Producción regenerada en una nueva versión.' : result.created ? 'Producción generada.' : 'La producción vigente está actualizada.';
  return sendSuccess(response, result, result.created ? 201 : 200, message);
}));

router.get('/plans/:id/freshness', requirePermission(Permission.PRODUCTION_VIEW), validateRequest(z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, await productionPlanFreshness(request, request.params.id));
}));

router.get('/plans/:id', requirePermission(Permission.PRODUCTION_VIEW), validateRequest(z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  return sendSuccess(response, { plan: await productionPlanDetail(request, request.params.id) });
}));

router.post('/plans/:id/items', requirePermission(Permission.PRODUCTION_CREATE), validateRequest(z.object({
  body: z.object({ sectionType: sectionType.default('miscellaneous'), productId: objectId.optional().or(z.literal('')), productName: z.string().trim().min(2), category: z.string().trim().optional(), plannedQuantity: z.coerce.number().min(0), unit: z.string().trim().min(1), responsibleId: objectId.optional().or(z.literal('')), dueAt: z.coerce.date().optional(), observations: z.string().trim().optional().or(z.literal('')) }),
  params: z.object({ id: objectId }), query: z.object({}),
})), asyncHandler(async (request, response) => {
  const plan: any = await productionPlanDetail(request, request.params.id);
  if (['closed', 'cancelled'].includes(plan.status)) throw new ApiError(409, 'PRODUCTION_PLAN_LOCKED', 'La producción está cerrada y no admite cambios.');
  const names: Record<string, string> = { savory: 'Producción salada', sweet: 'Producción dulce', beverages: 'Bebidas', cake: 'Tortas', bakery: 'Panadería', kitchen: 'Cocina', bar: 'Barra', miscellaneous: 'Otros' };
  const section: any = await ProductionSection.findOneAndUpdate(
    { productionPlanId: plan._id, type: request.body.sectionType, deletedAt: null },
    { $setOnInsert: { name: names[request.body.sectionType], order: plan.sections.length, createdBy: request.user!.id }, updatedBy: request.user!.id },
    { upsert: true, new: true },
  );
  const product: any = request.body.productId ? await CatalogItem.findOne({ _id: request.body.productId, deletedAt: null }).lean() : null;
  const name = product?.name || request.body.productName;
  try {
    const item = await ProductionItem.create({
      productionPlanId: plan._id, sectionId: section._id, productId: product?._id, normalizedProductName: normalizeProductName(name), productNameSnapshot: name,
      category: request.body.category || product?.category, plannedQuantity: request.body.plannedQuantity, unit: request.body.unit || product?.unitOfMeasure,
      responsibleId: request.body.responsibleId || undefined, dueAt: request.body.dueAt || plan.eventDate, observations: request.body.observations,
      sourceType: 'manual', sourceId: `manual:${Date.now()}`, isManual: true, order: plan.sections.reduce((sum: number, current: any) => sum + current.items.length, 0),
      transitions: [{ fromStatus: '', toStatus: 'pending', changedAt: new Date(), changedBy: request.user!.id, reason: 'Alta manual' }],
      createdBy: request.user!.id, updatedBy: request.user!.id,
    });
    await writeAuditLog(request, 'PRODUCTION_ITEM_CREATE', 'ProductionItem', item._id.toString(), { productionPlanId: plan._id, plannedQuantity: item.plannedQuantity, unit: item.unit });
    return sendSuccess(response, { item }, 201);
  } catch (error: any) {
    if (error?.code === 11000) throw new ApiError(409, 'PRODUCTION_ITEM_DUPLICATE', 'Ese producto y unidad ya existen en el plan. Editá la fila existente.');
    throw error;
  }
}));

router.patch('/items/:id', requirePermission(Permission.PRODUCTION_UPDATE), validateRequest(z.object({
  body: z.object({ plannedQuantity: z.coerce.number().min(0).optional(), completedQuantity: z.coerce.number().min(0).optional(), responsibleId: objectId.optional().or(z.literal('')), dueAt: z.coerce.date().optional(), observations: z.string().trim().optional().or(z.literal('')) }).refine((body) => Object.keys(body).length > 0),
  params: z.object({ id: objectId }), query: z.object({}),
})), asyncHandler(async (request, response) => {
  const existing: any = await ProductionItem.findOne({ _id: request.params.id, deletedAt: null }).populate('productionPlanId').lean();
  if (!existing) throw new ApiError(404, 'PRODUCTION_ITEM_NOT_FOUND');
  await productionPlanDetail(request, existing.productionPlanId._id.toString());
  if (['closed', 'cancelled'].includes(existing.productionPlanId.status)) throw new ApiError(409, 'PRODUCTION_PLAN_LOCKED');
  const update = { ...request.body, responsibleId: request.body.responsibleId || undefined, updatedBy: request.user!.id };
  const item = await ProductionItem.findByIdAndUpdate(existing._id, update, { new: true, runValidators: true });
  await writeAuditLog(request, 'PRODUCTION_ITEM_UPDATE', 'ProductionItem', request.params.id, { before: { plannedQuantity: existing.plannedQuantity, completedQuantity: existing.completedQuantity, responsibleId: existing.responsibleId }, after: update });
  return sendSuccess(response, { item });
}));

router.post('/items/:id/status', requirePermission(Permission.PRODUCTION_UPDATE), validateRequest(z.object({
  body: z.object({ status: itemStatus, completedQuantity: z.coerce.number().min(0).optional(), reason: z.string().trim().optional().or(z.literal('')) }),
  params: z.object({ id: objectId }), query: z.object({}),
})), asyncHandler(async (request, response) => {
  const item: any = await ProductionItem.findOne({ _id: request.params.id, deletedAt: null }).populate('productionPlanId');
  if (!item) throw new ApiError(404, 'PRODUCTION_ITEM_NOT_FOUND');
  await productionPlanDetail(request, item.productionPlanId._id.toString());
  if (['closed', 'cancelled'].includes(item.productionPlanId.status)) throw new ApiError(409, 'PRODUCTION_PLAN_LOCKED');
  const movingBack = ['ready', 'checked'].includes(item.status) && ['pending', 'in_progress'].includes(request.body.status);
  if (movingBack && !userHasPermission(request.user!, Permission.PRODUCTION_REOPEN)) throw new ApiError(403, 'FORBIDDEN');
  if (['ready', 'checked'].includes(request.body.status) && !userHasPermission(request.user!, Permission.PRODUCTION_COMPLETE)) throw new ApiError(403, 'FORBIDDEN');
  const before = item.status;
  const now = new Date();
  item.status = request.body.status;
  if (request.body.completedQuantity !== undefined) item.completedQuantity = request.body.completedQuantity;
  if (request.body.status === 'ready') { item.ready = true; item.readyAt = now; item.readyBy = request.user!.id; }
  if (request.body.status === 'checked') { item.ready = true; item.checked = true; item.checkedAt = now; item.checkedBy = request.user!.id; if (!item.readyAt) { item.readyAt = now; item.readyBy = request.user!.id; } }
  if (movingBack) { item.ready = false; item.checked = false; item.readyAt = undefined; item.checkedAt = undefined; item.readyBy = undefined; item.checkedBy = undefined; }
  item.transitions.push({ fromStatus: before, toStatus: request.body.status, changedAt: now, changedBy: request.user!.id, reason: request.body.reason });
  item.updatedBy = request.user!.id;
  await item.save();
  const planStatus = await refreshPlanStatus(item.productionPlanId._id.toString());
  await writeAuditLog(request, 'PRODUCTION_ITEM_STATUS_CHANGE', 'ProductionItem', item._id.toString(), { productionPlanId: item.productionPlanId._id, fromStatus: before, toStatus: item.status, reason: request.body.reason });
  return sendSuccess(response, { item, planStatus });
}));

router.post('/plans/:id/close', requirePermission(Permission.PRODUCTION_COMPLETE), validateRequest(z.object({ body: z.object({ notes: z.string().trim().optional().or(z.literal('')) }), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const plan: any = await productionPlanDetail(request, request.params.id);
  const incomplete = plan.sections.flatMap((section: any) => section.items).filter((item: any) => !['checked', 'cancelled'].includes(item.status));
  if (incomplete.length) throw new ApiError(409, 'PRODUCTION_INCOMPLETE', `Quedan ${incomplete.length} ítems sin chequear.`);
  await ProductionPlan.updateOne({ _id: plan._id }, { status: 'closed', closedAt: new Date(), notes: request.body.notes || plan.notes, updatedBy: request.user!.id });
  await writeAuditLog(request, 'PRODUCTION_PLAN_CLOSE', 'ProductionPlan', request.params.id);
  return sendSuccess(response, { closed: true });
}));

router.post('/plans/:id/reopen', requirePermission(Permission.PRODUCTION_REOPEN), validateRequest(z.object({ body: z.object({ reason: z.string().trim().min(3) }), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const plan: any = await productionPlanDetail(request, request.params.id);
  if (plan.status !== 'closed') throw new ApiError(409, 'PRODUCTION_NOT_CLOSED', 'Solamente se puede reabrir una producción cerrada.');
  await ProductionPlan.updateOne({ _id: plan._id }, { status: 'checked', closedAt: null, reopenedAt: new Date(), reopenedBy: request.user!.id, reopenReason: request.body.reason, updatedBy: request.user!.id });
  await writeAuditLog(request, 'PRODUCTION_PLAN_REOPEN', 'ProductionPlan', request.params.id, { reason: request.body.reason });
  return sendSuccess(response, { reopened: true });
}));

router.get('/consolidated', requirePermission(Permission.PRODUCTION_VIEW), asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const items = await consolidatedProduction(request, period.from, period.toExclusive, scope.match());
  return sendSuccess(response, { items, period: { from: period.fromDate, to: period.toDate }, totals: { products: items.length, plannedQuantity: items.reduce((sum, item) => sum + item.plannedQuantity, 0), missingQuantity: items.reduce((sum, item) => sum + item.missingQuantity, 0) } });
}));

router.get('/rules', requirePermission(Permission.PRODUCTION_RULES_MANAGE), asyncHandler(async (request, response) => {
  const scope = resolveReportScope(request);
  const query: any = { deletedAt: null, ...scope.match() };
  if (request.query.active === 'true') query.isActive = true;
  if (request.query.active === 'false') query.isActive = false;
  const items = await ProductionRule.find(query).populate('productId', 'name unitOfMeasure category').populate('packageId', 'name').populate('serviceId', 'name').populate('salonId', 'name').sort({ name: 1 }).lean();
  return sendSuccess(response, { items });
}));
router.post('/rules', requirePermission(Permission.PRODUCTION_RULES_MANAGE), validateRequest(z.object({ body: ruleBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const rule = await ProductionRule.create({ ...cleanReferences(request.body), createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'PRODUCTION_RULE_CREATE', 'ProductionRule', rule._id.toString(), request.body);
  return sendSuccess(response, { rule }, 201);
}));
router.patch('/rules/:id', requirePermission(Permission.PRODUCTION_RULES_MANAGE), validateRequest(z.object({ body: ruleShape.partial().refine((body) => Object.keys(body).length > 0), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const before: any = await ProductionRule.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!before) throw new ApiError(404, 'PRODUCTION_RULE_NOT_FOUND');
  const rule = await ProductionRule.findByIdAndUpdate(before._id, { ...cleanReferences(request.body), updatedBy: request.user!.id }, { new: true, runValidators: true });
  await writeAuditLog(request, 'PRODUCTION_RULE_UPDATE', 'ProductionRule', request.params.id, { before, after: request.body });
  return sendSuccess(response, { rule });
}));

export default router;
