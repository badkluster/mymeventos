import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission, SupplierCategory } from '@mym/shared';
import { requireAuth, requirePermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { Supplier } from './operations.models';
import { writeAuditLog } from '../audit/audit.service';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const optionalText = z.string().trim().optional().or(z.literal(''));
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const supplierBody = z.object({
  name: z.string().trim().min(2),
  businessName: optionalText,
  taxId: optionalText,
  phone: optionalText,
  whatsapp: optionalText,
  email: z.string().trim().email().optional().or(z.literal('')),
  address: optionalText,
  category: z.nativeEnum(SupplierCategory).default(SupplierCategory.OTHER),
  contactPerson: optionalText,
  notes: optionalText,
  active: z.boolean().optional(),
});
const createSchema = z.object({ body: supplierBody, params: z.object({}), query: z.object({}) });
const updateSchema = z.object({ body: supplierBody.partial().refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'), params: z.object({ id: objectId }), query: z.object({}) });
function queryValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  const search = queryValue(request.query.search);
  if (search) terms.push({ $or: ['name', 'businessName', 'taxId', 'phone', 'email', 'contactPerson'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) });
  const category = queryValue(request.query.category);
  if (category && Object.values(SupplierCategory).includes(category as SupplierCategory)) terms.push({ category });
  const active = queryValue(request.query.active);
  if (active === 'true') terms.push({ active: true });
  if (active === 'false') terms.push({ active: false });
  return terms.length === 1 ? terms[0] : { $and: terms };
}

router.use(requireAuth);
router.get('/', requirePermission(Permission.SUPPLIERS_READ), asyncHandler(async (request, response) => {
  const items = await Supplier.find(buildQuery(request)).sort({ name: 1 }).lean();
  return sendSuccess(response, { items, suppliers: items, categories: Object.values(SupplierCategory) });
}));
router.post('/', requirePermission(Permission.SUPPLIERS_CREATE), validateRequest(createSchema), asyncHandler(async (request, response) => {
  const supplier = await Supplier.create({ ...request.body, createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'SUPPLIER_CREATE', 'Supplier', supplier._id.toString());
  return sendSuccess(response, { supplier }, 201);
}));
router.get('/:id', requirePermission(Permission.SUPPLIERS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const supplier = await Supplier.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!supplier) throw new ApiError(404, 'SUPPLIER_NOT_FOUND');
  return sendSuccess(response, { supplier });
}));
router.patch('/:id', requirePermission(Permission.SUPPLIERS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const supplier = await Supplier.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...request.body, updatedBy: request.user!.id }, { new: true, runValidators: true });
  if (!supplier) throw new ApiError(404, 'SUPPLIER_NOT_FOUND');
  await writeAuditLog(request, 'SUPPLIER_UPDATE', 'Supplier', supplier._id.toString());
  return sendSuccess(response, { supplier });
}));
router.delete('/:id', requirePermission(Permission.SUPPLIERS_DELETE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const supplier = await Supplier.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id, active: false }, { new: true });
  if (!supplier) throw new ApiError(404, 'SUPPLIER_NOT_FOUND');
  await writeAuditLog(request, 'SUPPLIER_DELETE', 'Supplier', supplier._id.toString());
  return sendSuccess(response, { deleted: true });
}));

export default router;
