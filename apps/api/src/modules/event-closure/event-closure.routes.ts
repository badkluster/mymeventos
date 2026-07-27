import { Router, type Request } from 'express';
import { z } from 'zod';
import { Permission } from '@mym/shared';
import { requireAuth, requirePermission, canAccessSalon } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { sendSuccess } from '../../utils/api';
import { ApiError } from '../../middlewares/errorHandler';
import { writeAuditLog } from '../audit/audit.service';
import { Contract, Event, EventStaffAssignment, Payment } from '../crm/crm.models';
import { Expense } from '../operations/operations.models';
import { ProductionItem, ProductionPlan } from '../production/production.models';
import { EventClosure } from './event-closure.model';

const router = Router();
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const stage = z.enum(['operational', 'financial', 'administrative']);
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ eventId: objectId }), query: z.object({}) });
const closeSchema = z.object({ body: z.object({ notes: z.string().trim().max(3000).optional().or(z.literal('')) }), params: z.object({ eventId: objectId, stage }), query: z.object({}) });
const reopenSchema = z.object({ body: z.object({ reason: z.string().trim().min(3).max(1000) }), params: z.object({ eventId: objectId, stage }), query: z.object({}) });

type ClosureStage = 'operational' | 'financial' | 'administrative';
type Check = { id: string; label: string; ok: boolean; severity: 'blocker' | 'warning'; detail?: string; href?: string };

async function eventForRequest(request: Request, eventId: string) {
  const event: any = await Event.findOne({ _id: eventId, deletedAt: null }).populate('salonId', 'name').populate('customerId', 'fullName').lean();
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');
  const salonId = event.salonId?._id?.toString?.() ?? event.salonId?.toString?.();
  if (!salonId || !canAccessSalon(request.user!, salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  return { event, salonId };
}

async function closureForEvent(eventId: string, salonId: string, userId: string) {
  return EventClosure.findOneAndUpdate(
    { eventId, deletedAt: null },
    { $setOnInsert: { eventId, salonId, createdBy: userId }, $set: { updatedBy: userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function closureChecks(event: any, closure: any) {
  const eventId = event._id;
  const now = new Date();
  const currentPlanIds = await ProductionPlan.find({ eventId, isCurrent: true, deletedAt: null }).distinct('_id');
  const results = await Promise.all([
    ProductionPlan.findOne({ eventId, isCurrent: true, deletedAt: null }).select('_id status').lean(),
    ProductionItem.countDocuments({ productionPlanId: { $in: currentPlanIds }, deletedAt: null, status: 'blocked' }),
    EventStaffAssignment.countDocuments({ eventId, deletedAt: null, status: { $nin: ['completed', 'cancelled', 'no_show'] } }),
    Contract.findOne({ eventId, deletedAt: null, status: { $nin: ['cancelled', 'superseded'] } }).sort({ versionNumber: -1, createdAt: -1 }).select('_id contractNumber status totalAmount paidAmount balanceAmount').lean(),
    Payment.countDocuments({ eventId, deletedAt: null, affectsContractBalance: true, status: 'pending' }),
    Expense.countDocuments({ eventId, deletedAt: null, status: 'pending' }),
    Expense.countDocuments({ eventId, deletedAt: null, status: { $ne: 'cancelled' } }),
  ]);
  const plan: any = results[0];
  const productionBlocked = Number(results[1]);
  const staffOpen = Number(results[2]);
  const contract: any = results[3];
  const pendingPayments = Number(results[4]);
  const pendingExpenses = Number(results[5]);
  const expenseCount = Number(results[6]);
  const eventOccurred = Boolean(event.eventDate && new Date(event.eventDate).getTime() <= now.getTime());
  const operational: Check[] = [
    { id: 'event-date', label: 'El evento ya ocurrió', ok: eventOccurred, severity: 'blocker', detail: event.eventDate ? undefined : 'El evento no tiene fecha definida.', href: `/admin/events/${eventId}` },
    { id: 'production-plan', label: 'Producción generada', ok: Boolean(plan), severity: 'blocker', detail: plan ? undefined : 'Generá la producción antes de cerrar.', href: '/admin/production?generate=1' },
    { id: 'production-closed', label: 'Producción chequeada y cerrada', ok: plan?.status === 'closed', severity: 'blocker', detail: plan ? `Estado actual: ${plan.status}.` : undefined, href: plan?._id ? `/admin/production/${plan._id}` : '/admin/production' },
    { id: 'production-blockers', label: 'Sin ítems de producción bloqueados', ok: productionBlocked === 0, severity: 'blocker', detail: productionBlocked ? `${productionBlocked} ítem(s) bloqueado(s).` : undefined, href: plan?._id ? `/admin/production/${plan._id}` : '/admin/production' },
    { id: 'staff-complete', label: 'Asignaciones de personal finalizadas', ok: staffOpen === 0, severity: 'blocker', detail: staffOpen ? `${staffOpen} asignación(es) siguen abiertas.` : undefined, href: `/admin/events/${eventId}?tab=staff` },
  ];
  const balance = Number(contract?.balanceAmount ?? Math.max(0, Number(contract?.totalAmount ?? 0) - Number(contract?.paidAmount ?? 0)));
  const financial: Check[] = [
    { id: 'operational-closed', label: 'Cierre operativo realizado', ok: closure.operational?.status === 'closed', severity: 'blocker' },
    { id: 'contract-active', label: 'Contrato activo disponible', ok: Boolean(contract), severity: 'blocker', detail: contract ? undefined : 'No hay contrato activo para conciliar.', href: `/admin/events/${eventId}?tab=contrato` },
    { id: 'contract-approved', label: 'Contrato aprobado', ok: contract?.status === 'approved', severity: 'blocker', detail: contract ? `Estado actual: ${contract.status}.` : undefined, href: contract?._id ? `/admin/contracts/${contract._id}` : `/admin/events/${eventId}?tab=contrato` },
    { id: 'balance-zero', label: 'Saldo contractual resuelto', ok: Boolean(contract) && balance <= 0.01, severity: 'blocker', detail: balance > 0 ? `Saldo pendiente: ${balance}.` : undefined, href: `/admin/events/${eventId}?tab=pagos` },
    { id: 'payments-resolved', label: 'Sin pagos pendientes', ok: pendingPayments === 0, severity: 'blocker', detail: pendingPayments ? `${pendingPayments} pago(s) pendiente(s).` : undefined, href: `/admin/events/${eventId}?tab=pagos` },
    { id: 'expenses-resolved', label: 'Sin gastos pendientes', ok: pendingExpenses === 0, severity: 'blocker', detail: pendingExpenses ? `${pendingExpenses} gasto(s) pendiente(s).` : undefined, href: `/admin/expenses?eventId=${eventId}` },
    { id: 'expenses-loaded', label: 'Costos del evento cargados', ok: expenseCount > 0, severity: 'warning', detail: expenseCount ? undefined : 'No hay gastos asociados; la rentabilidad quedará incompleta.', href: `/admin/expenses?eventId=${eventId}` },
  ];
  const administrative: Check[] = [
    { id: 'operational-closed', label: 'Cierre operativo realizado', ok: closure.operational?.status === 'closed', severity: 'blocker' },
    { id: 'financial-closed', label: 'Cierre financiero realizado', ok: closure.financial?.status === 'closed', severity: 'blocker' },
    { id: 'customer-associated', label: 'Cliente asociado', ok: Boolean(event.customerId), severity: 'blocker', href: `/admin/events/${eventId}?tab=cliente` },
    { id: 'contract-associated', label: 'Contrato asociado', ok: Boolean(contract), severity: 'blocker', href: `/admin/events/${eventId}?tab=contrato` },
  ];
  return { operational, financial, administrative, context: { plan, contract, balance, pendingPayments, pendingExpenses, expenseCount } };
}

function blockers(checks: Check[]) {
  return checks.filter((item) => item.severity === 'blocker' && !item.ok);
}

async function responsePayload(request: Request, eventId: string) {
  const { event, salonId } = await eventForRequest(request, eventId);
  const closure: any = await closureForEvent(eventId, salonId, request.user!.id);
  const checks = await closureChecks(event, closure);
  return { event, closure, checks };
}

router.use(requireAuth);
router.get('/:eventId', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  return sendSuccess(response, await responsePayload(request, request.params.eventId));
}));

router.post('/:eventId/:stage/close', validateRequest(closeSchema), asyncHandler(async (request, response, next) => {
  const requiredPermission = request.params.stage === 'financial' ? Permission.PAYMENTS_UPDATE : Permission.EVENTS_UPDATE;
  return requirePermission(requiredPermission)(request, response, next);
}), asyncHandler(async (request, response) => {
  const payload = await responsePayload(request, request.params.eventId);
  const stageName = request.params.stage as ClosureStage;
  const stageChecks = payload.checks[stageName];
  const blocked = blockers(stageChecks);
  if (blocked.length) throw new ApiError(409, 'EVENT_CLOSURE_BLOCKED', `No se puede cerrar: ${blocked.map((item) => item.label).join(', ')}.`, { blockers: blocked });
  if (payload.closure[stageName]?.status === 'closed') return sendSuccess(response, payload, 200, 'La etapa ya estaba cerrada.');
  payload.closure.set(stageName, {
    ...(payload.closure[stageName]?.toObject?.() ?? payload.closure[stageName] ?? {}),
    status: 'closed', closedAt: new Date(), closedBy: request.user!.id, notes: request.body.notes || undefined, checklistSnapshot: stageChecks,
  });
  payload.closure.updatedBy = request.user!.id;
  await payload.closure.save();
  await writeAuditLog(request, `EVENT_${stageName.toUpperCase()}_CLOSE`, 'EventClosure', payload.closure._id.toString(), { eventId: request.params.eventId, checks: stageChecks });
  return sendSuccess(response, await responsePayload(request, request.params.eventId), 200, 'Etapa cerrada correctamente.');
}));

router.post('/:eventId/:stage/reopen', validateRequest(reopenSchema), asyncHandler(async (request, response, next) => {
  const requiredPermission = request.params.stage === 'financial' ? Permission.PAYMENTS_UPDATE : Permission.EVENTS_UPDATE;
  return requirePermission(requiredPermission)(request, response, next);
}), asyncHandler(async (request, response) => {
  const { event, salonId } = await eventForRequest(request, request.params.eventId);
  const closure: any = await closureForEvent(request.params.eventId, salonId, request.user!.id);
  const stageName = request.params.stage as ClosureStage;
  if (closure[stageName]?.status !== 'closed') throw new ApiError(409, 'EVENT_CLOSURE_STAGE_NOT_CLOSED', 'La etapa seleccionada no está cerrada.');
  const stagesToOpen: ClosureStage[] = stageName === 'operational' ? ['operational', 'financial', 'administrative'] : stageName === 'financial' ? ['financial', 'administrative'] : ['administrative'];
  const now = new Date();
  for (const item of stagesToOpen) {
    if (closure[item]?.status !== 'closed' && item !== stageName) continue;
    closure.set(item, {
      ...(closure[item]?.toObject?.() ?? closure[item] ?? {}),
      status: 'open', reopenedAt: now, reopenedBy: request.user!.id, reopenReason: request.body.reason,
      closedAt: undefined, closedBy: undefined,
    });
  }
  closure.updatedBy = request.user!.id;
  await closure.save();
  await writeAuditLog(request, `EVENT_${stageName.toUpperCase()}_REOPEN`, 'EventClosure', closure._id.toString(), { eventId: event._id, reason: request.body.reason, stagesReopened: stagesToOpen });
  return sendSuccess(response, await responsePayload(request, request.params.eventId), 200, 'Etapa reabierta correctamente.');
}));

export default router;
