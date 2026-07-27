import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { ExpenseSourceType, ExpenseStatus, Permission } from '@mym/shared';
import { requireAuth, requirePermission, canAccessSalon } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { Contract, Event, Payment } from '../crm/crm.models';
import { Expense, ExpenseAllocation, ExpenseCategory } from '../operations/operations.models';
import { parseReportPeriod, resolveReportScope } from '../reporting/report-filter';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const optionalId = objectId.optional().or(z.literal(''));
const expenseBody = z.object({
  date: z.coerce.date(), description: z.string().trim().min(2), supplierId: optionalId, categoryId: optionalId,
  salonId: objectId, eventId: optionalId, productionPlanId: optionalId,
  initialEstimatedAmount: z.coerce.number().min(0).default(0), finalAmount: z.coerce.number().min(0).default(0),
  additionalAmount: z.coerce.number().min(0).default(0), taxAmount: z.coerce.number().min(0).default(0),
  amount: z.coerce.number().min(0).optional(), status: z.nativeEnum(ExpenseStatus).default(ExpenseStatus.PENDING),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'mercado_pago', 'card', 'other']).optional().or(z.literal('')),
  paidAt: z.coerce.date().optional(), receiptFileId: z.string().trim().optional().or(z.literal('')), receiptUrl: z.string().trim().url().optional().or(z.literal('')),
  notes: z.string().trim().optional().or(z.literal('')),
});
const categoryBody = z.object({
  name: z.string().trim().min(2), code: z.string().trim().min(2).regex(/^[A-Za-z0-9_-]+$/), parentId: optionalId,
  type: z.enum(['DIRECT', 'INDIRECT', 'STAFF', 'SERVICE', 'OTHER']).default('DIRECT'), isActive: z.boolean().default(true),
});
const defaults = [
  ['Panadería', 'BAKERY', 'DIRECT'], ['Fiambres', 'DELI', 'DIRECT'], ['Bebidas', 'BEVERAGES', 'DIRECT'], ['Verdulería', 'GREENGROCER', 'DIRECT'],
  ['Carnicería', 'MEAT', 'DIRECT'], ['Limpieza', 'CLEANING', 'INDIRECT'], ['Staff', 'STAFF', 'STAFF'], ['Mantelería', 'LINEN', 'SERVICE'],
  ['DJ', 'DJ', 'SERVICE'], ['Proyector', 'PROJECTOR', 'SERVICE'], ['Ambientación', 'DECORATION', 'SERVICE'], ['Viajes', 'TRAVEL', 'INDIRECT'],
  ['Helados', 'ICE_CREAM', 'DIRECT'], ['Insumos', 'SUPPLIES', 'DIRECT'], ['Oficina', 'OFFICE', 'INDIRECT'], ['Impresiones', 'PRINTING', 'INDIRECT'],
  ['Servicios', 'SERVICES', 'SERVICE'], ['Gastos varios', 'MISCELLANEOUS', 'OTHER'],
] as const;

async function ensureDefaultCategories() {
  await Promise.all(defaults.map(([name, code, type]) => ExpenseCategory.updateOne(
    { code }, { $setOnInsert: { name, code, type, isActive: true } }, { upsert: true },
  )));
}

async function assertCategory(categoryId?: string) {
  if (!categoryId) return;
  const exists = await ExpenseCategory.exists({ _id: categoryId, deletedAt: null, isActive: true });
  if (!exists) throw new ApiError(422, 'EXPENSE_CATEGORY_INVALID', 'La categoría seleccionada no existe o está inactiva.');
}

function expensePayload(body: any, userId: string) {
  const computed = Number(body.finalAmount || body.amount || 0) + Number(body.additionalAmount || 0) + Number(body.taxAmount || 0);
  return {
    ...body, supplierId: body.supplierId || undefined, categoryId: body.categoryId || undefined, eventId: body.eventId || undefined,
    productionPlanId: body.productionPlanId || undefined, paymentMethod: body.paymentMethod || undefined,
    sourceType: ExpenseSourceType.MANUAL, sourceId: randomUUID(), category: 'OTHER', amount: computed,
    paidAt: body.status === ExpenseStatus.PAID ? body.paidAt || body.date : undefined, updatedBy: userId,
  };
}

router.use(requireAuth);

router.get('/categories', requirePermission(Permission.EXPENSES_VIEW), asyncHandler(async (_request, response) => {
  await ensureDefaultCategories();
  const items = await ExpenseCategory.find({ deletedAt: null }).populate('parentId', 'name').sort({ name: 1 }).lean();
  return sendSuccess(response, { items });
}));
router.post('/categories', requirePermission(Permission.EXPENSE_CATEGORIES_MANAGE), validateRequest(z.object({ body: categoryBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  const category = await ExpenseCategory.create({ ...request.body, code: request.body.code.toUpperCase(), parentId: request.body.parentId || undefined, createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'EXPENSE_CATEGORY_CREATE', 'ExpenseCategory', category._id.toString(), request.body);
  return sendSuccess(response, { category }, 201);
}));
router.patch('/categories/:id', requirePermission(Permission.EXPENSE_CATEGORIES_MANAGE), validateRequest(z.object({ body: categoryBody.partial().refine((body) => Object.keys(body).length > 0), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const category = await ExpenseCategory.findOneAndUpdate({ _id: request.params.id, deletedAt: null }, { ...request.body, code: request.body.code?.toUpperCase(), parentId: request.body.parentId || undefined, updatedBy: request.user!.id }, { new: true, runValidators: true });
  if (!category) throw new ApiError(404, 'EXPENSE_CATEGORY_NOT_FOUND');
  await writeAuditLog(request, 'EXPENSE_CATEGORY_UPDATE', 'ExpenseCategory', category._id.toString(), request.body);
  return sendSuccess(response, { category });
}));

router.get('/', requirePermission(Permission.EXPENSES_VIEW), asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(request.query.limit) || 25));
  const query: any = { deletedAt: null, ...scope.match(), date: { $gte: period.from, $lt: period.toExclusive } };
  if (request.query.status) query.status = String(request.query.status);
  if (request.query.categoryId) query.categoryId = String(request.query.categoryId);
  if (request.query.supplierId) query.supplierId = String(request.query.supplierId);
  if (request.query.eventId) query.eventId = String(request.query.eventId);
  if (request.query.assigned === 'true') query.eventId = { $exists: true, $ne: null };
  if (request.query.assigned === 'false') query.$or = [{ eventId: { $exists: false } }, { eventId: null }];
  const search = String(request.query.search || '').trim();
  if (search) query.description = { $regex: search, $options: 'i' };
  const [items, totalItems, totals] = await Promise.all([
    Expense.find(query).populate('salonId', 'name').populate('eventId', 'eventName eventType eventDate').populate('supplierId', 'name businessName').populate('categoryId', 'name code').sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Expense.countDocuments(query),
    Expense.aggregate([{ $match: query }, { $group: { _id: null, total: { $sum: '$amount' }, initial: { $sum: '$initialEstimatedAmount' }, final: { $sum: '$finalAmount' }, additional: { $sum: '$additionalAmount' }, tax: { $sum: '$taxAmount' }, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } }, pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } } } }]),
  ]);
  return sendSuccess(response, { items, summary: totals[0] ?? { total: 0, initial: 0, final: 0, additional: 0, tax: 0, paid: 0, pending: 0 }, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } });
}));

router.post('/', requirePermission(Permission.EXPENSES_CREATE), validateRequest(z.object({ body: expenseBody, params: z.object({}), query: z.object({}) })), asyncHandler(async (request, response) => {
  if (!canAccessSalon(request.user!, request.body.salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  await assertCategory(request.body.categoryId);
  if (request.body.eventId) {
    const event = await Event.findOne({ _id: request.body.eventId, salonId: request.body.salonId, deletedAt: null }).lean();
    if (!event) throw new ApiError(409, 'EXPENSE_EVENT_SALON_MISMATCH', 'El evento no pertenece al salón seleccionado.');
  }
  const expense = await Expense.create({ ...expensePayload(request.body, request.user!.id), createdBy: request.user!.id });
  if (expense.eventId) await ExpenseAllocation.create({ expenseId: expense._id, eventId: expense.eventId, salonId: expense.salonId, amount: expense.amount, percentage: 100, allocationType: 'DIRECT', createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'EXPENSE_CREATE', 'Expense', expense._id.toString(), { amount: expense.amount, salonId: expense.salonId, eventId: expense.eventId, categoryId: expense.categoryId });
  return sendSuccess(response, { expense }, 201);
}));

router.patch('/:id', requirePermission(Permission.EXPENSES_UPDATE), validateRequest(z.object({ body: expenseBody.partial().refine((body) => Object.keys(body).length > 0), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const before: any = await Expense.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!before) throw new ApiError(404, 'EXPENSE_NOT_FOUND');
  if (!canAccessSalon(request.user!, String(request.body.salonId || before.salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  if (request.body.categoryId !== undefined) await assertCategory(request.body.categoryId || undefined);
  const merged = { ...before, ...request.body };
  const amount = Number(merged.finalAmount || merged.amount || 0) + Number(merged.additionalAmount || 0) + Number(merged.taxAmount || 0);
  const update = { ...request.body, supplierId: request.body.supplierId || undefined, categoryId: request.body.categoryId || undefined, eventId: request.body.eventId || undefined, productionPlanId: request.body.productionPlanId || undefined, amount, paidAt: merged.status === ExpenseStatus.PAID ? merged.paidAt || merged.date : undefined, updatedBy: request.user!.id };
  const expense: any = await Expense.findByIdAndUpdate(before._id, update, { new: true, runValidators: true });
  await ExpenseAllocation.deleteMany({ expenseId: expense._id });
  if (expense.eventId) await ExpenseAllocation.create({ expenseId: expense._id, eventId: expense.eventId, salonId: expense.salonId, amount: expense.amount, percentage: 100, allocationType: 'DIRECT', createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'EXPENSE_UPDATE', 'Expense', expense._id.toString(), { before: { amount: before.amount, status: before.status, eventId: before.eventId, categoryId: before.categoryId }, after: update });
  return sendSuccess(response, { expense });
}));

router.delete('/:id', requirePermission(Permission.EXPENSES_DELETE), validateRequest(z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) })), asyncHandler(async (request, response) => {
  const expense: any = await Expense.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!expense) throw new ApiError(404, 'EXPENSE_NOT_FOUND');
  if (!canAccessSalon(request.user!, String(expense.salonId))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  await Expense.updateOne({ _id: expense._id }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id });
  await ExpenseAllocation.updateMany({ expenseId: expense._id, deletedAt: null }, { deletedAt: new Date(), deletedBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'EXPENSE_DELETE', 'Expense', expense._id.toString(), { amount: expense.amount });
  return sendSuccess(response, { deleted: true });
}));

router.get('/profitability/events', requirePermission(Permission.REPORTS_PROFITABILITY_READ), asyncHandler(async (request, response) => {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const now = new Date();
  const events: any[] = await Event.find({ deletedAt: null, ...scope.match(), eventDate: { $gte: period.from, $lt: period.toExclusive }, status: { $nin: ['cancelled', 'lost'] } }).populate('salonId', 'name').populate('customerId', 'fullName').sort({ eventDate: 1 }).lean();
  const eventIds = events.map((event) => event._id);
  const [contracts, payments, expenses] = await Promise.all([
    Contract.aggregate([{ $match: { deletedAt: null, eventId: { $in: eventIds }, status: { $nin: ['cancelled', 'superseded'] } } }, { $group: { _id: '$eventId', contracted: { $sum: '$totalAmount' } } }]),
    Payment.aggregate([{ $match: { deletedAt: null, eventId: { $in: eventIds }, status: 'paid', affectsContractBalance: true } }, { $group: { _id: '$eventId', collected: { $sum: { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] } } } }]),
    Expense.aggregate([{ $match: { deletedAt: null, eventId: { $in: eventIds }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$eventId', estimatedCost: { $sum: '$initialEstimatedAmount' }, actualCost: { $sum: '$amount' }, paidCost: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } }, expenseCount: { $sum: 1 }, pendingExpenseCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } } } }]),
  ]);
  const contractsMap = new Map(contracts.map((item: any) => [item._id.toString(), item]));
  const paymentsMap = new Map(payments.map((item: any) => [item._id.toString(), item]));
  const expensesMap = new Map(expenses.map((item: any) => [item._id.toString(), item]));
  const rows = events.map((event) => {
    const id = event._id.toString(); const income: any = contractsMap.get(id); const collected: any = paymentsMap.get(id); const cost: any = expensesMap.get(id);
    const contractedRevenue = Number(income?.contracted ?? 0); const collectedRevenue = Number(collected?.collected ?? 0);
    const estimatedCost = Number(cost?.estimatedCost ?? 0); const actualCost = Number(cost?.actualCost ?? 0); const paidCost = Number(cost?.paidCost ?? 0);
    const estimatedMargin = contractedRevenue - estimatedCost;
    const economicMargin = contractedRevenue - actualCost;
    const cashResult = collectedRevenue - paidCost;
    const expenseCount = Number(cost?.expenseCount ?? 0);
    const pendingExpenseCount = Number(cost?.pendingExpenseCount ?? 0);
    const eventFinished = Boolean(event.eventDate && new Date(event.eventDate) < now);
    const costStatus = !expenseCount ? 'no_expenses' : pendingExpenseCount ? 'pending' : eventFinished ? 'complete' : 'preliminary';
    return {
      id, href: `/admin/events/${id}`, eventName: event.eventName || event.eventType || 'Evento', eventDate: event.eventDate,
      customer: event.customerId?.fullName || 'Sin cliente', salon: event.salonId?.name || 'Sin salón', guests: Number(event.guestCount ?? 0),
      contractedRevenue, collectedRevenue, estimatedCost, actualCost, paidCost, estimatedMargin, economicMargin, actualMargin: economicMargin, cashResult,
      marginPercentage: contractedRevenue ? (economicMargin / contractedRevenue) * 100 : null,
      costPerGuest: event.guestCount ? actualCost / event.guestCount : null,
      revenuePerGuest: event.guestCount ? contractedRevenue / event.guestCount : null,
      costDeviation: actualCost - estimatedCost, expenseCount, pendingExpenseCount, costStatus, complete: costStatus === 'complete',
    };
  });
  return sendSuccess(response, {
    items: rows,
    summary: rows.reduce((result, row) => ({
      contractedRevenue: result.contractedRevenue + row.contractedRevenue,
      collectedRevenue: result.collectedRevenue + row.collectedRevenue,
      estimatedCost: result.estimatedCost + row.estimatedCost,
      actualCost: result.actualCost + row.actualCost,
      paidCost: result.paidCost + row.paidCost,
      estimatedMargin: result.estimatedMargin + row.estimatedMargin,
      economicMargin: result.economicMargin + row.economicMargin,
      actualMargin: result.actualMargin + row.economicMargin,
      cashResult: result.cashResult + row.cashResult,
      incompleteEvents: result.incompleteEvents + (row.complete ? 0 : 1),
    }), { contractedRevenue: 0, collectedRevenue: 0, estimatedCost: 0, actualCost: 0, paidCost: 0, estimatedMargin: 0, economicMargin: 0, actualMargin: 0, cashResult: 0, incompleteEvents: 0 }),
    period: { from: period.fromDate, to: period.toDate },
  });
}));

export default router;
