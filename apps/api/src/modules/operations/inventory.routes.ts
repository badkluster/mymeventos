import { Router, type Request } from 'express';
import { z } from 'zod';
import { InventoryAdjustmentType, InventoryCategory, InventoryItemType, Permission } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { InventoryAdjustment, InventoryItem } from './operations.models';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const optionalText = z.string().trim().optional().or(z.literal(''));
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const inventoryBody = z.object({
  name: z.string().trim().min(2),
  description: optionalText,
  type: z.nativeEnum(InventoryItemType),
  category: z.nativeEnum(InventoryCategory),
  catalogItemId: objectId.optional().or(z.literal('')),
  salonId: objectId.optional().or(z.literal('')),
  unitOfMeasure: z.string().trim().min(1),
  currentQuantity: z.coerce.number().min(0).default(0),
  minimumQuantity: z.coerce.number().min(0).default(0),
  reservedQuantity: z.coerce.number().min(0).optional(),
  damagedQuantity: z.coerce.number().min(0).optional(),
  lostQuantity: z.coerce.number().min(0).optional(),
  replacementCost: z.coerce.number().min(0).optional(),
  rentalPrice: z.coerce.number().min(0).optional(),
  active: z.boolean().optional(),
  notes: optionalText,
});
const adjustmentSchema = z.object({
  body: z.object({
    type: z.nativeEnum(InventoryAdjustmentType),
    quantity: z.coerce.number().positive(),
    reason: optionalText,
    eventId: objectId.optional().or(z.literal('')),
    supplierId: objectId.optional().or(z.literal('')),
    notes: optionalText,
  }),
  params: z.object({ id: objectId }),
  query: z.object({}),
});
function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  const search = queryValue(request.query.search); if (search) terms.push({ $or: ['name', 'description', 'notes'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  const type = queryValue(request.query.type); if (type && Object.values(InventoryItemType).includes(type as InventoryItemType)) terms.push({ type });
  const category = queryValue(request.query.category); if (category && Object.values(InventoryCategory).includes(category as InventoryCategory)) terms.push({ category });
  const salonId = queryValue(request.query.salonId); if (salonId && objectId.safeParse(salonId).success) terms.push({ salonId });
  const active = queryValue(request.query.active); if (active === 'true') terms.push({ active: true }); if (active === 'false') terms.push({ active: false });
  return terms.length === 1 ? terms[0] : { $and: terms };
}
function cleanRefs(body: Record<string, unknown>) { return { ...body, catalogItemId: body.catalogItemId || undefined, salonId: body.salonId || undefined }; }
function adjustmentDelta(type: InventoryAdjustmentType, quantity: number): { current?: number; damaged?: number; lost?: number } {
  if ([InventoryAdjustmentType.IN, InventoryAdjustmentType.RETURN].includes(type)) return { current: quantity };
  if (type === InventoryAdjustmentType.OUT) return { current: -quantity };
  if (type === InventoryAdjustmentType.DAMAGE) return { current: -quantity, damaged: quantity };
  if (type === InventoryAdjustmentType.LOSS) return { current: -quantity, lost: quantity };
  return {};
}

router.use(requireAuth);
router.get('/', requirePermission(Permission.INVENTORY_READ), asyncHandler(async (request, response) => {
  const items = await InventoryItem.find(buildQuery(request)).populate('catalogItemId', 'name type unitOfMeasure').populate('salonId', 'name').sort({ name: 1 }).lean();
  return sendSuccess(response, { items, itemTypes: Object.values(InventoryItemType), categories: Object.values(InventoryCategory) });
}));
router.get('/summary', requirePermission(Permission.INVENTORY_READ), asyncHandler(async (_request, response) => {
  const items = await InventoryItem.find({ deletedAt: null, active: true }).lean();
  const lowStock = items.filter((item: any) => Number(item.currentQuantity ?? 0) <= Number(item.minimumQuantity ?? 0));
  return sendSuccess(response, { totalItems: items.length, lowStockCount: lowStock.length, lowStock });
}));
router.post('/', requirePermission(Permission.INVENTORY_UPDATE), validateRequest(z.object({ body: inventoryBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const item = await InventoryItem.create({ ...cleanRefs(request.body), createdBy: request.user!.id, updatedBy: request.user!.id });
  return sendSuccess(response, { item }, 201);
}));
router.get('/:id', requirePermission(Permission.INVENTORY_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const item = await InventoryItem.findOne({ _id: request.params.id, deletedAt: null }).populate('catalogItemId', 'name type unitOfMeasure').populate('salonId', 'name').lean();
  if (!item) throw new ApiError(404, 'INVENTORY_ITEM_NOT_FOUND');
  return sendSuccess(response, { item });
}));
router.patch('/:id', requirePermission(Permission.INVENTORY_UPDATE), validateRequest(z.object({ body: inventoryBody.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const item = await InventoryItem.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...cleanRefs(request.body), updatedBy: request.user!.id }, { new: true, runValidators: true });
  if (!item) throw new ApiError(404, 'INVENTORY_ITEM_NOT_FOUND');
  return sendSuccess(response, { item });
}));
router.post('/:id/adjust', requirePermission(Permission.INVENTORY_UPDATE), validateRequest(adjustmentSchema), asyncHandler(async (request, response) => {
  const item: any = await InventoryItem.findOne({ _id: request.params.id, deletedAt: null });
  if (!item) throw new ApiError(404, 'INVENTORY_ITEM_NOT_FOUND');
  const quantity = Number(request.body.quantity);
  const delta = adjustmentDelta(request.body.type, quantity);
  if (request.body.type === InventoryAdjustmentType.ADJUSTMENT) item.currentQuantity = quantity;
  else {
    const nextQuantity = Number(item.currentQuantity ?? 0) + Number(delta.current ?? 0);
    if (nextQuantity < 0) throw new ApiError(422, 'INVENTORY_NEGATIVE_QUANTITY');
    item.currentQuantity = nextQuantity;
    if (delta.damaged) item.damagedQuantity = Number(item.damagedQuantity ?? 0) + delta.damaged;
    if (delta.lost) item.lostQuantity = Number(item.lostQuantity ?? 0) + delta.lost;
  }
  item.updatedBy = request.user!.id;
  await item.save();
  const adjustment = await InventoryAdjustment.create({ ...request.body, eventId: request.body.eventId || undefined, supplierId: request.body.supplierId || undefined, inventoryItemId: item._id, createdBy: request.user!.id });
  return sendSuccess(response, { item, adjustment }, 201);
}));
router.get('/:id/movements', requirePermission(Permission.INVENTORY_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const items = await InventoryAdjustment.find({ inventoryItemId: request.params.id }).populate('supplierId', 'name').populate('eventId', 'eventName eventType eventDate').sort({ createdAt: -1 }).lean();
  return sendSuccess(response, { items });
}));
router.delete('/:id', requirePermission(Permission.INVENTORY_UPDATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const item = await InventoryItem.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id, active: false }, { new: true });
  if (!item) throw new ApiError(404, 'INVENTORY_ITEM_NOT_FOUND');
  return sendSuccess(response, { deleted: true });
}));

export default router;
