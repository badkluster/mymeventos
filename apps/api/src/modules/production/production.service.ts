import type { Request } from 'express';
import { Contract, Event } from '../crm/crm.models';
import { CatalogItem, InventoryItem } from '../operations/operations.models';
import { ProductionItem, ProductionPlan, ProductionRule, ProductionSection } from './production.models';
import { ApiError } from '../../middlewares/errorHandler';
import { canAccessSalon } from '../../middlewares/auth';
import { writeAuditLog } from '../audit/audit.service';

const sectionNames: Record<string, string> = {
  savory: 'Producción salada', sweet: 'Producción dulce', beverages: 'Bebidas', cake: 'Tortas',
  bakery: 'Panadería', kitchen: 'Cocina', bar: 'Barra', miscellaneous: 'Otros',
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
  productId?: string; name: string; category?: string; quantity: number; unit: string; sectionType: string;
  sourceType: 'rule' | 'legacy_snapshot'; sourceId?: string;
};

function mergeSuggested(items: SuggestedItem[]) {
  const merged = new Map<string, SuggestedItem>();
  for (const item of items) {
    const key = `${item.productId || normalizeProductName(item.name)}|${normalizeProductName(item.unit)}`;
    const existing = merged.get(key);
    if (existing) existing.quantity = Number((existing.quantity + item.quantity).toFixed(3));
    else merged.set(key, { ...item });
  }
  return [...merged.values()];
}

export async function generateProductionPlan(request: Request, eventId: string) {
  const event: any = await Event.findOne({ _id: eventId, deletedAt: null }).lean();
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');
  assertSalon(request, event.salonId);
  const existing: any = await ProductionPlan.findOne({ eventId, isCurrent: true, deletedAt: null }).lean();
  if (existing) return { plan: await productionPlanDetail(request, existing._id.toString()), created: false };
  if (!event.eventDate) throw new ApiError(409, 'PRODUCTION_EVENT_DATE_REQUIRED', 'El evento necesita una fecha antes de generar producción.');
  const [contract, rules]: any[] = await Promise.all([
    Contract.findOne({ eventId, deletedAt: null, status: { $nin: ['cancelled', 'superseded'] } }).sort({ versionNumber: -1 }).lean(),
    ProductionRule.find({
      deletedAt: null, isActive: true,
      $and: [
        { $or: [{ salonId: event.salonId }, { salonId: { $exists: false } }, { salonId: null }] },
        { $or: [{ eventType: event.eventType }, { eventType: { $exists: false } }, { eventType: '' }] },
        { $or: [{ validFrom: { $exists: false } }, { validFrom: null }, { validFrom: { $lte: event.eventDate } }] },
        { $or: [{ validUntil: { $exists: false } }, { validUntil: null }, { validUntil: { $gte: event.eventDate } }] },
      ],
    }).populate('productId').lean(),
  ]);
  const counts = guestCounts(event);
  const matchingRules = rules.filter((rule: any) => (rule.guestsFrom === undefined || counts.total >= rule.guestsFrom) && (rule.guestsTo === undefined || counts.total <= rule.guestsTo));
  const ruleItems: SuggestedItem[] = matchingRules.map((rule: any) => {
    const base = Number(rule.fixedQuantity ?? 0) + counts.total * Number(rule.quantityPerGuest ?? 0);
    const quantity = round(base * (1 + Number(rule.wastePercentage ?? 0) / 100), rule.roundingMode, rule.packageSize);
    return { productId: rule.productId?._id?.toString(), name: rule.productId?.name || rule.name, category: rule.productId?.category, quantity, unit: rule.productId?.unitOfMeasure || 'unidad', sectionType: rule.sectionType, sourceType: 'rule' as const, sourceId: rule._id.toString() };
  }).filter((item: SuggestedItem) => item.quantity > 0);
  const legacyItems: SuggestedItem[] = (event.resourcePlanSnapshot?.productItems ?? []).map((item: any) => ({
    productId: item.catalogItemId?.toString(), name: item.name || item.productName || 'Producto', category: item.category,
    quantity: Number(item.quantity ?? item.plannedQuantity ?? 0), unit: item.unit || item.unitOfMeasure || 'unidad',
    sectionType: item.sectionType || (item.category === 'BEVERAGE' ? 'beverages' : 'miscellaneous'), sourceType: 'legacy_snapshot' as const, sourceId: item.id?.toString(),
  })).filter((item: SuggestedItem) => item.quantity > 0);
  const suggested = mergeSuggested([...ruleItems, ...legacyItems]);
  const plan: any = await ProductionPlan.create({
    eventId: event._id, contractId: contract?._id, salonId: event.salonId, customerId: event.customerId, eventDate: event.eventDate,
    guestCounts: counts, status: 'pending', generatedAt: new Date(), generatedBy: request.user!.id, version: 1, isCurrent: true,
    sourceSnapshot: {
      event: { eventName: event.eventName, eventType: event.eventType, eventDate: event.eventDate, guestCounts: counts },
      contract: contract ? { id: contract._id, number: contract.contractNumber, status: contract.status, lineItems: contract.lineItemsSnapshot } : null,
      menu: event.menuSnapshot ?? null, services: event.servicesSnapshot ?? null,
      rules: matchingRules.map((rule: any) => ({ id: rule._id, name: rule.name, quantityPerGuest: rule.quantityPerGuest, fixedQuantity: rule.fixedQuantity, wastePercentage: rule.wastePercentage })),
    },
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
    plannedQuantity: item.quantity, unit: item.unit, dueAt: event.eventDate, sourceType: item.sourceType, sourceId: item.sourceId,
    isManual: false, order: index, createdBy: request.user!.id, updatedBy: request.user!.id,
  })));
  await writeAuditLog(request, 'PRODUCTION_PLAN_GENERATE', 'ProductionPlan', plan._id.toString(), { eventId, itemCount: suggested.length, ruleCount: matchingRules.length });
  return { plan: await productionPlanDetail(request, plan._id.toString()), created: true };
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

export async function refreshPlanStatus(planId: string) {
  const items: any[] = await ProductionItem.find({ productionPlanId: planId, deletedAt: null, status: { $ne: 'cancelled' } }).select('status').lean();
  let status = 'pending';
  if (items.some((item) => item.status === 'blocked')) status = 'blocked';
  else if (items.length && items.every((item) => item.status === 'checked')) status = 'checked';
  else if (items.length && items.every((item) => ['ready', 'checked'].includes(item.status))) status = 'ready';
  else if (items.some((item) => item.status !== 'pending')) status = 'in_progress';
  const update: Record<string, unknown> = { status };
  if (status === 'in_progress') update.startedAt = new Date();
  if (status === 'checked') update.completedAt = new Date();
  await ProductionPlan.updateOne({ _id: planId }, update);
  return status;
}

export async function consolidatedProduction(request: Request, from: Date, to: Date, salonMatch: Record<string, unknown>) {
  const plans: any[] = await ProductionPlan.find({ deletedAt: null, isCurrent: true, ...salonMatch, eventDate: { $gte: from, $lt: to }, status: { $nin: ['cancelled'] } }).select('_id').lean();
  const planIds = plans.map((plan) => plan._id);
  const rows: any[] = await ProductionItem.aggregate([
    { $match: { deletedAt: null, productionPlanId: { $in: planIds }, status: { $ne: 'cancelled' } } },
    { $group: { _id: { productId: '$productId', name: '$normalizedProductName', unit: '$unit' }, productName: { $first: '$productNameSnapshot' }, plannedQuantity: { $sum: '$plannedQuantity' }, completedQuantity: { $sum: '$completedQuantity' }, events: { $addToSet: '$productionPlanId' }, pendingItems: { $sum: { $cond: [{ $in: ['$status', ['pending', 'in_progress', 'blocked']] }, 1, 0] } } } },
    { $sort: { productName: 1 } },
  ]);
  const productIds = rows.map((row) => row._id.productId).filter(Boolean);
  const inventory: any[] = await InventoryItem.aggregate([
    { $match: { deletedAt: null, active: true, catalogItemId: { $in: productIds }, ...salonMatch } },
    { $group: { _id: '$catalogItemId', available: { $sum: { $max: [0, { $subtract: ['$currentQuantity', '$reservedQuantity'] }] } } } },
  ]);
  const inventoryMap = new Map(inventory.map((item) => [item._id.toString(), item.available]));
  return rows.map((row) => {
    const available = row._id.productId ? Number(inventoryMap.get(row._id.productId.toString()) ?? 0) : 0;
    return { productId: row._id.productId, productName: row.productName, unit: row._id.unit, plannedQuantity: row.plannedQuantity, completedQuantity: row.completedQuantity, eventCount: row.events.length, pendingItems: row.pendingItems, availableQuantity: available, missingQuantity: Math.max(0, row.plannedQuantity - available), toBuyQuantity: Math.max(0, row.plannedQuantity - available), toProduceQuantity: Math.max(0, row.plannedQuantity - row.completedQuantity) };
  });
}
