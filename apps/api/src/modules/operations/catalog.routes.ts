import { Router, type Request } from 'express';
import { z } from 'zod';
import { BeverageType, CatalogItemType, InventoryCategory, Permission, ServiceExtraType } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { CatalogItem, ServiceExtra } from './operations.models';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const optionalText = z.string().trim().optional().or(z.literal(''));
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const catalogBody = z.object({
  name: z.string().trim().min(2),
  description: optionalText,
  type: z.nativeEnum(CatalogItemType),
  category: z.nativeEnum(InventoryCategory).default(InventoryCategory.OTHER),
  beverageType: z.nativeEnum(BeverageType).optional(),
  unitOfMeasure: z.string().trim().min(1),
  unitSize: z.coerce.number().min(0).optional(),
  unitCost: z.coerce.number().min(0).default(0),
  suggestedSalePrice: z.coerce.number().min(0).default(0),
  markupPercentage: z.coerce.number().min(0).optional(),
  supplierId: objectId.optional().or(z.literal('')),
  active: z.boolean().optional(),
  notes: optionalText,
});
const serviceBody = z.object({
  name: z.string().trim().min(2),
  description: optionalText,
  type: z.nativeEnum(ServiceExtraType).default(ServiceExtraType.FIXED_PRICE),
  basePrice: z.coerce.number().min(0).default(0),
  cost: z.coerce.number().min(0).default(0),
  pricePerPerson: z.coerce.number().min(0).optional(),
  pricePerHour: z.coerce.number().min(0).optional(),
  pricePerUnit: z.coerce.number().min(0).optional(),
  applicableSalonIds: z.array(objectId).optional(),
  supplierId: objectId.optional().or(z.literal('')),
  active: z.boolean().optional(),
  notes: optionalText,
});
function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function itemQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  const search = queryValue(request.query.search); if (search) terms.push({ $or: ['name', 'description', 'notes'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  const type = queryValue(request.query.type); if (type && Object.values(CatalogItemType).includes(type as CatalogItemType)) terms.push({ type });
  const category = queryValue(request.query.category); if (category && Object.values(InventoryCategory).includes(category as InventoryCategory)) terms.push({ category });
  const supplierId = queryValue(request.query.supplierId); if (supplierId && objectId.safeParse(supplierId).success) terms.push({ supplierId });
  const active = queryValue(request.query.active); if (active === 'true') terms.push({ active: true }); if (active === 'false') terms.push({ active: false });
  return terms.length === 1 ? terms[0] : { $and: terms };
}
function serviceQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  const search = queryValue(request.query.search); if (search) terms.push({ $or: ['name', 'description', 'notes'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  const type = queryValue(request.query.type); if (type && Object.values(ServiceExtraType).includes(type as ServiceExtraType)) terms.push({ type });
  const supplierId = queryValue(request.query.supplierId); if (supplierId && objectId.safeParse(supplierId).success) terms.push({ supplierId });
  const active = queryValue(request.query.active); if (active === 'true') terms.push({ active: true }); if (active === 'false') terms.push({ active: false });
  return terms.length === 1 ? terms[0] : { $and: terms };
}
function cleanSupplier(body: Record<string, unknown>) { return { ...body, supplierId: body.supplierId || undefined }; }

router.use(requireAuth);
router.get('/items', requirePermission(Permission.CATALOG_READ), asyncHandler(async (request, response) => {
  const items = await CatalogItem.find(itemQuery(request)).populate('supplierId', 'name category phone email').sort({ name: 1 }).lean();
  return sendSuccess(response, { items, itemTypes: Object.values(CatalogItemType), categories: Object.values(InventoryCategory), beverageTypes: Object.values(BeverageType) });
}));
router.post('/items', requirePermission(Permission.CATALOG_CREATE), validateRequest(z.object({ body: catalogBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const item = await CatalogItem.create({ ...cleanSupplier(request.body), createdBy: request.user!.id, updatedBy: request.user!.id });
  return sendSuccess(response, { item }, 201);
}));
router.get('/items/:id', requirePermission(Permission.CATALOG_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const item = await CatalogItem.findOne({ _id: request.params.id, deletedAt: null }).populate('supplierId', 'name category phone email').lean();
  if (!item) throw new ApiError(404, 'CATALOG_ITEM_NOT_FOUND');
  return sendSuccess(response, { item });
}));
router.patch('/items/:id', requirePermission(Permission.CATALOG_UPDATE), validateRequest(z.object({ body: catalogBody.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const item = await CatalogItem.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...cleanSupplier(request.body), updatedBy: request.user!.id }, { new: true, runValidators: true });
  if (!item) throw new ApiError(404, 'CATALOG_ITEM_NOT_FOUND');
  return sendSuccess(response, { item });
}));
router.delete('/items/:id', requirePermission(Permission.CATALOG_DELETE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const item = await CatalogItem.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id, active: false }, { new: true });
  if (!item) throw new ApiError(404, 'CATALOG_ITEM_NOT_FOUND');
  return sendSuccess(response, { deleted: true });
}));

router.get('/services', requirePermission(Permission.CATALOG_READ), asyncHandler(async (request, response) => {
  const services = await ServiceExtra.find(serviceQuery(request)).populate('supplierId', 'name category phone email').populate('applicableSalonIds', 'name').sort({ name: 1 }).lean();
  return sendSuccess(response, { items: services, services, serviceTypes: Object.values(ServiceExtraType) });
}));
router.post('/services', requirePermission(Permission.CATALOG_CREATE), validateRequest(z.object({ body: serviceBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const service = await ServiceExtra.create({ ...cleanSupplier(request.body), createdBy: request.user!.id, updatedBy: request.user!.id });
  return sendSuccess(response, { service }, 201);
}));
router.get('/services/:id', requirePermission(Permission.CATALOG_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const service = await ServiceExtra.findOne({ _id: request.params.id, deletedAt: null }).populate('supplierId', 'name category phone email').populate('applicableSalonIds', 'name').lean();
  if (!service) throw new ApiError(404, 'SERVICE_EXTRA_NOT_FOUND');
  return sendSuccess(response, { service });
}));
router.patch('/services/:id', requirePermission(Permission.CATALOG_UPDATE), validateRequest(z.object({ body: serviceBody.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const service = await ServiceExtra.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...cleanSupplier(request.body), updatedBy: request.user!.id }, { new: true, runValidators: true });
  if (!service) throw new ApiError(404, 'SERVICE_EXTRA_NOT_FOUND');
  return sendSuccess(response, { service });
}));
router.delete('/services/:id', requirePermission(Permission.CATALOG_DELETE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const service = await ServiceExtra.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id, active: false }, { new: true });
  if (!service) throw new ApiError(404, 'SERVICE_EXTRA_NOT_FOUND');
  return sendSuccess(response, { deleted: true });
}));

export default router;
