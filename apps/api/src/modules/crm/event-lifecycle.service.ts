import mongoose, { type ClientSession } from 'mongoose';
import { ApiError } from '../../middlewares/errorHandler';
import { WorkSession } from '../attendance/attendance.models';
import { EventClosure } from '../event-closure/event-closure.model';
import { DigitalInvitation } from '../invitations/invitation.models';
import { Expense, InventoryAdjustment } from '../operations/operations.models';
import { PayrollRun } from '../payroll/payroll.models';
import { ProductionPlan } from '../production/production.models';
import { CalendarItem, Contract, Event, EventStaffAssignment, Payment } from './crm.models';
import { EventTablewareAllocation } from './eventTablewareAllocation.model';

export const terminalEventStatuses = ['cancelled', 'lost'] as const;
export const activeEventStatuses = ['draft', 'quoted', 'contract_draft', 'deposit_pending', 'reserved', 'confirmed'] as const;

type Blocker = { code: string; label: string; count: number };
type LifecyclePreview = {
  canProceed: boolean;
  blockers: Blocker[];
  impacts: Record<string, number>;
};

const count = (model: any, query: Record<string, unknown>, session?: ClientSession) => model.countDocuments(query).session(session ?? null);

function presentBlockers(entries: Array<[string, string, number]>): Blocker[] {
  return entries.filter(([, , value]) => value > 0).map(([code, label, value]) => ({ code, label, count: value }));
}

export async function deletionPreview(event: any, session?: ClientSession): Promise<LifecyclePreview> {
  const eventId = event._id;
  const [contracts, payments, expenses, staff, production, closure, invitation, sessions, payroll, adjustments, tableware, unsafeCalendar, automaticCalendar] = await Promise.all([
    count(Contract, { eventId, deletedAt: null }, session),
    count(Payment, { eventId, deletedAt: null }, session),
    count(Expense, { eventId, deletedAt: null }, session),
    count(EventStaffAssignment, { eventId, deletedAt: null }, session),
    count(ProductionPlan, { eventId, deletedAt: null }, session),
    count(EventClosure, { eventId, deletedAt: null }, session),
    count(DigitalInvitation, { linkedEventId: eventId, deletedAt: null }, session),
    count(WorkSession, { eventId }, session),
    count(PayrollRun, { eventId }, session),
    count(InventoryAdjustment, { eventId }, session),
    count(EventTablewareAllocation, { eventId }, session),
    count(CalendarItem, { eventId, deletedAt: null, $or: [{ source: { $ne: 'event' } }, { 'notification.status': 'sent' }, { status: 'done' }] }, session),
    count(CalendarItem, { eventId, deletedAt: null, source: 'event', 'notification.status': { $ne: 'sent' }, status: { $ne: 'done' } }, session),
  ]);

  const sourceLinks = [event.quoteId, event.leadId, event.sourceQuoteId, event.sourceLeadId, event.createdFromQuoteId].filter(Boolean).length;
  const guestAccess = event.guestListAccessToken ? 1 : 0;
  const statusBlocker = event.status === 'draft' ? 0 : 1;
  const blockers = presentBlockers([
    ['EVENT_NOT_DRAFT', 'El evento ya salió de borrador.', statusBlocker],
    ['EVENT_HAS_SOURCE', 'Proviene de un lead o presupuesto y debe conservar su trazabilidad.', sourceLinks],
    ['EVENT_HAS_CONTRACTS', 'Tiene contratos asociados.', contracts],
    ['EVENT_HAS_PAYMENTS', 'Tiene pagos asociados.', payments],
    ['EVENT_HAS_EXPENSES', 'Tiene gastos asociados.', expenses],
    ['EVENT_HAS_STAFF', 'Tiene personal asignado.', staff],
    ['EVENT_HAS_PRODUCTION', 'Tiene un plan de producción.', production],
    ['EVENT_HAS_CLOSURE', 'Tiene un cierre operativo o administrativo.', closure],
    ['EVENT_HAS_INVITATION', 'Tiene una invitación digital asociada.', invitation],
    ['EVENT_HAS_ATTENDANCE', 'Tiene sesiones de asistencia asociadas.', sessions],
    ['EVENT_HAS_PAYROLL', 'Tiene liquidaciones de nómina asociadas.', payroll],
    ['EVENT_HAS_INVENTORY_HISTORY', 'Tiene movimientos de inventario asociados.', adjustments],
    ['EVENT_HAS_TABLEWARE', 'Tiene reservas de vajilla asociadas.', tableware],
    ['EVENT_HAS_GUEST_ACCESS', 'Ya se generó un acceso público a la lista de invitados.', guestAccess],
    ['EVENT_HAS_MANUAL_CALENDAR', 'Tiene tareas manuales o recordatorios ya ejecutados.', unsafeCalendar],
  ]);
  return { canProceed: blockers.length === 0, blockers, impacts: { automaticCalendarItemsRemoved: automaticCalendar } };
}

export async function cancellationPreview(event: any, session?: ClientSession): Promise<LifecyclePreview> {
  const eventId = event._id;
  const [checkedInStaff, activeSessions, administrativeClosure, staff, calendar, tableware, production, invitation, pendingExpenses, paidExpenses, contracts, payments] = await Promise.all([
    count(EventStaffAssignment, { eventId, deletedAt: null, status: 'checked_in' }, session),
    count(WorkSession, { eventId, status: 'active' }, session),
    count(EventClosure, { eventId, deletedAt: null, 'administrative.status': 'closed' }, session),
    count(EventStaffAssignment, { eventId, deletedAt: null, status: { $in: ['proposed', 'assigned', 'confirmed'] } }, session),
    count(CalendarItem, { eventId, deletedAt: null, status: { $in: ['pending', 'scheduled'] } }, session),
    count(EventTablewareAllocation, { eventId, releasedAt: null }, session),
    count(ProductionPlan, { eventId, isCurrent: true, deletedAt: null, status: { $ne: 'closed' } }, session),
    count(DigitalInvitation, { linkedEventId: eventId, deletedAt: null, status: { $in: ['draft', 'published', 'unpublished'] } }, session),
    count(Expense, { eventId, deletedAt: null, status: 'pending' }, session),
    count(Expense, { eventId, deletedAt: null, status: 'paid' }, session),
    count(Contract, { eventId, deletedAt: null }, session),
    count(Payment, { eventId, deletedAt: null }, session),
  ]);
  const alreadyTerminal = terminalEventStatuses.includes(event.status) ? 1 : 0;
  const blockers = presentBlockers([
    ['EVENT_ALREADY_TERMINAL', 'El evento ya está cancelado o marcado como perdido.', alreadyTerminal],
    ['EVENT_STAFF_CHECKED_IN', 'Hay personal con ingreso registrado; cerrá la asistencia antes de cancelar.', checkedInStaff],
    ['EVENT_ACTIVE_WORK_SESSION', 'Hay sesiones de trabajo activas; cerralas antes de cancelar.', activeSessions],
    ['EVENT_ADMINISTRATIVELY_CLOSED', 'El cierre administrativo está finalizado; debe reabrirse antes de cancelar.', administrativeClosure],
  ]);
  return {
    canProceed: blockers.length === 0,
    blockers,
    impacts: { staffCancelled: staff, calendarItemsCancelled: calendar, tablewareReleased: tableware, productionPlansCancelled: production, invitationsCancelled: invitation, pendingExpensesCancelled: pendingExpenses, paidExpensesPreserved: paidExpenses, contractsPreserved: contracts, paymentsPreserved: payments },
  };
}

function cancelledResourcePlan(plan: any): any {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return plan;
  const supplierAssignments = Array.isArray(plan.supplierAssignments)
    ? plan.supplierAssignments.map((item: any) => ['pending', 'confirmed'].includes(item?.status) ? { ...item, status: 'cancelled' } : item)
    : plan.supplierAssignments;
  const inventoryItems = Array.isArray(plan.inventoryItems)
    ? plan.inventoryItems.map((item: any) => String(item?.category ?? '').toLocaleLowerCase().includes('vajilla') ? { ...item, status: 'cancelled', quantityReserved: 0 } : item)
    : plan.inventoryItems;
  return { ...plan, supplierAssignments, inventoryItems };
}

export async function cancelEvent(input: { eventId: string; userId: string; status: 'cancelled' | 'lost'; reason: string }) {
  const dbSession = await mongoose.startSession();
  try {
    return await dbSession.withTransaction(async () => {
      const event: any = await Event.findOne({ _id: input.eventId, deletedAt: null }).session(dbSession);
      if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');
      const preview = await cancellationPreview(event, dbSession);
      if (!preview.canProceed) throw new ApiError(409, 'EVENT_CANCELLATION_BLOCKED', 'No se puede cancelar el evento hasta resolver los bloqueos indicados.', { preview });

      const now = new Date();
      event.status = input.status;
      event.cancellationReason = input.reason;
      event.cancelledAt = now;
      event.cancelledBy = input.userId;
      event.updatedBy = input.userId;
      event.guestListAccessTokenRevokedAt = event.guestListAccessToken ? now : undefined;
      event.guestListAccessTokenRevokedBy = event.guestListAccessToken ? input.userId : undefined;
      event.resourcePlanSnapshot = cancelledResourcePlan(event.resourcePlanSnapshot);
      event.lifecycleHistory = [...(Array.isArray(event.lifecycleHistory) ? event.lifecycleHistory : []), { action: input.status, at: now, by: input.userId, reason: input.reason }];
      await event.save({ session: dbSession });

      await Promise.all([
        EventStaffAssignment.updateMany({ eventId: event._id, deletedAt: null, status: { $in: ['proposed', 'assigned', 'confirmed'] } }, { $set: { status: 'cancelled', updatedBy: input.userId } }, { session: dbSession }),
        CalendarItem.updateMany({ eventId: event._id, deletedAt: null, status: { $in: ['pending', 'scheduled'] } }, { $set: { status: 'cancelled', updatedBy: input.userId } }, { session: dbSession }),
        CalendarItem.updateMany({ eventId: event._id, deletedAt: null, 'notification.status': { $in: ['pending', 'scheduled', 'processing', 'failed'] } }, { $set: { 'notification.status': 'cancelled', 'notification.lockedAt': null, 'notification.lockExpiresAt': null, updatedBy: input.userId } }, { session: dbSession }),
        // The legacy unique index is eventId+salonStockItemId. Unset the stock
        // reference when releasing so a reactivated event can reserve the same
        // article again while the historical name/quantity remains auditable.
        EventTablewareAllocation.updateMany({ eventId: event._id, releasedAt: null }, { $set: { releasedAt: now, releasedBy: input.userId, releaseReason: input.reason, updatedBy: input.userId }, $unset: { salonStockItemId: '' } }, { session: dbSession }),
        ProductionPlan.updateMany({ eventId: event._id, isCurrent: true, deletedAt: null, status: { $ne: 'closed' } }, { $set: { status: 'cancelled', updatedBy: input.userId } }, { session: dbSession }),
        Expense.updateMany({ eventId: event._id, deletedAt: null, status: 'pending' }, { $set: { status: 'cancelled', cancelledAt: now, cancellationReason: `Evento ${input.status}: ${input.reason}`, updatedBy: input.userId } }, { session: dbSession }),
      ]);

      const invitation: any = await DigitalInvitation.findOne({ linkedEventId: event._id, deletedAt: null, status: { $in: ['draft', 'published', 'unpublished'] } }).session(dbSession);
      if (invitation) {
        invitation.statusBeforeEventCancellation = invitation.status;
        invitation.status = 'cancelled';
        invitation.eventCancelledAt = now;
        invitation.updatedBy = input.userId;
        await invitation.save({ session: dbSession });
      }
      return { event, preview };
    });
  } finally {
    await dbSession.endSession();
  }
}

export async function reactivateEvent(input: { eventId: string; userId: string; status: typeof activeEventStatuses[number]; reason: string }) {
  const dbSession = await mongoose.startSession();
  try {
    return await dbSession.withTransaction(async () => {
      const event: any = await Event.findOne({ _id: input.eventId, deletedAt: null }).session(dbSession);
      if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');
      if (!terminalEventStatuses.includes(event.status)) throw new ApiError(409, 'EVENT_NOT_TERMINAL', 'El evento no está cancelado ni perdido.');
      const now = new Date();
      event.lifecycleHistory = [...(Array.isArray(event.lifecycleHistory) ? event.lifecycleHistory : []), { action: 'reactivated', fromStatus: event.status, toStatus: input.status, at: now, by: input.userId, reason: input.reason }];
      event.status = input.status;
      event.cancellationReason = undefined;
      event.cancelledAt = undefined;
      event.cancelledBy = undefined;
      event.guestListAccessTokenRevokedAt = undefined;
      event.guestListAccessTokenRevokedBy = undefined;
      event.updatedBy = input.userId;
      await event.save({ session: dbSession });

      const invitation: any = await DigitalInvitation.findOne({ linkedEventId: event._id, deletedAt: null, eventCancelledAt: { $ne: null } }).session(dbSession);
      if (invitation) {
        invitation.status = invitation.statusBeforeEventCancellation === 'published' ? 'unpublished' : invitation.statusBeforeEventCancellation ?? 'draft';
        invitation.statusBeforeEventCancellation = undefined;
        invitation.eventCancelledAt = undefined;
        invitation.unpublishedAt = now;
        invitation.updatedBy = input.userId;
        await invitation.save({ session: dbSession });
      }
      return {
        event,
        warnings: [
          'Las asignaciones de personal, la vajilla, el calendario y la producción no se restauraron automáticamente; revisalos antes de confirmar el evento.',
          invitation ? 'La invitación quedó sin publicar para que puedas revisarla antes de volver a compartirla.' : undefined,
        ].filter(Boolean),
      };
    });
  } finally {
    await dbSession.endSession();
  }
}

export async function deleteDraftEvent(input: { eventId: string; userId: string }) {
  const dbSession = await mongoose.startSession();
  try {
    return await dbSession.withTransaction(async () => {
      const event: any = await Event.findOne({ _id: input.eventId, deletedAt: null }).session(dbSession);
      if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');
      const preview = await deletionPreview(event, dbSession);
      if (!preview.canProceed) throw new ApiError(409, 'EVENT_DELETION_BLOCKED', 'Este borrador tiene información asociada y debe conservarse o cancelarse.', { preview });
      const now = new Date();
      event.deletedAt = now;
      event.deletedBy = input.userId;
      event.updatedBy = input.userId;
      event.lifecycleHistory = [...(Array.isArray(event.lifecycleHistory) ? event.lifecycleHistory : []), { action: 'deleted', at: now, by: input.userId }];
      await event.save({ session: dbSession });
      await CalendarItem.updateMany({ eventId: event._id, deletedAt: null, source: 'event', 'notification.status': { $ne: 'sent' }, status: { $ne: 'done' } }, { $set: { deletedAt: now, deletedBy: input.userId, updatedBy: input.userId, status: 'cancelled', 'notification.status': 'cancelled' } }, { session: dbSession });
      return { eventId: event._id.toString(), preview };
    });
  } finally {
    await dbSession.endSession();
  }
}
