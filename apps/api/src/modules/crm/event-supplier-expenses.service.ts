import mongoose from 'mongoose';
import { ExpenseSourceType, ExpenseStatus, SupplierCategory } from '@mym/shared';
import { ApiError } from '../../middlewares/errorHandler';
import { Event } from './crm.models';
import { Expense, Supplier } from '../operations/operations.models';

export type EventSupplierAssignmentInput = {
  id: string;
  supplierId: string;
  serviceType?: string;
  arrivalTime?: string;
  agreedAmount?: number;
  status?: 'pending' | 'confirmed' | 'paid' | 'cancelled';
  notes?: string;
};

type NormalizedAssignment = EventSupplierAssignmentInput & {
  supplierName: string;
  contactName?: string;
  phone?: string;
  category: SupplierCategory;
  expenseId?: string;
  expenseStatus?: ExpenseStatus;
};

export type EventExpenseSummary = {
  totalPaid: number;
  totalCancelled: number;
  activeExpenseCount: number;
  cancelledExpenseCount: number;
};

export function summarizeEventExpenses(expenses: readonly unknown[]): EventExpenseSummary {
  return expenses.reduce<EventExpenseSummary>((summary, expense) => {
    const item = expense as { amount?: number; status?: string };
    const amount = Number(item.amount || 0);
    if (item.status === ExpenseStatus.PAID) {
      summary.totalPaid += amount;
      summary.activeExpenseCount += 1;
    } else if (item.status === ExpenseStatus.CANCELLED) {
      summary.totalCancelled += amount;
      summary.cancelledExpenseCount += 1;
    }
    return summary;
  }, { totalPaid: 0, totalCancelled: 0, activeExpenseCount: 0, cancelledExpenseCount: 0 });
}

export async function eventExpenses(eventId: string): Promise<{ items: any[]; summary: EventExpenseSummary }> {
  const items = await Expense.find({ eventId, deletedAt: null })
    .populate('supplierId', 'name businessName category contactPerson phone whatsapp email')
    .sort({ paidAt: -1, createdAt: -1 })
    .lean();
  return { items, summary: summarizeEventExpenses(items) };
}

export async function syncEventSupplierExpenses(input: {
  eventId: string;
  assignments: EventSupplierAssignmentInput[];
  userId: string;
}): Promise<{ event: any; assignments: NormalizedAssignment[]; expenses: any[]; summary: EventExpenseSummary }> {
  const session = await mongoose.startSession();
  let savedEvent: any;
  let normalizedAssignments: NormalizedAssignment[] = [];

  try {
    await session.withTransaction(async () => {
      const event: any = await Event.findOne({ _id: input.eventId, deletedAt: null }).session(session);
      if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND');
      if (!event.salonId) throw new ApiError(422, 'EVENT_SALON_REQUIRED');

      const supplierIds = [...new Set(input.assignments.map((item) => item.supplierId))];
      const previousSupplierByAssignmentId = new Map<string, string>((event.resourcePlanSnapshot?.supplierAssignments ?? [])
        .filter((item: any) => item?.id && item?.supplierId)
        .map((item: any) => [String(item.id), item.supplierId.toString()]));
      const suppliers: any[] = supplierIds.length
        ? await Supplier.find({ _id: { $in: supplierIds } }).session(session)
        : [];
      if (suppliers.length !== supplierIds.length) throw new ApiError(422, 'EVENT_SUPPLIER_NOT_AVAILABLE');
      const suppliersById = new Map(suppliers.map((supplier) => [supplier._id.toString(), supplier]));
      const existingExpenses: any[] = await Expense.find({
        eventId: event._id,
        sourceType: ExpenseSourceType.SUPPLIER_ASSIGNMENT,
        deletedAt: null,
      }).session(session);
      const existingBySourceId = new Map(existingExpenses.map((expense) => [expense.sourceId, expense]));
      const retainedSourceIds = new Set<string>();

      normalizedAssignments = [];
      for (const assignment of input.assignments) {
        const supplier: any = suppliersById.get(assignment.supplierId);
        if (!supplier) throw new ApiError(422, 'EVENT_SUPPLIER_NOT_AVAILABLE');
        if ((!supplier.active || supplier.deletedAt) && previousSupplierByAssignmentId.get(assignment.id) !== assignment.supplierId) throw new ApiError(422, 'EVENT_SUPPLIER_NOT_AVAILABLE');
        const status = assignment.status ?? 'pending';
        const agreedAmount = Number(assignment.agreedAmount || 0);
        if (!Number.isFinite(agreedAmount) || agreedAmount < 0) throw new ApiError(422, 'EVENT_SUPPLIER_AMOUNT_INVALID');
        if (['confirmed', 'paid'].includes(status) && agreedAmount <= 0) throw new ApiError(422, 'EVENT_SUPPLIER_CONFIRMED_AMOUNT_REQUIRED');
        const normalized: NormalizedAssignment = {
          ...assignment,
          status,
          agreedAmount,
          supplierName: supplier.name,
          contactName: supplier.contactPerson,
          phone: supplier.phone || supplier.whatsapp,
          category: supplier.category ?? SupplierCategory.OTHER,
        };
        retainedSourceIds.add(assignment.id);

        if (['confirmed', 'paid'].includes(status) && agreedAmount > 0) {
          const previousExpense: any = existingBySourceId.get(assignment.id);
          const expense: any = await Expense.findOneAndUpdate(
            {
              eventId: event._id,
              sourceType: ExpenseSourceType.SUPPLIER_ASSIGNMENT,
              sourceId: assignment.id,
              deletedAt: null,
            },
            {
              $set: {
                salonId: event.salonId,
                supplierId: supplier._id,
                category: supplier.category ?? SupplierCategory.OTHER,
                description: assignment.serviceType?.trim() || `Servicio de ${supplier.name}`,
                amount: agreedAmount,
                currency: 'ARS',
                status: ExpenseStatus.PAID,
                paidAt: previousExpense?.paidAt ?? new Date(),
                notes: assignment.notes,
                updatedBy: input.userId,
              },
              $unset: { cancelledAt: 1, cancellationReason: 1 },
              $setOnInsert: {
                sourceType: ExpenseSourceType.SUPPLIER_ASSIGNMENT,
                sourceId: assignment.id,
                eventId: event._id,
                createdBy: input.userId,
              },
            },
            { new: true, upsert: true, runValidators: true, session, setDefaultsOnInsert: true },
          );
          normalized.expenseId = expense._id.toString();
          normalized.expenseStatus = expense.status;
        } else {
          const existing: any = existingBySourceId.get(assignment.id);
          if (existing && existing.status !== ExpenseStatus.CANCELLED) {
            existing.status = ExpenseStatus.CANCELLED;
            existing.cancelledAt = new Date();
            existing.cancellationReason = status === 'cancelled' ? 'Asignación de proveedor cancelada.' : 'Asignación pendiente o sin monto confirmado.';
            existing.updatedBy = input.userId;
            await existing.save({ session });
          }
          if (existing) {
            normalized.expenseId = existing._id.toString();
            normalized.expenseStatus = ExpenseStatus.CANCELLED;
          }
        }
        normalizedAssignments.push(normalized);
      }

      for (const existing of existingExpenses) {
        if (!retainedSourceIds.has(existing.sourceId) && existing.status !== ExpenseStatus.CANCELLED) {
          existing.status = ExpenseStatus.CANCELLED;
          existing.cancelledAt = new Date();
          existing.cancellationReason = 'Asignación de proveedor eliminada del evento.';
          existing.updatedBy = input.userId;
          await existing.save({ session });
        }
      }

      event.resourcePlanSnapshot = {
        ...(event.resourcePlanSnapshot ?? {}),
        supplierAssignments: normalizedAssignments,
      };
      event.markModified('resourcePlanSnapshot');
      event.updatedBy = input.userId;
      await event.save({ session });
      savedEvent = event;
    });
  } finally {
    await session.endSession();
  }

  const result = await eventExpenses(input.eventId);
  return { event: savedEvent, assignments: normalizedAssignments, expenses: result.items, summary: result.summary };
}
