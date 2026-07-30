import { createHash } from 'crypto';
import type { Request } from 'express';
import { Contract, Event, Quote } from '../crm/crm.models';
import { InventoryItem } from '../operations/operations.models';
import { ProductionItem, ProductionPlan, ProductionRule, ProductionSection } from './production.models';
import { ApiError } from '../../middlewares/errorHandler';
import { canAccessSalon } from '../../middlewares/auth';
import { writeAuditLog } from '../audit/audit.service';

const sectionNames: Record<string, string> = {
  savory: 'Producción salada', sweet: 'Producción dulce', beverages: 'Bebidas', cake: 'Tortas',
  bakery: 'Panadería', kitchen: 'Cocina', bar: 'Barra', miscellaneous: 'Otros',
};
const sectionOrderByType: Record<string, number> = {
  savory: 0, sweet: 1, beverages: 2, cake: 3, bakery: 4, kitchen: 5, bar: 6, miscellaneous: 7,
};

export function normalizeProductName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-AR').replace(/\s+/g, ' ');
}

function round(value: number, mode: string, packageSize?: number) {
  if (mode === 'floor') return Math.floor(value);
  if (mode === 'round') return Math.round(value);
  if (mode === 'none') return Number(value.toFixed(3));
  if (mode === 'package_size' && packageSize) return Math.ceil(value / packageSize) * packageSize;
  return Math.ceil(value);
}

function guestCounts(event: any) {
  const breakdown = event.guestBreakdown ?? {};
  return {
    total: Number(event.guestCount ?? breakdown.totalGuests ?? 0),
    adults: Number(breakdown.adultsCount ?? 0),
    minors: Number(breakdown.minorsCount ?? 0),
    children: Number(breakdown.childrenCount ?? 0),
    teenagers: Number(breakdown.teenagersCount ?? 0),
    adultsWithAlcohol: Number(breakdown.adultsWithAlcoholCount ?? 0),
  };
}

function assertSalon(request: Request, salonId: unknown) {
  if (!canAccessSalon(request.user!, String(salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
}

type SuggestedItem = {
  productId?: string;
  name: string;
  category?: string;
  quantity: number;
  unit: string;
  sectionType: string;
  sourceType: 'rule' | 'legacy_snapshot' | 'manual';
  sourceId?: string;
  responsibleId?: string;
  observations?: string;
};

function mergeSuggested(items: SuggestedItem[]) {
  const merged = new Map<string, SuggestedItem>();
  for (const item of items) {
    const key = `${item.productId || normalizeProductName(item.name)}|${normalizeProductName(item.unit)}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity = Number((existing.quantity + item.quantity).toFixed(3));
      if (item.sourceType === 'manual') {
        existing.sourceType = 'manual';
        existing.sourceId = item.sourceId;
        existing.responsibleId = item.responsibleId || existing.responsibleId;
        existing.observations = [existing.observations, item.observations].filter(Boolean).join(' · ') || undefined;
      }
    } else merged.set(key, { ...item });
  }
  return [...merged.values()];
}

function normalizeForFingerprint(value: any): any {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeForFingerprint);
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') return value.toHexString();
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeForFingerprint(value[key])]));
  }
  return value;
}

function fingerprint(value: any) {
  return createHash('sha256').update(JSON.stringify(normalizeForFingerprint(value))).digest('hex');
}

function collectIds(value: any, keys: Set<string>, output = new Set<string>(), depth = 0): Set<string> {
  if (value === null || value === undefined || depth > 6) return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectIds(item, keys, output, depth + 1));
    return output;
  }
  if (typeof value !== 'object') return output;
  for (const [key, item] of Object.entries(value)) {
    if (keys.has(key) && item) {
      const id = typeof item === 'string' ? item : (item as any)?.toString?.();
      if (id && /^[0-9a-fA-F]{24}$/.test(id)) output.add(id);
    }
    collectIds(item, keys, output, depth + 1);
  }
  return output;
}

function addTopLevelIds(value: any, output: Set<string>) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of items) {
    const candidate = typeof item === 'string' ? item : item?._id || item?.id;
    const id = candidate?.toString?.();
    if (id && /^[0-9a-fA-F]{24}$/.test(id)) output.add(id);
  }
}

function sameId(left: unknown, right: unknown) {
  return Boolean(left && right && String(left) === String(right));
}

async function productionSource(eventId: string) {
  const event: any = await Event.findOne({ _id: eventId, deletedAt: null }).lean();
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');
  if (!event.eventDate) throw new ApiError(409, 'PRODUCTION_EVENT_DATE_REQUIRED', 'El evento necesita una fecha antes de generar producción.');
  const quoteId = event.sourceQuoteId || event.quoteId;
  const quotePromise = quoteId
    ? Quote.findOne({ _id: quoteId, deletedAt: null }).select('packageTemplateId packageName lineItems servicesSnapshot updatedAt').lean()
    : Promise.resolve(null);
  const [contract, quote, rules]: any[] = await Promise.all([
    Contract.findOne({ eventId, deletedAt: null, status: { $nin: ['cancelled', 'superseded'] } }).sort({ versionNumber: -1, createdAt: -1 }).lean(),
    quotePromise,
    ProductionRule.find({
      deletedAt: null, isActive: true,
      $and: [
        { $or: [{ salonId: event.salonId }, { salonId: { $exists: false } }, { salonId: null }] },
        { $or: [{ eventType: event.eventType }, { eventType: { $exists: false } }, { eventType: '' }] },
        { $or: [{ validFrom: { $exists: false } }, { validFrom: null }, { validFrom: { $lte: event.eventDate } }] },
        { $or: [{ validUntil: { $exists: false } }, { validUntil: null }, { validUntil: { $gte: event.eventDate } }] },
      ],
    }).populate('productId').sort({ createdAt: 1 }).lean(),
  ]);
  const counts = guestCounts(event);
  const packageIds = collectIds([quote, contract?.commercialSnapshot, event.commercialSnapshot], new Set(['packageId', 'packageTemplateId']));
  if (quote?.packageTemplateId) packageIds.add(String(quote.packageTemplateId));
  const serviceSources = [event.servicesSnapshot, event.lineItemsSnapshot, event.resourcePlanSnapshot?.services, contract?.servicesSnapshot, contract?.lineItemsSnapshot, quote?.servicesSnapshot, quote?.lineItems];
  const serviceIds = collectIds(serviceSources, new Set(['serviceId', 'serviceExtraId']));
  serviceSources.forEach((source) => addTopLevelIds(source, serviceIds));
  const matchingRules = rules.filter((rule: any) => {
    if (rule.guestsFrom !== undefined && counts.total < rule.guestsFrom) return false;
    if (rule.guestsTo !== undefined && counts.total > rule.guestsTo) return false;
    if (rule.packageId && ![...packageIds].some((id) => sameId(id, rule.packageId))) return false;
    if (rule.serviceId && ![...serviceIds].some((id) => sameId(id, rule.serviceId))) return false;
    return true;
  });
  const sourceSnapshot = {
    event: {
      id: event._id, eventName: event.eventName, eventType: event.eventType, eventDate: event.eventDate,
      guestCounts: counts, menuSnapshot: event.menuSnapshot ?? null, servicesSnapshot: event.servicesSnapshot ?? null,
      lineItemsSnapshot: event.lineItemsSnapshot ?? null, resourceProducts: event.resourcePlanSnapshot?.productItems ?? [],
      updatedAt: event.updatedAt,
    },
    contract: contract ? {
      id: contract._id, number: contract.contractNumber, status: contract.status, versionNumber: contract.versionNumber,
      lineItems: contract.lineItemsSnapshot, menu: contract.menuSnapshot, services: contract.servicesSnapshot, updatedAt: contract.updatedAt,
    } : null,
    quote: quote ? { id: quote._id, packageTemplateId: quote.packageTemplateId, packageName: quote.packageName, updatedAt: quote.updatedAt } : null,
    packageIds: [...packageIds].sort(),
    serviceIds: [...serviceIds].sort(),
    rules: matchingRules.map((rule: any) => ({
      id: rule._id, updatedAt: rule.updatedAt, name: rule.name, productId: rule.productId?._id, packageId: rule.packageId, serviceId: rule.serviceId,
      quantityPerGuest: rule.quantityPerGuest, fixedQuantity: rule.fixedQuantity, wastePercentage: rule.wastePercentage,
      roundingMode: rule.roundingMode, packageSize: rule.packageSize, sectionType: rule.sectionType,
    })),
  };
  return { event, contract, counts, matchingRules, sourceSnapshot, sourceFingerprint: fingerprint(sourceSnapshot) };
}

async function previousManualItems(existing: any): Promise<SuggestedItem[]> {
  if (!existing) return [];
  const originals: any[] = await ProductionItem.find({ productionPlanId: existing._id, deletedAt: null, isManual: true }).lean();
  if (!originals.length) return [];
  const sectionIds = [...new Set(originals.map((item) => item.sectionId?.toString()).filter(Boolean))];
  const sections: any[] = await ProductionSection.find({ _id: { $in: sectionIds } }).select('type').lean();
  const typeBySection = new Map(sections.map((section) => [section._id.toString(), section.type]));
  return originals.map((item) => ({
    productId: item.productId?.toString(), name: item.productNameSnapshot, category: item.category, quantity: Number(item.plannedQuantity || 0), unit: item.unit,
    sectionType: typeBySection.get(item.sectionId?.toString()) || 'miscellaneous', sourceType: 'manual' as const,
    sourceId: item.sourceId || item._id.toString(), responsibleId: item.responsibleId?.toString(), observations: item.observations,
  }));
}

export async function generateProductionPlan(request: Request, eventId: string, options: { regenerate?: boolean; reason?: string } = {}) {
  const source = await productionSource(eventId);
  assertSalon(request, source.event.salonId);
  const existing: any = await ProductionPlan.findOne({ eventId, isCurrent: true, deletedAt: null }).lean();
  const sourceChanged = Boolean(existing && existing.sourceFingerprint !== source.sourceFingerprint);
  if (existing && !sourceChanged) return { plan: await productionPlanDetail(request, existing._id.toString()), created: false, requiresRegeneration: false, sourceChanged: false };
  if (existing && !options.regenerate) return { plan: await productionPlanDetail(request, existing._id.toString()), created: false, requiresRegeneration: true, sourceChanged: true, nextSourceFingerprint: source.sourceFingerprint };
  if (existing && !(options.reason && options.reason.trim())) throw new ApiError(422, 'PRODUCTION_REGENERATION_REASON_REQUIRED', 'Indicá el motivo de la regeneración.');

  const ruleItems: SuggestedItem[] = source.matchingRules.map((rule: any) => {
    const base = Number(rule.fixedQuantity ?? 0) + source.counts.total * Number(rule.quantityPerGuest ?? 0);
    const quantity = round(base * (1 + Number(rule.wastePercentage ?? 0) / 100), rule.roundingMode, rule.packageSize);
    return { productId: rule.productId?._id?.toString(), name: rule.productId?.name || rule.name, category: rule.productId?.category, quantity, unit: rule.productId?.unitOfMeasure || 'unidad', sectionType: rule.sectionType, sourceType: 'rule' as const, sourceId: rule._id.toString() };
  }).filter((item: SuggestedItem) => item.quantity > 0);
  const legacyItems: SuggestedItem[] = (source.event.resourcePlanSnapshot?.productItems ?? []).map((item: any) => ({
    productId: item.catalogItemId?.toString(), name: item.name || item.productName || 'Producto', category: item.category,
    quantity: Number(item.quantity ?? item.plannedQuantity ?? 0), unit: item.unit || item.unitOfMeasure || 'unidad',
    sectionType: item.sectionType || (item.category === 'BEVERAGE' ? 'beverages' : 'miscellaneous'), sourceType: 'legacy_snapshot' as const, sourceId: item.id?.toString(),
  })).filter((item: SuggestedItem) => item.quantity > 0);
  const manualItems = await previousManualItems(existing);
  const suggested = mergeSuggested([...ruleItems, ...legacyItems, ...manualItems]);
  const version = existing ? Number(existing.version || 1) + 1 : 1;
  if (existing) await ProductionPlan.updateOne({ _id: existing._id, isCurrent: true }, { isCurrent: false, updatedBy: request.user!.id });
  let plan: any;
  try {
    plan = await ProductionPlan.create({
      eventId: source.event._id, contractId: source.contract?._id, salonId: source.event.salonId, customerId: source.event.customerId, eventDate: source.event.eventDate,
      guestCounts: source.counts, status: 'pending', generatedAt: new Date(), generatedBy: request.user!.id, version, isCurrent: true,
      supersedesPlanId: existing?._id, regenerationReason: existing ? options.reason?.trim() : undefined,
      sourceFingerprint: source.sourceFingerprint, sourceSnapshot: source.sourceSnapshot,
      createdBy: request.user!.id, updatedBy: request.user!.id,
    });
    const sectionTypes = [...new Set(suggested.map((item) => item.sectionType))];
    const sections: any[] = sectionTypes.length ? await ProductionSection.insertMany(sectionTypes.map((type, index) => ({
      productionPlanId: plan._id, type, name: sectionNames[type] ?? 'Otros', order: index, createdBy: request.user!.id, updatedBy: request.user!.id,
    }))) : [];
    const sectionByType = new Map(sections.map((section) => [section.type, section]));
    if (suggested.length) await ProductionItem.insertMany(suggested.map((item, index) => ({
      productionPlanId: plan._id, sectionId: sectionByType.get(item.sectionType)?._id, productId: item.productId,
      normalizedProductName: normalizeProductName(item.name), productNameSnapshot: item.name, category: item.category,
      plannedQuantity: item.quantity, unit: item.unit, dueAt: source.event.eventDate, sourceType: item.sourceType, sourceId: item.sourceId,
      responsibleId: item.responsibleId, observations: item.observations, isManual: item.sourceType === 'manual', order: index,
      transitions: item.sourceType === 'manual' ? [{ fromStatus: '', toStatus: 'pending', changedAt: new Date(), changedBy: request.user!.id, reason: 'Conservado de versión anterior' }] : [],
      createdBy: request.user!.id, updatedBy: request.user!.id,
    })));
    if (existing) await ProductionPlan.updateOne({ _id: existing._id }, { supersededByPlanId: plan._id, updatedBy: request.user!.id });
  } catch (error) {
    if (plan?._id) {
      await ProductionItem.deleteMany({ productionPlanId: plan._id });
      await ProductionSection.deleteMany({ productionPlanId: plan._id });
      await ProductionPlan.deleteOne({ _id: plan._id });
    }
    if (existing) await ProductionPlan.updateOne({ _id: existing._id }, { isCurrent: true, updatedBy: request.user!.id });
    throw error;
  }
  await writeAuditLog(request, existing ? 'PRODUCTION_PLAN_REGENERATE' : 'PRODUCTION_PLAN_GENERATE', 'ProductionPlan', plan._id.toString(), { eventId, version, previousPlanId: existing?._id, itemCount: suggested.length, ruleCount: source.matchingRules.length, reason: options.reason });
  return { plan: await productionPlanDetail(request, plan._id.toString()), created: true, regenerated: Boolean(existing), requiresRegeneration: false, sourceChanged };
}

export async function productionPlanDetail(request: Request, planId: string) {
  const plan: any = await ProductionPlan.findOne({ _id: planId, deletedAt: null })
    .populate('eventId', 'eventName eventType eventDate startTime guestCount status')
    .populate('customerId', 'fullName phone email').populate('salonId', 'name').populate('contractId', 'contractNumber status').lean();
  if (!plan) throw new ApiError(404, 'PRODUCTION_PLAN_NOT_FOUND');
  assertSalon(request, plan.salonId?._id ?? plan.salonId);
  const sections: any[] = await ProductionSection.find({ productionPlanId: planId, deletedAt: null }).sort({ order: 1 }).lean();
  const items: any[] = await ProductionItem.find({ productionPlanId: planId, deletedAt: null })
    .populate('responsibleId', 'firstName lastName fullName').populate('readyBy', 'firstName lastName fullName').populate('checkedBy', 'firstName lastName fullName')
    .sort({ order: 1 }).lean();
  return { ...plan, sections: sections.map((section) => ({ ...section, items: items.filter((item) => item.sectionId.toString() === section._id.toString()) })) };
}

export async function productionPlanFreshness(request: Request, planId: string) {
  const plan: any = await ProductionPlan.findOne({ _id: planId, deletedAt: null }).lean();
  if (!plan) throw new ApiError(404, 'PRODUCTION_PLAN_NOT_FOUND');
  assertSalon(request, plan.salonId);
  const source = await productionSource(plan.eventId.toString());
  return { current: plan.sourceFingerprint === source.sourceFingerprint, currentFingerprint: plan.sourceFingerprint, nextFingerprint: source.sourceFingerprint };
}

export async function refreshPlanStatus(planId: string) {
  const items: any[] = await ProductionItem.find({ productionPlanId: planId, deletedAt: null, status: { $ne: 'cancelled' } }).select('status').lean();
  let status = 'pending';
  if (items.some((item) => item.status === 'blocked')) status = 'blocked';
  else if (items.length && items.every((item) => item.status === 'checked')) status = 'checked';
  else if (items.length && items.every((item) => ['ready', 'checked'].includes(item.status))) status = 'ready';
  else if (items.some((item) => item.status !== 'pending')) status = 'in_progress';
  const plan: any = await ProductionPlan.findById(planId).select('startedAt completedAt').lean();
  const update: Record<string, unknown> = { status };
  if (status === 'in_progress' && !plan?.startedAt) update.startedAt = new Date();
  if (status === 'checked' && !plan?.completedAt) update.completedAt = new Date();
  await ProductionPlan.updateOne({ _id: planId }, update);
  return status;
}

export async function consolidatedProduction(_request: Request, from: Date, to: Date, salonMatch: Record<string, unknown>) {
  const plans: any[] = await ProductionPlan.find({ deletedAt: null, isCurrent: true, ...salonMatch, eventDate: { $gte: from, $lt: to }, status: { $nin: ['cancelled'] } })
    .select('_id eventId eventDate customerId')
    .populate('eventId', 'eventName eventType')
    .populate('customerId', 'fullName')
    .sort({ eventDate: 1 })
    .lean();
  const planIds = plans.map((plan) => plan._id);
  const planById = new Map(plans.map((plan) => [plan._id.toString(), plan]));

  const sections: any[] = await ProductionSection.find({ productionPlanId: { $in: planIds }, deletedAt: null }).select('productionPlanId type').lean();
  const sectionTypeById = new Map(sections.map((section) => [section._id.toString(), section.type]));

  const items: any[] = await ProductionItem.find({ deletedAt: null, productionPlanId: { $in: planIds }, status: { $ne: 'cancelled' } })
    .select('productId normalizedProductName productNameSnapshot unit plannedQuantity completedQuantity status productionPlanId sectionId')
    .lean();

  type EventBreakdown = { planId: string; eventId?: string; eventName?: string; eventType?: string; customerName?: string; eventDate: Date; plannedQuantity: number; completedQuantity: number };
  type Bucket = {
    sectionType: string; productId?: string; productName: string; unit: string;
    plannedQuantity: number; completedQuantity: number; pendingItems: number;
    planIds: Set<string>; byEvent: Map<string, EventBreakdown>;
  };
  const buckets = new Map<string, Bucket>();

  for (const item of items) {
    const sectionType = sectionTypeById.get(item.sectionId?.toString()) || 'miscellaneous';
    const key = `${sectionType}|${item.productId ? item.productId.toString() : normalizeProductName(item.normalizedProductName)}|${item.unit}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { sectionType, productId: item.productId?.toString(), productName: item.productNameSnapshot, unit: item.unit, plannedQuantity: 0, completedQuantity: 0, pendingItems: 0, planIds: new Set(), byEvent: new Map() };
      buckets.set(key, bucket);
    }
    bucket.plannedQuantity += item.plannedQuantity;
    bucket.completedQuantity += item.completedQuantity;
    if (['pending', 'in_progress', 'blocked'].includes(item.status)) bucket.pendingItems += 1;
    const planId = item.productionPlanId.toString();
    bucket.planIds.add(planId);
    const plan = planById.get(planId);
    const eventBreakdown = bucket.byEvent.get(planId) ?? {
      planId, eventId: plan?.eventId?._id?.toString(), eventName: plan?.eventId?.eventName, eventType: plan?.eventId?.eventType,
      customerName: plan?.customerId?.fullName, eventDate: plan?.eventDate, plannedQuantity: 0, completedQuantity: 0,
    };
    eventBreakdown.plannedQuantity += item.plannedQuantity;
    eventBreakdown.completedQuantity += item.completedQuantity;
    bucket.byEvent.set(planId, eventBreakdown);
  }

  const productIds = [...buckets.values()].map((bucket) => bucket.productId).filter(Boolean);
  const inventory: any[] = await InventoryItem.aggregate([
    { $match: { deletedAt: null, active: true, catalogItemId: { $in: productIds }, ...salonMatch } },
    { $group: { _id: '$catalogItemId', available: { $sum: { $max: [0, { $subtract: ['$currentQuantity', '$reservedQuantity'] }] } } } },
  ]);
  const inventoryMap = new Map(inventory.map((item) => [item._id.toString(), item.available]));

  const rows = [...buckets.values()].map((bucket) => {
    const available = bucket.productId ? Number(inventoryMap.get(bucket.productId) ?? 0) : 0;
    return {
      sectionType: bucket.sectionType, productId: bucket.productId, productName: bucket.productName, unit: bucket.unit,
      plannedQuantity: bucket.plannedQuantity, completedQuantity: bucket.completedQuantity, eventCount: bucket.planIds.size, pendingItems: bucket.pendingItems,
      availableQuantity: available, missingQuantity: Math.max(0, bucket.plannedQuantity - available), toBuyQuantity: Math.max(0, bucket.plannedQuantity - available),
      toProduceQuantity: Math.max(0, bucket.plannedQuantity - bucket.completedQuantity),
      byEvent: [...bucket.byEvent.values()].sort((left, right) => new Date(left.eventDate).getTime() - new Date(right.eventDate).getTime()),
    };
  });

  const sectionsOut = [...new Set(rows.map((row) => row.sectionType))]
    .sort((left, right) => (sectionOrderByType[left] ?? 99) - (sectionOrderByType[right] ?? 99))
    .map((type) => {
      const sectionRows = rows.filter((row) => row.sectionType === type).sort((left, right) => left.productName.localeCompare(right.productName, 'es'));
      const events = [...new Map(sectionRows.flatMap((row) => row.byEvent).map((event) => [event.planId, event])).values()]
        .sort((left, right) => new Date(left.eventDate).getTime() - new Date(right.eventDate).getTime());
      return { type, name: sectionNames[type] ?? 'Otros', events, items: sectionRows };
    });

  return { sections: sectionsOut, flat: rows };
}
