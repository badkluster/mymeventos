import { Router, type Request } from 'express';
import { randomBytes } from 'crypto';
import mongoose, { type ClientSession } from 'mongoose';
import { z } from 'zod';
import { Permission, Role, StaffSubrole } from '@mym/shared';
import { Contract, Customer, Event, EventStaffAssignment, LeadActivity, PackageTemplate, Payment, Quote, VenuePackageRule } from './crm.models';
import { User } from '../users/user.model';
import { Salon } from '../salons/salon.model';
import { SalonStockItem } from '../salons/salonStockItem.model';
import { EventTablewareAllocation } from './eventTablewareAllocation.model';
import { accessibleSalonIds, canAccessSalon, referenceId, requireAuth, requirePermission, userHasPermission } from '../../middlewares/auth';
import { validateRequest } from '../../middlewares/validateRequest';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../middlewares/errorHandler';
import { sendSuccess } from '../../utils/api';
import { getApiMessage } from '../../utils/messages';
import { writeAuditLog } from '../audit/audit.service';
import { findOrCreateCustomer } from './contact-dedupe.service';
import { buildInitialResourcePlan } from './event-resource-plan';
import { buildDefaultEventAlerts } from './event-alert-defaults';
import { createContractFromEvent } from './event-to-contract.service';
import { convertQuoteToEvent } from './quote-to-event.service';
import { applyPaymentToPlan, createPayment, paymentSummary } from './payments.service';
import { generateAndUploadPaymentReceiptPdf } from './payment-receipt-pdf.service';
import { sendEmail } from '../email/email.service';
import { uploadBuffer } from '../uploads/cloudinary.service';
import { generateOperationalPdf, generateOperationalWord, type OperationalDocumentType } from './event-operational-document.service';
import { eventExpenses, syncEventSupplierExpenses } from './event-supplier-expenses.service';
import { syncEventAlertCalendarItems } from './event-alert-calendar-sync.service';
import { addDaysToDateKey, argentinaDateKey, civilDateInput, daysBetweenDateKeys, dueDateKey } from '../../utils/argentina-date';
import { installmentDueDateKey, isOpenInstallment, planFor } from './financial-reminders.service';
import { activeEventStatuses, cancelEvent, cancellationPreview, deleteDraftEvent, deletionPreview, reactivateEvent, terminalEventStatuses } from './event-lifecycle.service';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const optionalObjectId = objectId.optional().or(z.literal(''));
const eventStatuses = ['draft', 'quoted', 'contract_draft', 'deposit_pending', 'reserved', 'confirmed', 'cancelled', 'lost'] as const;
const staffAssignmentStatuses = ['proposed', 'assigned', 'confirmed', 'checked_in', 'completed', 'cancelled', 'no_show'] as const;
type StaffAssignmentStatus = typeof staffAssignmentStatuses[number];
const staffStatusTransitions: Record<StaffAssignmentStatus, readonly StaffAssignmentStatus[]> = {
  proposed: ['assigned', 'cancelled'],
  assigned: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'completed', 'cancelled', 'no_show'],
  checked_in: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
};
const pricingModes = ['per_person', 'fixed'] as const;
const packageChangeSections = ['commercial', 'schedule', 'menu', 'services'] as const;
const idSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId }), query: z.object({}) });
const assignmentIdSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId, assignmentId: objectId }), query: z.object({}) });
const activityNoteSchema = z.object({ body: z.object({ description: z.string().trim().min(1) }), params: z.object({ id: objectId }), query: z.object({}) });
const menuSectionsSchema = z.array(z.object({ title: z.string().trim().min(1), items: z.array(z.string().trim().min(1)) }));
const civilDateSchema = z.preprocess(civilDateInput, z.coerce.date());
const eventTimeSchema = z.string().trim().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'El horario debe tener formato HH:mm y contener una hora válida.');
const newCustomerSchema = z.object({
  fullName: z.string().trim().optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  documentNumber: z.string().trim().optional(),
  address: z.string().trim().optional(),
  occupation: z.string().trim().optional(),
  notes: z.string().trim().optional()
});
const createEventSchema = z.object({
  body: z.object({
    quoteId: optionalObjectId,
    customerId: optionalObjectId,
    customer: newCustomerSchema.optional(),
    createContract: z.boolean().optional(),
    salonId: optionalObjectId,
    packageTemplateId: optionalObjectId,
    eventType: z.string().trim().optional(),
    eventName: z.string().trim().optional(),
    eventDate: civilDateSchema.optional(),
    startTime: eventTimeSchema.optional(),
    endTime: eventTimeSchema.optional(),
    guestCount: z.coerce.number().int().positive().optional(),
    honoreeName: z.string().trim().optional(),
    vegetarianCount: z.coerce.number().int().min(0).optional(),
    veganCount: z.coerce.number().int().min(0).optional(),
    celiacCount: z.coerce.number().int().min(0).optional(),
    lactoseIntolerantCount: z.coerce.number().int().min(0).optional(),
    tableLinenColor: z.string().trim().optional(),
    packageName: z.string().trim().optional(),
    pricingMode: z.enum(pricingModes).optional(),
    pricePerPerson: z.coerce.number().min(0).optional(),
    finalPricePerPerson: z.coerce.number().min(0).optional(),
    fixedPrice: z.coerce.number().min(0).optional(),
    finalFixedPrice: z.coerce.number().min(0).optional(),
    estimatedAmount: z.coerce.number().min(0).optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    depositAmount: z.coerce.number().min(0).optional(),
    paymentTerms: z.string().trim().optional(),
    promotionText: z.string().trim().optional(),
    giftText: z.string().trim().optional(),
    menuSnapshot: menuSectionsSchema.optional(),
    servicesSnapshot: z.array(z.string().trim().min(1)).optional(),
    resourcePlanSnapshot: z.unknown().optional(),
    notes: z.string().trim().optional()
  }).superRefine((body, context) => {
    if (!body.quoteId && !body.eventDate) context.addIssue({ code: z.ZodIssueCode.custom, path: ['eventDate'], message: 'Debe indicar la fecha del evento.' });
    if (body.quoteId) return;
    if (!body.salonId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['salonId'], message: 'Debe seleccionar un salón.' });
    if (!body.customerId && !body.customer?.fullName && !body.customer?.firstName) context.addIssue({ code: z.ZodIssueCode.custom, path: ['customer'], message: 'Debe seleccionar o crear un cliente.' });
    if (!body.eventName && !body.eventType) context.addIssue({ code: z.ZodIssueCode.custom, path: ['eventName'], message: 'Debe indicar nombre o tipo de evento.' });
    if (!body.eventType) context.addIssue({ code: z.ZodIssueCode.custom, path: ['eventType'], message: 'Debe indicar el tipo de evento.' });
    if (!body.packageTemplateId && !body.startTime) context.addIssue({ code: z.ZodIssueCode.custom, path: ['startTime'], message: 'Debe indicar el horario de inicio.' });
    if (!body.packageTemplateId && !body.endTime) context.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'Debe indicar el horario de fin.' });
    if (!body.guestCount) context.addIssue({ code: z.ZodIssueCode.custom, path: ['guestCount'], message: 'Debe indicar una cantidad de invitados válida.' });
    if (!body.packageName && !body.packageTemplateId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['packageName'], message: 'Debe indicar el paquete o propuesta.' });
    const amount = body.pricingMode === 'per_person' ? body.finalPricePerPerson ?? body.pricePerPerson : body.finalAmount ?? body.finalFixedPrice ?? body.fixedPrice;
    if (!body.packageTemplateId && (!amount || amount <= 0)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['finalAmount'], message: 'Debe indicar un precio mayor a cero.' });
    if (Boolean(body.startTime) !== Boolean(body.endTime)) context.addIssue({ code: z.ZodIssueCode.custom, path: [body.startTime ? 'endTime' : 'startTime'], message: 'Debe indicar el horario de inicio y de fin.' });
    if (body.startTime && body.endTime && body.startTime === body.endTime) context.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: 'El horario de fin debe ser distinto del inicio.' });
  }),
  params: z.object({}),
  query: z.object({})
});
const assignmentBaseBody = z.object({
  staffUserId: objectId,
  roleLabel: z.string().trim().optional(),
  staffSubrole: z.nativeEnum(StaffSubrole).optional(),
  shiftStart: z.coerce.date().optional(),
  shiftEnd: z.coerce.date().optional(),
  notes: z.string().trim().optional()
});
const assignmentBody = assignmentBaseBody.extend({ status: z.enum(['proposed', 'assigned'] as const).optional() }).refine((body) => body.roleLabel || body.staffSubrole, 'Debe indicar rol o subrol.').refine((body) => !body.shiftStart || !body.shiftEnd || body.shiftEnd > body.shiftStart, 'El fin del turno debe ser posterior al inicio.');
const createAssignmentSchema = z.object({ body: assignmentBody, params: z.object({ id: objectId }), query: z.object({}) });
const updateAssignmentSchema = z.object({ body: assignmentBaseBody.partial().extend({ status: z.enum(staffAssignmentStatuses).optional() }).refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.').refine((body) => !body.shiftStart || !body.shiftEnd || body.shiftEnd > body.shiftStart, 'El fin del turno debe ser posterior al inicio.').refine((body) => !body.status || Object.keys(body).length === 1, 'El estado debe actualizarse sin otros campos.'), params: z.object({ id: objectId, assignmentId: objectId }), query: z.object({}) });
const assignmentStatusSchema = z.object({ body: z.object({ status: z.enum(staffAssignmentStatuses) }), params: z.object({ id: objectId, assignmentId: objectId }), query: z.object({}) });
const statusSchema = z.object({ body: z.object({ status: z.enum(eventStatuses), reason: z.string().trim().optional() }), params: z.object({ id: objectId }), query: z.object({}) });
const reactivateSchema = z.object({ body: z.object({ status: z.enum(activeEventStatuses), reason: z.string().trim().min(3).max(500) }), params: z.object({ id: objectId }), query: z.object({}) });
const updateSchema = z.object({
  body: z.object({
    eventType: z.string().trim().optional(),
    eventName: z.string().trim().optional(),
    eventDate: civilDateSchema.optional(),
    startTime: eventTimeSchema.optional(),
    endTime: eventTimeSchema.optional(),
    guestCount: z.coerce.number().int().positive().optional(),
    honoreeName: z.string().trim().optional(), vegetarianCount: z.coerce.number().int().min(0).optional(), veganCount: z.coerce.number().int().min(0).optional(), celiacCount: z.coerce.number().int().min(0).optional(), lactoseIntolerantCount: z.coerce.number().int().min(0).optional(), tableLinenColor: z.string().trim().optional(),
    estimatedAmount: z.coerce.number().min(0).optional(),
    finalAmount: z.coerce.number().min(0).optional(),
    notes: z.string().trim().optional(),
    commercialSnapshot: z.unknown().optional(),
    menuSnapshot: z.unknown().optional(),
    servicesSnapshot: z.unknown().optional(),
    paymentSnapshot: z.unknown().optional(),
    paymentPlanSnapshot: z.unknown().optional(),
    resourcePlanSnapshot: z.unknown().optional(),
    contractReadyChecklist: z.unknown().optional()
  }).refine((body) => Object.keys(body).length > 0, 'Debe enviar al menos un campo.'),
  params: z.object({ id: objectId }),
  query: z.object({})
});
const packagePreviewSchema = z.object({
  body: z.object({ packageTemplateId: objectId }),
  params: z.object({ id: objectId }),
  query: z.object({})
});
const packageApplySchema = z.object({
  body: z.object({
    packageTemplateId: objectId,
    mode: z.enum(['associate_only', 'apply']).default('apply'),
    sections: z.array(z.enum(packageChangeSections)).min(1).optional(),
    reason: z.string().trim().max(500).optional(),
    expectedUpdatedAt: z.string().datetime().optional()
  }),
  params: z.object({ id: objectId }),
  query: z.object({})
});
const eventPaymentSchema = z.object({
  body: z.object({
    amount: z.coerce.number().positive(),
    method: z.enum(['cash', 'bank_transfer', 'mercado_pago', 'card', 'other']),
    type: z.enum(['deposit', 'installment', 'balance', 'extra', 'adjustment', 'other']).optional(),
    paidAt: z.coerce.date().optional(),
    reference: z.string().trim().optional(),
    notes: z.string().trim().optional(),
    planInstallmentId: z.string().trim().optional(),
    allowOverpayment: z.boolean().optional(),
    overrideReason: z.string().trim().optional()
  }),
  params: z.object({ id: objectId }),
  query: z.object({})
});
const eventSupplierAssignmentSchema = z.object({
  id: z.string().trim().min(1).max(120),
  supplierId: objectId,
  serviceType: z.string().trim().max(180).optional().or(z.literal('')),
  arrivalTime: z.string().trim().max(40).optional().or(z.literal('')),
  agreedAmount: z.coerce.number().min(0).optional(),
  status: z.enum(['pending', 'confirmed', 'paid', 'cancelled']).optional(),
  notes: z.string().trim().max(1500).optional().or(z.literal('')),
});
const eventSuppliersSchema = z.object({
  body: z.object({ items: z.array(eventSupplierAssignmentSchema).max(100) }).superRefine((body, context) => {
    const ids = new Set<string>();
    body.items.forEach((item, index) => {
      if (ids.has(item.id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'id'], message: 'Cada asignación de proveedor debe tener un identificador único.' });
      if (['confirmed', 'paid'].includes(item.status ?? 'pending') && !(Number(item.agreedAmount) > 0)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['items', index, 'agreedAmount'], message: 'Una asignación confirmada debe tener un monto acordado mayor a cero.' });
      ids.add(item.id);
    });
  }),
  params: z.object({ id: objectId }),
  query: z.object({}),
});
const paymentReceiptSchema = z.object({ body: z.object({ email: z.string().trim().email().optional() }).optional(), params: z.object({ id: objectId, paymentId: objectId }), query: z.object({}) });
const operationalDocumentType = z.enum(['timeline', 'logistics', 'guest_list', 'tableware', 'full']);
const operationalDocumentSchema = z.object({ body: z.object({ format: z.enum(['pdf', 'word']) }), params: z.object({ id: objectId, documentType: operationalDocumentType }), query: z.object({}) });
const operationalDocumentEmailSchema = z.object({ body: z.object({ format: z.enum(['pdf', 'word']).default('pdf'), email: z.string().trim().email().optional() }), params: z.object({ id: objectId, documentType: operationalDocumentType }), query: z.object({}) });
const operationalDocumentPreviewSchema = z.object({ body: z.unknown().optional(), params: z.object({ id: objectId, documentType: operationalDocumentType }), query: z.object({}) });
const guestListLinkSchema = z.object({ body: z.object({}).optional(), params: z.object({ id: objectId }), query: z.object({}) });
const tablewareItemSchema = z.object({ stockItemId: objectId, quantity: z.coerce.number().int().positive(), notes: z.string().trim().optional() });
const externalTablewareItemSchema = z.object({ id: z.string().trim().optional(), name: z.string().trim().min(1), category: z.string().trim().optional(), quantity: z.coerce.number().int().positive(), unit: z.string().trim().min(1).optional(), notes: z.string().trim().optional() });
const tablewareSchema = z.object({ body: z.object({ salonItems: z.array(tablewareItemSchema).default([]), externalItems: z.array(externalTablewareItemSchema).default([]) }), params: z.object({ id: objectId }), query: z.object({}) });

const router = Router();

function getQueryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanId(value?: string): string | undefined {
  return value && value.trim() ? value.trim() : undefined;
}

function pickDefined(source: Record<string, any>, keys: string[]): Record<string, any> {
  return Object.fromEntries(keys.filter((key) => source[key] !== undefined && source[key] !== '').map((key) => [key, source[key]]));
}

function uniqueIds(ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function eventDay(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  // Records normalized through civilDateInput are exact UTC midnight, so the UTC calendar
  // day matches; older records may still carry a real time-of-day that shifts the UTC day
  // away from the intended Argentina day, so those recover the civil day in that time zone.
  const iso = date.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : argentinaDateKey(date);
}

const lockedEventStatuses = new Set(['reserved', 'confirmed']);

/** Parses "HH:MM" into minutes since midnight, or undefined if missing/malformed. */
function timeToMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

/**
 * A missing/unparsable start or end time is treated as occupying the full day (0–1440):
 * we can't safely assume a partial slot when the actual boundaries are unknown, and the
 * safe default is to block rather than risk a silent double-booking.
 * An end time at or before the start time is interpreted as crossing midnight (common for
 * parties running e.g. 21:00–05:00), extending the slot past 1440.
 */
function timeSlot(day: string, startTime: unknown, endTime: unknown): { start: number; end: number } {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const dayStart = new Date(`${day}T00:00:00.000Z`).getTime() / 60_000;
  if (start === undefined || end === undefined) return { start: dayStart, end: dayStart + 1_440 };
  return { start: dayStart + start, end: dayStart + (end <= start ? end + 1_440 : end) };
}

function slotsOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Venue/date availability lock (time-slot based, not full-day): events already
 * `reserved`/`confirmed` from the previous, requested and following calendar day are considered —
 * draft/quoted events remain free to overlap (speculative quoting for the same date/salon
 * is allowed until one of them actually gets reserved). No setup/breakdown buffer is added
 * between events; this is a deliberate simplification, not an oversight.
 */
async function assertVenueAvailable(input: { salonId: string; day: string; startTime?: string; endTime?: string; excludeEventId?: string }): Promise<void> {
  const { salonId, day, startTime, endTime, excludeEventId } = input;
  const dayStart = new Date(`${addDaysToDateKey(day, -1)}T00:00:00.000Z`);
  const dayEnd = new Date(`${addDaysToDateKey(day, 1)}T23:59:59.999Z`);
  const query: Record<string, unknown> = { salonId, status: { $in: Array.from(lockedEventStatuses) }, eventDate: { $gte: dayStart, $lte: dayEnd }, deletedAt: null };
  if (excludeEventId) query._id = { $ne: excludeEventId };
  const candidates: any[] = await Event.find(query).select('eventDate startTime endTime eventName eventType').lean();
  if (!candidates.length) return;
  const requested = timeSlot(day, startTime, endTime);
  const conflict = candidates.find((candidate) => {
    const candidateDay = eventDay(candidate.eventDate);
    return !candidateDay || slotsOverlap(requested, timeSlot(candidateDay, candidate.startTime, candidate.endTime));
  });
  if (conflict) throw new ApiError(422, 'EVENT_VENUE_SLOT_CONFLICT', `El salón ya tiene "${conflict.eventName || conflict.eventType || 'otro evento'}" reservado en un horario superpuesto ese día. Elegí otro horario o coordiná con ese evento antes de confirmar el cambio.`);
}

function resourcePlanWithTableware(plan: any, allocations: any[]): Record<string, unknown> {
  const existingItems = Array.isArray(plan?.inventoryItems) ? plan.inventoryItems : [];
  const nonTableware = existingItems.filter((item: any) => !String(item?.category ?? '').toLocaleLowerCase().includes('vajilla'));
  const tableware = allocations.map((item) => ({
    id: item._id?.toString?.() ?? item.id,
    name: item.itemName,
    category: item.category ?? 'Vajilla',
    quantityRequired: item.quantity,
    quantityReserved: item.source === 'salon_stock' ? item.quantity : undefined,
    unit: item.unit ?? 'unidad',
    status: item.source === 'salon_stock' ? 'reserved' : 'planned',
    notes: item.notes ?? (item.source === 'external' ? 'Vajilla adicional / externa.' : '')
  }));
  return { ...(plan ?? {}), inventoryItems: [...nonTableware, ...tableware] };
}

async function tablewareAvailability(salonId: string, day: string, eventId?: string) {
  const [items, allocations] = await Promise.all([
    SalonStockItem.find({ salonId, deletedAt: null, active: true }).sort({ category: 1, displayOrder: 1, name: 1 }).lean(),
    EventTablewareAllocation.find({ salonId, eventDay: day, source: 'salon_stock', releasedAt: null }).lean()
  ]);
  const reservedByItem = new Map<string, number>();
  const reservedByOtherEvents = new Map<string, number>();
  for (const allocation of allocations) {
    if (!allocation.salonStockItemId) continue;
    const itemId = allocation.salonStockItemId.toString();
    reservedByItem.set(itemId, (reservedByItem.get(itemId) ?? 0) + allocation.quantity);
    if (allocation.eventId.toString() !== eventId) reservedByOtherEvents.set(itemId, (reservedByOtherEvents.get(itemId) ?? 0) + allocation.quantity);
  }
  return items.map((item: any) => {
    const id = item._id.toString();
    const reserved = reservedByItem.get(id) ?? 0;
    const reservedByOthers = reservedByOtherEvents.get(id) ?? 0;
    return { ...item, reservedQuantity: reserved, availableQuantity: Math.max(0, item.currentQuantity - reserved), maxAssignableQuantity: Math.max(0, item.currentQuantity - reservedByOthers) };
  });
}

async function ensureEventAccess(request: Request, event: any): Promise<void> {
  if (!event || event.deletedAt) throw new ApiError(404, 'EVENT_NOT_FOUND');
  const salonId = referenceId(event.salonId);
  if (salonId && !canAccessSalon(request.user!, salonId)) {
    // `managerUserId` is the authoritative relationship configured on the salon.
    // This fallback keeps an assigned manager operating if the denormalized user
    // arrays have not yet been synchronized, without granting global salon access.
    const canUseManagerRelationship = request.user!.roles.some((role) => [Role.MANAGER, Role.SALON_MANAGER].includes(role));
    const isAssignedManager = canUseManagerRelationship && await Salon.exists({ _id: salonId, managerUserId: request.user!.id, deletedAt: null });
    if (isAssignedManager) return;

    // IDs and aggregate counts are enough to correlate a permission report without
    // putting names, emails, tokens or customer data into production logs.
    console.warn(JSON.stringify({
      event: 'event_salon_scope_denied',
      requestMethod: request.method,
      requestPath: request.originalUrl,
      userId: request.user?.id,
      eventId: event._id?.toString?.(),
      salonId,
      roles: request.user?.roles ?? [],
      accessibleSalonCount: accessibleSalonIds(request.user!).length,
    }));
    throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  }
}

function ensureEventOperationallyEditable(event: any): void {
  if (terminalEventStatuses.includes(event.status)) {
    throw new ApiError(409, 'EVENT_TERMINAL_LOCKED', 'El evento está cancelado o perdido. Reactivalo antes de modificar información operativa o financiera.');
  }
}

async function transitionStaffAssignment(request: Request, event: any, assignmentId: string, nextStatus: StaffAssignmentStatus) {
  const assignment: any = await EventStaffAssignment.findOne({ _id: assignmentId, eventId: event._id, deletedAt: null });
  if (!assignment) throw new ApiError(404, 'STAFF_ASSIGNMENT_NOT_FOUND');
  if (String(assignment.salonId) !== String(event.salonId)) throw new ApiError(403, 'STAFF_ASSIGNMENT_SALON_SCOPE_FORBIDDEN');

  const currentStatus = assignment.status as StaffAssignmentStatus;
  if (!staffStatusTransitions[currentStatus]?.includes(nextStatus)) {
    throw new ApiError(422, 'STAFF_ASSIGNMENT_INVALID_TRANSITION', `No se puede pasar una asignación de ${currentStatus} a ${nextStatus}.`);
  }

  assignment.status = nextStatus;
  assignment.updatedBy = request.user!.id;
  await assignment.save();
  await writeAuditLog(request, `EVENT_STAFF_${nextStatus.toUpperCase()}`, 'EventStaffAssignment', assignmentId, { eventId: event._id, previousStatus: currentStatus, status: nextStatus });
  return assignment;
}

async function getEventForOperationalDocument(request: Request, eventId: string, type?: OperationalDocumentType): Promise<any> {
  const event: any = await Event.findOne({ _id: eventId, deletedAt: null }).populate('customerId', 'fullName phone email').populate('salonId', 'name address locality city');
  await ensureEventAccess(request, event);
  if (type === 'tableware' || type === 'full') {
    event.tablewareAllocations = await EventTablewareAllocation.find({ eventId: event._id, releasedAt: null }).sort({ source: 1, itemName: 1 }).lean();
  }
  if (type === 'full') {
    event.staffAssignments = await EventStaffAssignment.find({ eventId: event._id, deletedAt: null }).populate('staffUserId', 'firstName lastName fullName').sort({ shiftStart: 1, createdAt: 1 }).lean();
  }
  return event;
}

async function createOperationalDocument(event: any, type: OperationalDocumentType, format: 'pdf' | 'word') {
  const generated = format === 'pdf' ? await generateOperationalPdf(event, type) : generateOperationalWord(event, type);
  const uploaded = await uploadBuffer(generated.buffer, {
    folder: `mym-eventos/events/${event._id}/operational-documents`,
    resource_type: 'raw',
    public_id: `${type}-${format}`,
    overwrite: true,
    format: format === 'pdf' ? 'pdf' : 'doc'
  });
  return { ...generated, url: uploaded.url, secureUrl: uploaded.secureUrl, publicId: uploaded.publicId };
}

async function ensureSalonAccess(request: Request, salonId: string): Promise<void> {
  if (!canAccessSalon(request.user!, salonId)) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  const salon = await Salon.findOne({ _id: salonId, active: true, deletedAt: null }).lean();
  if (!salon) throw new ApiError(404, 'SALON_NOT_FOUND');
}

async function getAccessibleQuote(request: Request, quoteId: string): Promise<any> {
  const quote: any = await Quote.findOne({ _id: quoteId, deletedAt: null }).lean();
  if (!quote) throw new ApiError(404, 'QUOTE_NOT_FOUND');
  if (!canAccessSalon(request.user!, quote.salonId.toString())) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
  return quote;
}

async function resolveCustomerForEvent(request: Request, body: any, salonId: string, quote?: any): Promise<any> {
  const customerId = cleanId(body.customerId) ?? quote?.customerId?.toString?.();
  if (customerId) {
    const customer: any = await Customer.findOne({ _id: customerId, deletedAt: null });
    if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND');
    const salonIds = (customer.salonIds ?? []).map((id: { toString(): string }) => id.toString());
    if (!request.user!.roles.includes(Role.ADMIN) && salonIds.length && !salonIds.some((id: string) => canAccessSalon(request.user!, id))) throw new ApiError(403, 'SALON_SCOPE_FORBIDDEN');
    if (!salonIds.includes(salonId)) {
      customer.salonIds = uniqueIds([...salonIds, salonId]);
      customer.updatedBy = request.user!.id;
      await customer.save();
    }
    return customer;
  }

  const customerInput = body.customer ?? {};
  const contactName = customerInput.fullName || [customerInput.firstName, customerInput.lastName].filter(Boolean).join(' ') || quote?.contactName;
  const result = await findOrCreateCustomer({
    contactName,
    firstName: customerInput.firstName,
    lastName: customerInput.lastName,
    phone: customerInput.phone || quote?.phone,
    email: customerInput.email || quote?.email,
    eventType: body.eventType || quote?.eventType,
    estimatedEventDate: body.eventDate || quote?.eventDate,
    guestCount: body.guestCount || quote?.guestCount,
    salonIds: [salonId],
    quoteId: quote?._id?.toString?.(),
    message: customerInput.notes || body.notes || quote?.notes,
    userId: request.user!.id
  });
  const customer: any = result.customer;
  const customerPatch = pickDefined(customerInput, ['documentNumber', 'address', 'occupation', 'notes']);
  if (Object.keys(customerPatch).length) {
    Object.assign(customer, customerPatch, { updatedBy: request.user!.id });
    await customer.save();
  }
  return customer;
}

function commercialSnapshotFromBody(body: any): Record<string, unknown> {
  const pricingMode = body.pricingMode ?? (body.fixedPrice || body.finalFixedPrice ? 'fixed' : 'per_person');
  const perPersonTotal = Number(body.finalPricePerPerson ?? body.pricePerPerson ?? 0) * Number(body.guestCount ?? 0);
  const fixedTotal = Number(body.finalFixedPrice ?? body.fixedPrice ?? 0);
  const totalAmount = Number(body.finalAmount ?? body.estimatedAmount ?? (pricingMode === 'fixed' ? fixedTotal : perPersonTotal) ?? 0);
  const depositAmount = Number(body.depositAmount ?? 0);
  return {
    packageTemplateId: body.packageTemplateId,
    packageName: body.packageName,
    durationHours: body.durationHours,
    discountPercentage: body.discountPercentage,
    pricingMode,
    startTime: body.startTime,
    endTime: body.endTime,
    pricePerPerson: body.pricePerPerson,
    finalPricePerPerson: body.finalPricePerPerson ?? body.pricePerPerson,
    fixedPrice: body.fixedPrice,
    finalFixedPrice: body.finalFixedPrice ?? body.fixedPrice,
    totalAmount,
    depositAmount,
    balanceAmount: Math.max(0, totalAmount - depositAmount),
    paymentTerms: body.paymentTerms,
    promotionText: body.promotionText,
    giftText: body.giftText
  };
}

const packageOverrideKeys = ['name', 'durationHours', 'startTime', 'endTime', 'pricingMode', 'pricePerPerson', 'fixedPrice', 'discountPercentage', 'finalPricePerPerson', 'finalFixedPrice', 'depositAmount', 'paymentTerms', 'promotionText', 'giftText', 'menuSections', 'includedServices', 'notes'];
const packageEventOverrideKeys = ['eventType', 'eventName', 'eventDate', 'startTime', 'endTime', 'guestCount', 'honoreeName', 'vegetarianCount', 'veganCount', 'celiacCount', 'lactoseIntolerantCount', 'tableLinenColor', 'packageName', 'pricingMode', 'pricePerPerson', 'finalPricePerPerson', 'fixedPrice', 'finalFixedPrice', 'estimatedAmount', 'finalAmount', 'depositAmount', 'paymentTerms', 'promotionText', 'giftText', 'menuSnapshot', 'servicesSnapshot', 'resourcePlanSnapshot', 'notes'];

async function getApplicablePackageForEvent(templateId: string, salonId: string): Promise<Record<string, any>> {
  const template: any = await PackageTemplate.findOne({ _id: templateId, active: true, deletedAt: null }).lean();
  if (!template || (!template.isGlobal && !(template.salonIds ?? []).some((id: { toString(): string }) => id.toString() === salonId))) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_AVAILABLE');
  const rule: any = await VenuePackageRule.findOne({ packageTemplateId: templateId, salonId, deletedAt: null }).lean();
  if (rule && !rule.active) throw new ApiError(404, 'PACKAGE_TEMPLATE_NOT_AVAILABLE');
  return { ...template, ...(rule ? pickDefined(rule, packageOverrideKeys) : {}), packageTemplateId: template._id.toString(), packageName: rule?.name ?? template.name, ruleConfigured: Boolean(rule) };
}

function applyPackageToEventBody(body: any, packageSnapshot: Record<string, any>): Record<string, any> {
  const pricingMode = packageSnapshot.pricingMode ?? 'per_person';
  const discountFactor = 1 - Number(packageSnapshot.discountPercentage ?? 0) / 100;
  const pricePerPerson = packageSnapshot.finalPricePerPerson ?? (packageSnapshot.pricePerPerson === undefined ? undefined : Math.round(Number(packageSnapshot.pricePerPerson) * discountFactor));
  const fixedPrice = packageSnapshot.finalFixedPrice ?? (packageSnapshot.fixedPrice === undefined ? undefined : Math.round(Number(packageSnapshot.fixedPrice) * discountFactor));
  const packageDefaults = {
    packageTemplateId: packageSnapshot.packageTemplateId,
    packageName: packageSnapshot.packageName,
    durationHours: packageSnapshot.durationHours,
    pricingMode,
    startTime: packageSnapshot.startTime,
    endTime: packageSnapshot.endTime,
    pricePerPerson,
    finalPricePerPerson: pricePerPerson,
    fixedPrice,
    finalFixedPrice: fixedPrice,
    depositAmount: packageSnapshot.depositAmount,
    paymentTerms: packageSnapshot.paymentTerms,
    promotionText: packageSnapshot.promotionText,
    giftText: packageSnapshot.giftText,
    menuSnapshot: packageSnapshot.menuSections,
    servicesSnapshot: packageSnapshot.includedServices,
    notes: packageSnapshot.notes
  };
  return { ...body, ...packageDefaults, ...pickDefined(body, packageEventOverrideKeys) };
}

function eventPatchFromCreateBody(body: any): Record<string, unknown> {
  return pickDefined(body, [
    'eventType',
    'eventName',
    'eventDate',
    'startTime',
    'endTime',
    'guestCount',
    'honoreeName',
    'vegetarianCount',
    'veganCount',
    'celiacCount',
    'lactoseIntolerantCount',
    'tableLinenColor',
    'estimatedAmount',
    'finalAmount',
    'notes'
  ]);
}

function packageProposalForEvent(event: any, packageSnapshot: Record<string, any>) {
  const pricingMode = packageSnapshot.pricingMode ?? 'per_person';
  const discountFactor = 1 - Number(packageSnapshot.discountPercentage ?? 0) / 100;
  const finalPricePerPerson = packageSnapshot.finalPricePerPerson ?? (packageSnapshot.pricePerPerson === undefined ? undefined : Math.round(Number(packageSnapshot.pricePerPerson) * discountFactor));
  const finalFixedPrice = packageSnapshot.finalFixedPrice ?? (packageSnapshot.fixedPrice === undefined ? undefined : Math.round(Number(packageSnapshot.fixedPrice) * discountFactor));
  const totalAmount = pricingMode === 'fixed'
    ? Number(finalFixedPrice ?? 0)
    : Number(finalPricePerPerson ?? 0) * Number(event.guestCount ?? 0);
  const depositAmount = Number(packageSnapshot.depositAmount ?? 0);
  return {
    commercial: {
      ...(event.commercialSnapshot ?? {}),
      packageTemplateId: packageSnapshot.packageTemplateId,
      packageName: packageSnapshot.packageName,
      durationHours: packageSnapshot.durationHours,
      pricingMode,
      pricePerPerson: packageSnapshot.pricePerPerson,
      discountPercentage: packageSnapshot.discountPercentage ?? 0,
      finalPricePerPerson,
      fixedPrice: packageSnapshot.fixedPrice,
      finalFixedPrice,
      totalAmount,
      depositAmount,
      balanceAmount: Math.max(0, totalAmount - depositAmount),
      paymentTerms: packageSnapshot.paymentTerms,
      promotionText: packageSnapshot.promotionText,
      giftText: packageSnapshot.giftText
    },
    schedule: { startTime: packageSnapshot.startTime, endTime: packageSnapshot.endTime, durationHours: packageSnapshot.durationHours },
    menu: packageSnapshot.menuSections ?? [],
    services: packageSnapshot.includedServices ?? [],
    totalAmount
  };
}

function packageChangeRows(event: any, proposal: ReturnType<typeof packageProposalForEvent>) {
  const currentCommercial = {
    packageName: event.commercialSnapshot?.packageName,
    pricingMode: event.commercialSnapshot?.pricingMode,
    pricePerPerson: event.commercialSnapshot?.pricePerPerson,
    finalPricePerPerson: event.commercialSnapshot?.finalPricePerPerson,
    fixedPrice: event.commercialSnapshot?.fixedPrice,
    finalFixedPrice: event.commercialSnapshot?.finalFixedPrice,
    totalAmount: event.finalAmount ?? event.estimatedAmount ?? event.commercialSnapshot?.totalAmount,
    depositAmount: event.commercialSnapshot?.depositAmount,
    paymentTerms: event.commercialSnapshot?.paymentTerms
  };
  const proposedCommercial = {
    packageName: proposal.commercial.packageName,
    pricingMode: proposal.commercial.pricingMode,
    pricePerPerson: proposal.commercial.pricePerPerson,
    finalPricePerPerson: proposal.commercial.finalPricePerPerson,
    fixedPrice: proposal.commercial.fixedPrice,
    finalFixedPrice: proposal.commercial.finalFixedPrice,
    totalAmount: proposal.totalAmount,
    depositAmount: proposal.commercial.depositAmount,
    paymentTerms: proposal.commercial.paymentTerms
  };
  const rows = [
    { key: 'commercial', label: 'Precio y condiciones', current: currentCommercial, proposed: proposedCommercial },
    { key: 'schedule', label: 'Horario y duración', current: { startTime: event.startTime, endTime: event.endTime, durationHours: event.commercialSnapshot?.durationHours }, proposed: proposal.schedule },
    { key: 'menu', label: 'Menú', current: event.menuSnapshot ?? [], proposed: proposal.menu },
    { key: 'services', label: 'Servicios incluidos', current: event.servicesSnapshot ?? [], proposed: proposal.services }
  ];
  return rows.map((row) => ({ ...row, changed: JSON.stringify(row.current) !== JSON.stringify(row.proposed) }));
}

function syncContractSnapshot(contract: any, event: any, userId: string) {
  contract.eventSnapshot = { ...(contract.eventSnapshot ?? {}), eventType: event.eventType, eventName: event.eventName, eventDate: event.eventDate, startTime: event.startTime, endTime: event.endTime, guestCount: event.guestCount, honoreeName: event.honoreeName, vegetarianCount: event.vegetarianCount, veganCount: event.veganCount, celiacCount: event.celiacCount, lactoseIntolerantCount: event.lactoseIntolerantCount, tableLinenColor: event.tableLinenColor };
  const baseAmount = Number(event.finalAmount ?? event.estimatedAmount ?? contract.baseAmount ?? 0);
  contract.commercialSnapshot = { ...(contract.commercialSnapshot ?? {}), ...(event.commercialSnapshot ?? {}), totalAmount: baseAmount };
  contract.menuSnapshot = event.menuSnapshot ?? contract.menuSnapshot;
  contract.servicesSnapshot = event.servicesSnapshot ?? contract.servicesSnapshot;
  contract.paymentPlanSnapshot = event.paymentPlanSnapshot ?? event.paymentSnapshot?.paymentPlan ?? contract.paymentPlanSnapshot;
  contract.paymentAgreementSnapshot = { ...(contract.paymentAgreementSnapshot ?? {}), paymentTerms: event.commercialSnapshot?.paymentTerms, depositAmount: event.commercialSnapshot?.depositAmount, balanceAmount: Math.max(0, baseAmount - Number(contract.paidAmount ?? 0)) };
  contract.baseAmount = baseAmount;
  contract.totalAmount = baseAmount + Number(contract.approvedAddendumsAmount ?? 0) - Number(contract.discountsAmount ?? 0);
  contract.balanceAmount = contract.totalAmount - Number(contract.paidAmount ?? 0);
  contract.updatedBy = userId;
}

async function syncContractsAfterEventChange(event: any, userId: string, session?: ClientSession): Promise<'none' | 'draft_updated' | 'revision_created'> {
  const query: any = Contract.find({ eventId: event._id, deletedAt: null }).sort({ versionNumber: -1, createdAt: -1 });
  if (session) query.session(session);
  const contracts: any[] = await query;
  const draft = contracts.find((item) => ['draft', 'pending_approval', 'requires_changes'].includes(item.status));
  const approved = contracts.find((item) => item.status === 'approved');
  if (draft) {
    syncContractSnapshot(draft, event, userId);
    await draft.save(session ? { session } : undefined);
    return 'draft_updated';
  }
  if (!approved) return 'none';
  const nextVersion = Math.max(...contracts.map((item) => Number(item.versionNumber ?? 1))) + 1;
  const revision = new Contract({
    ...approved.toObject(),
    _id: undefined,
    contractNumber: `${approved.contractNumber}-V${nextVersion}`,
    contractFamilyId: approved.contractFamilyId ?? approved._id,
    versionNumber: nextVersion,
    supersedesContractId: approved._id,
    supersededByContractId: undefined,
    status: 'draft',
    approvedAt: undefined,
    approvedByUserId: undefined,
    pdfUrl: undefined,
    pdfSecureUrl: undefined,
    pdfPublicId: undefined,
    pdfGeneratedAt: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    createdBy: userId,
    updatedBy: userId
  });
  syncContractSnapshot(revision, event, userId);
  await revision.save(session ? { session } : undefined);
  return 'revision_created';
}

async function packageChangePreview(event: any, packageSnapshot: Record<string, any>) {
  const proposal = packageProposalForEvent(event, packageSnapshot);
  const changes = packageChangeRows(event, proposal);
  const contracts: any[] = await Contract.find({ eventId: event._id, deletedAt: null }).sort({ versionNumber: -1, createdAt: -1 });
  const approved = contracts.find((item) => item.status === 'approved');
  const draft = contracts.find((item) => ['draft', 'pending_approval', 'requires_changes'].includes(item.status));
  const financial = await paymentSummary({ eventId: event._id });
  const paidAmount = Number(financial.paidAmount ?? 0);
  const commercialChange = changes.find((item) => item.key === 'commercial')?.changed ?? false;
  const productionNeedsReview = ['reserved', 'confirmed'].includes(event.status)
    || Boolean(event.resourcePlanSnapshot?.productItems?.length || event.resourcePlanSnapshot?.supplierAssignments?.length);
  return {
    package: { id: packageSnapshot.packageTemplateId, name: packageSnapshot.packageName, snapshot: packageSnapshot },
    currentPackage: { id: event.packageTemplateId?.toString?.() ?? event.commercialSnapshot?.packageTemplateId, name: event.commercialSnapshot?.packageName },
    proposal,
    changes,
    impact: {
      contract: approved ? 'revision_required' : draft ? 'draft_updated' : 'none',
      approvedContractNumber: approved?.contractNumber,
      draftContractNumber: draft?.contractNumber,
      paidAmount,
      paymentPlanNeedsReview: commercialChange && Boolean(event.paymentPlanSnapshot?.length),
      productionNeedsReview,
      reasonRequired: Boolean(approved || paidAmount > 0 || ['reserved', 'confirmed'].includes(event.status)),
      applyingBlocked: commercialChange && proposal.totalAmount < paidAmount,
      blockedReason: commercialChange && proposal.totalAmount < paidAmount ? 'El nuevo total es menor que el importe ya cobrado. Primero debe resolverse el crédito o la devolución.' : undefined
    }
  };
}

function buildQuery(request: Request): Record<string, unknown> {
  const terms: Record<string, unknown>[] = [{ deletedAt: null }];
  if (!request.user!.roles.includes(Role.ADMIN)) terms.push({ salonId: { $in: accessibleSalonIds(request.user!) } });
  const status = getQueryString(request.query.status);
  if (status && eventStatuses.includes(status as any)) terms.push({ status });
  const salonId = getQueryString(request.query.salonId);
  if (salonId && objectId.safeParse(salonId).success) terms.push({ salonId });
  const dateFrom = getQueryString(request.query.dateFrom);
  const dateTo = getQueryString(request.query.dateTo);
  const dateRange: Record<string, Date> = {};
  if (dateFrom) {
    const parsed = new Date(dateFrom);
    if (!Number.isNaN(parsed.getTime())) dateRange.$gte = parsed;
  }
  if (dateTo) {
    const parsed = new Date(dateTo);
    if (!Number.isNaN(parsed.getTime())) dateRange.$lte = parsed;
  }
  if (Object.keys(dateRange).length) terms.push({ eventDate: dateRange });
  const customerId = getQueryString(request.query.customerId);
  if (customerId && objectId.safeParse(customerId).success) terms.push({ customerId });
  const sourceQuoteId = getQueryString(request.query.sourceQuoteId);
  if (sourceQuoteId && objectId.safeParse(sourceQuoteId).success) terms.push({ sourceQuoteId });
  const term = getQueryString(request.query.search);
  if (term) terms.push({ $or: ['eventName', 'eventType', 'notes'].map((field) => ({ [field]: { $regex: term, $options: 'i' } })) });
  return terms.length === 1 ? terms[0] : { $and: terms };
}

router.use(requireAuth);

router.get('/', requirePermission(Permission.EVENTS_READ), asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(getQueryString(request.query.page)) || 1);
  const limit = Math.min(100, Math.max(1, Number(getQueryString(request.query.limit)) || 20));
  const sortBy = ['createdAt', 'eventDate', 'status', 'eventName'].includes(getQueryString(request.query.sortBy) ?? '') ? getQueryString(request.query.sortBy)! : 'createdAt';
  const sortOrder = getQueryString(request.query.sortOrder) === 'asc' ? 1 : -1;
  const query = buildQuery(request);
  const totalItems = await Event.countDocuments(query);
  const items = await Event.find(query)
    .populate('customerId', 'fullName phone email')
    .populate('salonId', 'name')
    .populate('sourceLeadId', 'fullName phone email')
    .populate('sourceQuoteId', 'quoteNumber totalAmount status')
    .sort({ [sortBy]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  return sendSuccess(response, { items, meta: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1 } });
}));

router.post('/', requirePermission(Permission.EVENTS_CREATE), validateRequest(createEventSchema), asyncHandler(async (request, response) => {
  const quoteId = cleanId(request.body.quoteId);
  if (quoteId) {
    const quote = await getAccessibleQuote(request, quoteId);
    const result = await convertQuoteToEvent({ quoteId, userId: request.user!.id, eventName: request.body.eventName, notes: request.body.notes });
    const event: any = await Event.findOne({ _id: result.event._id, deletedAt: null });
    await ensureEventAccess(request, event);
    const patch = eventPatchFromCreateBody(request.body);
    if (request.body.resourcePlanSnapshot !== undefined) patch.resourcePlanSnapshot = request.body.resourcePlanSnapshot;
    if (request.body.menuSnapshot !== undefined) patch.menuSnapshot = request.body.menuSnapshot;
    if (request.body.servicesSnapshot !== undefined) patch.servicesSnapshot = request.body.servicesSnapshot;
    if (Object.keys(patch).length) {
      Object.assign(event, patch, { updatedBy: request.user!.id });
      await event.save();
    }
    let contract: any;
    let contractCreated = false;
    let contractError: string | undefined;
    if (request.body.createContract) {
      try {
        const contractResult = await createContractFromEvent({ eventId: event._id.toString(), userId: request.user!.id });
        contract = contractResult.contract;
        contractCreated = contractResult.created;
      } catch (error) {
        contractError = error instanceof ApiError ? error.message : getApiMessage('INTERNAL_ERROR');
      }
    }
    const freshEvent = await Event.findOne({ _id: event._id, deletedAt: null }).populate('customerId', 'fullName phone email').populate('salonId', 'name').populate('sourceQuoteId', 'quoteNumber totalAmount status').lean();
    await writeAuditLog(request, result.createdEvent ? 'EVENT_CREATE_FROM_QUOTES_PAGE' : 'EVENT_LINK_EXISTING_QUOTE', 'Event', event._id.toString(), { quoteId: quote._id.toString(), contractCreated });
    return sendSuccess(response, { event: freshEvent, customer: result.customer, quote: result.quote, contract, contractCreated, contractError, createdFromQuote: true }, result.createdEvent ? 201 : 200, getApiMessage(result.createdEvent ? 'EVENT_CREATED_FROM_QUOTE' : 'EVENT_ALREADY_CREATED_FROM_QUOTE'));
  }

  const salonId = cleanId(request.body.salonId)!;
  await ensureSalonAccess(request, salonId);
  const selectedPackage = cleanId(request.body.packageTemplateId);
  const packageSnapshot = selectedPackage ? await getApplicablePackageForEvent(selectedPackage, salonId) : undefined;
  const eventBody = packageSnapshot ? applyPackageToEventBody(request.body, packageSnapshot) : request.body;
  const resultingAmount = eventBody.pricingMode === 'per_person' ? eventBody.finalPricePerPerson ?? eventBody.pricePerPerson : eventBody.finalAmount ?? eventBody.finalFixedPrice ?? eventBody.fixedPrice;
  const missingEventFields = [
    !eventBody.eventType && 'tipo de evento',
    !eventBody.eventDate && 'fecha',
    !eventBody.startTime && 'horario de inicio',
    !eventBody.endTime && 'horario de fin',
    !eventBody.guestCount && 'cantidad de invitados',
    !resultingAmount && 'precio'
  ].filter(Boolean);
  if (missingEventFields.length) throw new ApiError(422, 'EVENT_REQUIRED_FIELDS', `Completá ${missingEventFields.join(', ')} antes de crear el evento.`);
  const customer = await resolveCustomerForEvent(request, eventBody, salonId);
  const commercialSnapshot = commercialSnapshotFromBody(eventBody);
  const totalAmount = Number(commercialSnapshot.totalAmount ?? 0);
  const resourcePlanSnapshot = eventBody.resourcePlanSnapshot ?? buildInitialResourcePlan({ source: 'manual_event' });
  // Precarga alertas típicas (revisar invitados, coordinar reunión, etc.) solo cuando el
  // llamador no mandó su propio plan y ya sabemos la fecha del evento — el usuario sigue
  // pudiendo editarlas/borrarlas desde la pestaña "Tareas" igual que antes.
  if (!eventBody.resourcePlanSnapshot && eventBody.eventDate) {
    const derivedEventName = eventBody.eventName || `${eventBody.eventType || 'Evento'} - ${customer.fullName || 'Cliente'}`;
    resourcePlanSnapshot.alerts = buildDefaultEventAlerts({
      eventDate: eventBody.eventDate,
      customerName: customer.fullName,
      eventName: derivedEventName
    });
  }
  const event = await Event.create({
    customerId: customer._id,
    salonId,
    ...eventPatchFromCreateBody(eventBody),
    eventName: eventBody.eventName || `${eventBody.eventType || 'Evento'} - ${customer.fullName || 'Cliente'}`,
    quoteMode: packageSnapshot ? 'PACKAGE' : 'CUSTOM',
    packageTemplateId: packageSnapshot?.packageTemplateId,
    status: 'draft',
    estimatedAmount: eventBody.estimatedAmount ?? totalAmount,
    finalAmount: eventBody.finalAmount ?? totalAmount,
    commercialSnapshot,
    packageSnapshot,
    menuSnapshot: eventBody.menuSnapshot ?? [],
    servicesSnapshot: eventBody.servicesSnapshot ?? [],
    resourcePlanSnapshot,
    paymentSnapshot: {
      depositAmount: commercialSnapshot.depositAmount,
      balanceAmount: commercialSnapshot.balanceAmount,
      paymentTerms: eventBody.paymentTerms
    },
    contractReadyChecklist: {
      customerComplete: Boolean(customer.fullName && (customer.phone || customer.email)),
      document: Boolean(customer.documentNumber),
      address: Boolean(customer.address),
      salonDefined: true,
      dateDefined: Boolean(eventBody.eventDate),
      timeDefined: Boolean(eventBody.startTime && eventBody.endTime),
      guestCount: Boolean(eventBody.guestCount),
      totalPrice: Boolean(totalAmount),
      deposit: Boolean(eventBody.depositAmount),
      paymentTerms: Boolean(eventBody.paymentTerms),
      menu: Boolean(eventBody.menuSnapshot?.length),
      includedServices: Boolean(eventBody.servicesSnapshot?.length)
    },
    createdBy: request.user!.id,
    updatedBy: request.user!.id
  });
  await LeadActivity.create({ customerId: customer._id, eventId: event._id, type: 'event_created', title: 'Evento creado', description: `Se creó el evento ${event.eventName}.`, createdBy: request.user!.id });
  await writeAuditLog(request, 'EVENT_CREATE', 'Event', event._id.toString(), { customerId: customer._id.toString(), salonId, packageTemplateId: packageSnapshot?.packageTemplateId });
  await syncEventAlertCalendarItems(event, event.resourcePlanSnapshot?.alerts, request.user!.id);

  let contract: any;
  let contractCreated = false;
  let contractError: string | undefined;
  if (request.body.createContract) {
    try {
      const contractResult = await createContractFromEvent({ eventId: event._id.toString(), userId: request.user!.id });
      contract = contractResult.contract;
      contractCreated = contractResult.created;
    } catch (error) {
      contractError = error instanceof ApiError ? error.message : getApiMessage('INTERNAL_ERROR');
    }
  }
  const freshEvent = await Event.findOne({ _id: event._id, deletedAt: null }).populate('customerId', 'fullName phone email').populate('salonId', 'name').lean();
  return sendSuccess(response, { event: freshEvent, customer, contract, contractCreated, contractError, createdFromQuote: false }, 201, getApiMessage('EVENT_CREATED'));
}));

router.get('/customers/:id', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const customer = await Customer.findOne({ _id: request.params.id, deletedAt: null }).lean();
  if (!customer) throw new ApiError(404, 'CUSTOMER_NOT_FOUND');
  return sendSuccess(response, { customer });
}));

router.get('/:id/payments', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const items = await Payment.find({ eventId: request.params.id, deletedAt: null }).populate('customerId', 'fullName phone email').populate('contractId', 'contractNumber totalAmount balanceAmount status').populate('salonId', 'name').sort({ paidAt: -1, dueDate: 1, createdAt: -1 }).lean();
  const summary = await paymentSummary({ eventId: request.params.id });
  return sendSuccess(response, { items, summary });
}));

router.get('/:id/expenses', requirePermission(Permission.EVENTS_READ), requirePermission(Permission.SUPPLIERS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  return sendSuccess(response, await eventExpenses(request.params.id));
}));

router.put('/:id/suppliers', requirePermission(Permission.EVENTS_UPDATE), requirePermission(Permission.SUPPLIERS_READ), validateRequest(eventSuppliersSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  const result = await syncEventSupplierExpenses({ eventId: request.params.id, assignments: request.body.items, userId: request.user!.id });
  await writeAuditLog(request, 'EVENT_SUPPLIERS_SYNC', 'Event', request.params.id, {
    assignmentCount: result.assignments.length,
    expenseIds: result.expenses.map((expense: any) => expense._id.toString()),
    totalPaidExpenses: result.summary.totalPaid,
    expenses: result.expenses.map((expense: any) => ({
      id: expense._id.toString(),
      sourceId: expense.sourceId,
      supplierId: expense.supplierId?._id?.toString?.() ?? expense.supplierId?.toString?.(),
      amount: expense.amount,
      status: expense.status,
    })),
  });
  return sendSuccess(response, result, 200, 'Proveedores y gastos del evento actualizados correctamente.');
}));

router.post('/:id/payments', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(eventPaymentSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  // A proposed revision is not payable yet. Continue collecting against the approved agreement
  // until the revision is approved; only fall back to a draft when the event has never had an
  // approved contract.
  let contract: any = await Contract.findOne({ eventId: event._id, deletedAt: null, status: 'approved' }).sort({ versionNumber: -1, createdAt: -1 });
  if (!contract) contract = await Contract.findOne({ eventId: event._id, deletedAt: null, status: { $in: ['pending_approval', 'draft', 'requires_changes'] } }).sort({ versionNumber: -1, createdAt: -1 });
  if (!contract) throw new ApiError(422, 'Primero debe generar un contrato para registrar cobros del evento.');

  const canOverride = userHasPermission(request.user!, Permission.PAYMENTS_APPROVE);
  if (request.body.allowOverpayment && !canOverride) throw new ApiError(403, 'PAYMENT_OVERRIDE_NOT_AUTHORIZED');
  const previousBalance = contract.balanceAmount;

  const type = request.body.type ?? 'installment';
  const payment = await createPayment({
    ...request.body,
    type,
    status: 'paid',
    eventId: event._id.toString(),
    contractId: contract._id.toString(),
    customerId: event.customerId?.toString(),
    salonId: event.salonId?.toString(),
    quoteId: event.quoteId?.toString(),
    allowOverpayment: request.body.allowOverpayment && canOverride
  }, request.user!.id);
  contract = await Contract.findOne({ _id: contract._id, deletedAt: null });

  // El plan de cuotas modela únicamente el saldo posterior a la seña (ver EventCommercialEditor:
  // "Total acordado" - "Seña" = "Saldo estimado", y ese saldo es lo que se reparte en cuotas). Un
  // pago de tipo distinto a 'installment' (seña, saldo global, extra, ajuste, etc.) impacta el
  // saldo del contrato igual, pero nunca debe descontarse de esas cuotas: antes cualquier cobro
  // registrado desde "Importe libre" — incluida la seña — se tomaba como si fuera una cuota.
  let planOverpaymentAmount = 0;
  if (type === 'installment' && Array.isArray(event.paymentPlanSnapshot) && event.paymentPlanSnapshot.length) {
    const result = applyPaymentToPlan(event.paymentPlanSnapshot, request.body.amount, { planInstallmentId: request.body.planInstallmentId, paymentId: payment._id.toString() });
    planOverpaymentAmount = result.overpaymentAmount;
    event.paymentPlanSnapshot = result.plan;
    await event.save();
    contract.paymentPlanSnapshot = result.plan;
    await contract.save();
  }
  let receiptEmailSent = false;
  try {
    const customer: any = await Customer.findOne({ _id: event.customerId, deletedAt: null }).lean();
    const receipt = await generateAndUploadPaymentReceiptPdf(payment, event, customer, contract);
    Object.assign(payment, receipt);
    delete (payment as any).pdfBuffer;
    if (customer?.email) {
      receiptEmailSent = await sendEmail({ to: customer.email, subject: `Comprobante de pago ${payment.paymentNumber} · M&M Eventos`, text: `Hola ${customer.fullName ?? ''}, adjuntamos el comprobante de tu pago por ${Number(payment.amount).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}. También podés verlo aquí: ${receipt.receiptPdfSecureUrl}`, attachments: [{ filename: `comprobante-${payment.paymentNumber}.pdf`, content: receipt.pdfBuffer, contentType: 'application/pdf' }] });
      if (receiptEmailSent) payment.receiptEmailSentAt = new Date();
    }
    await payment.save();
  } catch (error) { console.error('No se pudo generar o enviar el comprobante de pago:', error); }
  await writeAuditLog(request, 'EVENT_PAYMENT_CREATE', 'Payment', payment._id.toString(), { eventId: request.params.id, planInstallmentId: request.body.planInstallmentId });
  if (request.body.allowOverpayment && canOverride) {
    const contractAfter: any = await Contract.findOne({ _id: contract._id, deletedAt: null }).select('balanceAmount').lean();
    await writeAuditLog(request, 'PAYMENT_OVERPAYMENT_OVERRIDE', 'Payment', payment._id.toString(), { contractId: contract._id, eventId: request.params.id, requestedAmount: payment.amount, previousBalance, resultingBalance: contractAfter?.balanceAmount, reason: request.body.overrideReason });
  }
  await LeadActivity.create({ eventId: event._id, customerId: event.customerId, type: 'payment_registered', title: 'Pago registrado', description: `Se registró el pago ${payment.paymentNumber} por $ ${Number(payment.amount || 0).toLocaleString('es-AR')}.`, metadata: { paymentId: payment._id, amount: payment.amount, type: payment.type }, createdBy: request.user!.id });
  const [items, summary] = await Promise.all([
    Payment.find({ eventId: request.params.id, deletedAt: null })
      .populate('customerId', 'fullName phone email')
      .populate('contractId', 'contractNumber totalAmount balanceAmount status')
      .populate('salonId', 'name')
      .sort({ paidAt: -1, dueDate: 1, createdAt: -1 })
      .lean(),
    paymentSummary({ eventId: request.params.id }),
  ]);
  return sendSuccess(response, { payment, items, summary, contract, paymentPlanSnapshot: event.paymentPlanSnapshot, planOverpaymentAmount, receiptEmailSent }, 201, getApiMessage('PAYMENT_CREATED'));
}));

router.post('/:id/payments/:paymentId/receipt-email', requirePermission(Permission.PAYMENTS_CREATE), validateRequest(paymentReceiptSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean(); await ensureEventAccess(request, event);
  const payment: any = await Payment.findOne({ _id: request.params.paymentId, eventId: event._id, deletedAt: null }); if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND');
  const [customer, contract] = await Promise.all([Customer.findOne({ _id: event.customerId, deletedAt: null }).lean(), Contract.findOne({ _id: payment.contractId, deletedAt: null }).lean()]);
  const email = request.body?.email ?? (customer as any)?.email; if (!email) throw new ApiError(422, 'El cliente no tiene un email registrado.');
  const receipt = await generateAndUploadPaymentReceiptPdf(payment, event, customer, contract); Object.assign(payment, receipt); delete (payment as any).pdfBuffer;
  const emailSent = await sendEmail({ to: email, subject: `Comprobante de pago ${payment.paymentNumber} · M&M Eventos`, text: `Adjuntamos tu comprobante de pago. También podés verlo aquí: ${receipt.receiptPdfSecureUrl}`, attachments: [{ filename: `comprobante-${payment.paymentNumber}.pdf`, content: receipt.pdfBuffer, contentType: 'application/pdf' }] });
  if (emailSent) payment.receiptEmailSentAt = new Date(); await payment.save();
  return sendSuccess(response, { payment, emailSent });
}));

router.get('/:id/staff', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const items = await EventStaffAssignment.find({ eventId: request.params.id, deletedAt: null }).populate('staffUserId', 'firstName lastName fullName phone email roles staffProfile salonIds active').populate('salonId', 'name').sort({ shiftStart: 1, createdAt: 1 }).lean();
  return sendSuccess(response, { items });
}));

router.post('/:id/staff', requirePermission(Permission.EVENTS_UPDATE), validateRequest(createAssignmentSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  const staff: any = await User.findOne({ _id: request.body.staffUserId, active: true, deletedAt: null }).lean();
  if (!staff) throw new ApiError(422, 'STAFF_NOT_FOUND');
  const staffSalonIds = (staff.salonIds ?? []).map((id: { toString(): string }) => id.toString());
  const salonId = event.salonId?.toString();
  if (!staff.roles?.includes(Role.ADMIN) && salonId && !staffSalonIds.includes(salonId)) throw new ApiError(403, 'STAFF_SALON_SCOPE_FORBIDDEN');
  if (request.body.shiftStart && request.body.shiftEnd) {
    const conflict = await EventStaffAssignment.exists({
      eventId: { $ne: request.params.id }, staffUserId: request.body.staffUserId,
      shiftStart: { $lt: request.body.shiftEnd }, shiftEnd: { $gt: request.body.shiftStart },
      deletedAt: null, status: { $nin: ['cancelled', 'no_show'] },
    });
    if (conflict) throw new ApiError(409, 'STAFF_ASSIGNMENT_TIME_CONFLICT', 'La persona ya tiene otro turno superpuesto.');
  }
  const duplicate = await EventStaffAssignment.exists({ eventId: request.params.id, staffUserId: request.body.staffUserId, shiftStart: request.body.shiftStart ?? null, shiftEnd: request.body.shiftEnd ?? null, deletedAt: null, status: { $nin: ['cancelled', 'no_show'] } });
  if (duplicate) throw new ApiError(409, 'STAFF_ASSIGNMENT_DUPLICATED');
  const assignment = await EventStaffAssignment.create({ ...request.body, eventId: request.params.id, salonId, createdBy: request.user!.id, updatedBy: request.user!.id });
  await writeAuditLog(request, 'EVENT_STAFF_ASSIGN', 'EventStaffAssignment', assignment._id.toString(), { eventId: request.params.id, staffUserId: request.body.staffUserId });
  return sendSuccess(response, { assignment }, 201);
}));

router.patch('/:id/staff/:assignmentId', requirePermission(Permission.EVENTS_UPDATE), validateRequest(updateAssignmentSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  if (request.body.status) {
    const assignment = await transitionStaffAssignment(request, event, request.params.assignmentId, request.body.status);
    return sendSuccess(response, { assignment });
  }
  const assignment: any = await EventStaffAssignment.findOne({ _id: request.params.assignmentId, eventId: event._id, deletedAt: null });
  if (!assignment) throw new ApiError(404, 'STAFF_ASSIGNMENT_NOT_FOUND');
  if (String(assignment.salonId) !== String(event.salonId)) throw new ApiError(403, 'STAFF_ASSIGNMENT_SALON_SCOPE_FORBIDDEN');
  Object.assign(assignment, request.body, { updatedBy: request.user!.id });
  await assignment.save();
  await writeAuditLog(request, 'EVENT_STAFF_UPDATE', 'EventStaffAssignment', request.params.assignmentId);
  return sendSuccess(response, { assignment });
}));

router.delete('/:id/staff/:assignmentId', requirePermission(Permission.EVENTS_UPDATE), validateRequest(assignmentIdSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  const assignment: any = await EventStaffAssignment.findOne({ _id: request.params.assignmentId, eventId: event._id, deletedAt: null });
  if (!assignment) throw new ApiError(404, 'STAFF_ASSIGNMENT_NOT_FOUND');
  if (String(assignment.salonId) !== String(event.salonId)) throw new ApiError(403, 'STAFF_ASSIGNMENT_SALON_SCOPE_FORBIDDEN');
  if (!['proposed', 'assigned'].includes(assignment.status)) throw new ApiError(422, 'STAFF_ASSIGNMENT_DELETE_NOT_ALLOWED');
  assignment.deletedAt = new Date();
  assignment.deletedBy = request.user!.id;
  assignment.updatedBy = request.user!.id;
  await assignment.save();
  await writeAuditLog(request, 'EVENT_STAFF_DELETE', 'EventStaffAssignment', request.params.assignmentId);
  return sendSuccess(response, { deleted: true });
}));

router.post('/:id/staff/:assignmentId/status', requirePermission(Permission.EVENTS_UPDATE), validateRequest(assignmentStatusSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  const assignment = await transitionStaffAssignment(request, event, request.params.assignmentId, request.body.status);
  return sendSuccess(response, { assignment });
}));

for (const [path, status] of [['assign', 'assigned'], ['confirm', 'confirmed'], ['check-in', 'checked_in'], ['complete', 'completed'], ['no-show', 'no_show'], ['cancel', 'cancelled']] as const) {
  router.post(`/:id/staff/:assignmentId/${path}`, requirePermission(Permission.EVENTS_UPDATE), validateRequest(assignmentIdSchema), asyncHandler(async (request, response) => {
    const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
    await ensureEventAccess(request, event);
    ensureEventOperationallyEditable(event);
    const assignment = await transitionStaffAssignment(request, event, request.params.assignmentId, status);
    return sendSuccess(response, { assignment });
  }));
}

router.get('/:id/payment-summary', requirePermission(Permission.PAYMENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  return sendSuccess(response, { summary: await paymentSummary({ eventId: request.params.id }) });
}));

router.get('/:id/activity', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const activities = await LeadActivity.find({ eventId: request.params.id }).sort({ createdAt: -1 }).lean();
  return sendSuccess(response, { activities });
}));

router.post('/:id/activities', requirePermission(Permission.EVENTS_UPDATE), validateRequest(activityNoteSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const activity = await LeadActivity.create({ eventId: event._id, customerId: event.customerId, type: 'note', title: 'Nota', description: request.body.description, createdBy: request.user!.id });
  return sendSuccess(response, { activity }, 201, getApiMessage('ACTIVITY_CREATED'));
}));

router.get('/:id/operational-documents/:documentType/preview-pdf', requirePermission(Permission.EVENTS_READ), validateRequest(operationalDocumentPreviewSchema), asyncHandler(async (request, response) => {
  const type = request.params.documentType as OperationalDocumentType;
  const event = await getEventForOperationalDocument(request, request.params.id, type);
  // Vista previa dinámica: genera el PDF a partir del estado actual del evento sin subirlo a
  // Cloudinary — permite revisarlo antes de "generar". El PDF/Word definitivo (el que sí se
  // persiste, para compartir por email/WhatsApp) se sigue generando en /export y /email.
  const { buffer, fileName } = await generateOperationalPdf(event, type);
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  return response.send(buffer);
}));

router.post('/:id/operational-documents/:documentType/export', requirePermission(Permission.EVENTS_READ), validateRequest(operationalDocumentSchema), asyncHandler(async (request, response) => {
  const type = request.params.documentType as OperationalDocumentType;
  const event = await getEventForOperationalDocument(request, request.params.id, type);
  const document = await createOperationalDocument(event, type, request.body.format);
  await writeAuditLog(request, 'EVENT_OPERATIONAL_DOCUMENT_EXPORT', 'Event', event._id.toString(), { documentType: type, format: request.body.format });
  return sendSuccess(response, { document: { fileName: document.fileName, format: request.body.format, url: document.url, secureUrl: document.secureUrl } });
}));

router.post('/:id/operational-documents/:documentType/email', requirePermission(Permission.EVENTS_UPDATE), validateRequest(operationalDocumentEmailSchema), asyncHandler(async (request, response) => {
  const type = request.params.documentType as OperationalDocumentType;
  const event = await getEventForOperationalDocument(request, request.params.id, type);
  ensureEventOperationallyEditable(event);
  const email = request.body.email ?? event.customerId?.email;
  if (!email) throw new ApiError(422, 'El cliente no tiene un email registrado.');
  const document = await createOperationalDocument(event, type, request.body.format);
  const title = type === 'timeline' ? 'Cronograma operativo' : type === 'guest_list' ? 'Control de invitados por mesa' : type === 'tableware' ? 'Reserva de vajilla' : type === 'full' ? 'Cronograma integral' : 'Logística y coordinación interna';
  const eventName = event.eventName || event.eventType || 'evento';
  const emailSent = await sendEmail({
    to: email,
    subject: `${title} · ${eventName} · M&M Eventos`,
    text: `Hola, adjuntamos el documento “${title}” del evento ${eventName}. También podés verlo o descargarlo aquí: ${document.secureUrl}`,
    attachments: [{ filename: document.fileName, content: document.buffer, contentType: request.body.format === 'pdf' ? 'application/pdf' : 'application/msword' }]
  });
  await writeAuditLog(request, 'EVENT_OPERATIONAL_DOCUMENT_EMAIL', 'Event', event._id.toString(), { documentType: type, format: request.body.format, email, emailSent });
  return sendSuccess(response, { emailSent, email, document: { fileName: document.fileName, format: request.body.format, url: document.url, secureUrl: document.secureUrl } });
}));

router.post('/:id/guest-list-link', requirePermission(Permission.EVENTS_UPDATE), validateRequest(guestListLinkSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  const created = !event.guestListAccessToken;
  if (created) {
    event.guestListAccessToken = randomBytes(32).toString('base64url');
    event.guestListAccessTokenCreatedAt = new Date();
    event.updatedBy = request.user!.id;
    await event.save();
    await writeAuditLog(request, 'EVENT_GUEST_LIST_LINK_CREATE', 'Event', event._id.toString());
  }
  return sendSuccess(response, { token: event.guestListAccessToken, created });
}));

router.get('/:id/tableware', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  if (!event.salonId) throw new ApiError(422, 'El evento debe tener un salón asignado para reservar vajilla.');
  const day = eventDay(event.eventDate);
  if (!day) throw new ApiError(422, 'El evento debe tener una fecha asignada para reservar vajilla.');
  const [items, allocations] = await Promise.all([
    tablewareAvailability(event.salonId.toString(), day, event._id.toString()),
    EventTablewareAllocation.find({ eventId: event._id, releasedAt: null }).sort({ source: 1, itemName: 1 }).lean()
  ]);
  return sendSuccess(response, { eventDay: day, items, allocations });
}));

router.put('/:id/tableware', requirePermission(Permission.EVENTS_UPDATE), validateRequest(tablewareSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  if (!event.salonId) throw new ApiError(422, 'El evento debe tener un salón asignado para reservar vajilla.');
  const day = eventDay(event.eventDate);
  if (!day) throw new ApiError(422, 'El evento debe tener una fecha asignada para reservar vajilla.');

  const requested = new Map<string, { quantity: number; notes?: string }>();
  for (const item of request.body.salonItems) {
    const current = requested.get(item.stockItemId) ?? { quantity: 0 };
    requested.set(item.stockItemId, { quantity: current.quantity + item.quantity, notes: item.notes ?? current.notes });
  }
  const availability = await tablewareAvailability(event.salonId.toString(), day, event._id.toString());
  const byId = new Map(availability.map((item: any) => [item._id.toString(), item]));
  for (const [stockItemId, requestedItem] of requested) {
    const item: any = byId.get(stockItemId);
    if (!item) throw new ApiError(404, 'TABLEWARE_STOCK_ITEM_NOT_FOUND', 'El artículo de vajilla seleccionado no pertenece al salón o no está activo.');
    if (requestedItem.quantity > item.maxAssignableQuantity) {
      throw new ApiError(422, 'TABLEWARE_STOCK_INSUFFICIENT', `No hay stock suficiente de ${item.name} para el ${day}. Disponible: ${item.maxAssignableQuantity}.`, {
        stockItemId, eventDay: day, requestedQuantity: requestedItem.quantity, availableQuantity: item.maxAssignableQuantity,
      });
    }
  }

  const internalAllocations = [...requested.entries()].map(([stockItemId, item]) => {
    const stock: any = byId.get(stockItemId);
    return { eventId: event._id, salonId: event.salonId, salonStockItemId: stock._id, source: 'salon_stock', itemName: stock.name, category: 'Vajilla', unit: stock.unitOfMeasure, quantity: item.quantity, eventDay: day, notes: item.notes, createdBy: request.user!.id, updatedBy: request.user!.id };
  });
  const externalAllocations = request.body.externalItems.map((item: any) => ({ eventId: event._id, salonId: event.salonId, source: 'external', itemName: item.name, category: item.category || 'Vajilla adicional', unit: item.unit || 'unidad', quantity: item.quantity, eventDay: day, notes: item.notes, createdBy: request.user!.id, updatedBy: request.user!.id }));

  await EventTablewareAllocation.deleteMany({ eventId: event._id, releasedAt: null });
  if (internalAllocations.length || externalAllocations.length) await EventTablewareAllocation.insertMany([...internalAllocations, ...externalAllocations]);
  const allocations = await EventTablewareAllocation.find({ eventId: event._id, releasedAt: null }).sort({ source: 1, itemName: 1 });
  event.resourcePlanSnapshot = resourcePlanWithTableware(event.resourcePlanSnapshot, allocations);
  event.updatedBy = request.user!.id;
  await event.save();
  await writeAuditLog(request, 'EVENT_TABLEWARE_ALLOCATE', 'Event', event._id.toString(), { eventDay: day, salonItemCount: internalAllocations.length, externalItemCount: externalAllocations.length });
  const items = await tablewareAvailability(event.salonId.toString(), day, event._id.toString());
  return sendSuccess(response, { eventDay: day, items, allocations });
}));

router.post('/:id/package-change/preview', requirePermission(Permission.EVENTS_UPDATE), validateRequest(packagePreviewSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  if (!event.salonId) throw new ApiError(422, 'PACKAGE_TEMPLATE_NOT_AVAILABLE', 'El evento necesita un salón antes de asociar un paquete.');
  const packageSnapshot = await getApplicablePackageForEvent(request.body.packageTemplateId, event.salonId.toString());
  return sendSuccess(response, { preview: await packageChangePreview(event, packageSnapshot) });
}));

router.post('/:id/package-change', requirePermission(Permission.EVENTS_UPDATE), validateRequest(packageApplySchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  if (request.body.mode === 'apply') ensureEventOperationallyEditable(event);
  if (!event.salonId) throw new ApiError(422, 'PACKAGE_TEMPLATE_NOT_AVAILABLE', 'El evento necesita un salón antes de asociar un paquete.');
  if (request.body.expectedUpdatedAt && new Date(request.body.expectedUpdatedAt).getTime() !== new Date(event.updatedAt).getTime()) {
    throw new ApiError(409, 'EVENT_CHANGED', 'El evento cambió mientras revisabas el paquete. Volvé a comparar antes de guardar.');
  }
  if (request.body.mode === 'apply' && ['cancelled', 'lost'].includes(event.status)) {
    throw new ApiError(422, 'EVENT_PACKAGE_CHANGE_LOCKED', 'Un evento cancelado o perdido solo admite corregir la asociación del paquete.');
  }

  const packageSnapshot = await getApplicablePackageForEvent(request.body.packageTemplateId, event.salonId.toString());
  const preview = await packageChangePreview(event, packageSnapshot);
  if (preview.impact.reasonRequired && !request.body.reason?.trim()) {
    throw new ApiError(422, 'EVENT_PACKAGE_CHANGE_REASON_REQUIRED', 'Indicá el motivo porque el evento ya tiene avances comerciales u operativos.');
  }
  if (request.body.mode === 'apply' && preview.impact.applyingBlocked) {
    throw new ApiError(422, 'EVENT_PACKAGE_CHANGE_BLOCKED', preview.impact.blockedReason);
  }

  const selectedSections = new Set(request.body.sections ?? packageChangeSections);
  const appliedAt = new Date();
  event.packageTemplateId = packageSnapshot.packageTemplateId;
  event.packageSnapshot = {
    ...packageSnapshot,
    application: { mode: request.body.mode, sections: [...selectedSections], reason: request.body.reason, appliedAt, appliedBy: request.user!.id }
  };
  event.commercialSnapshot = { ...(event.commercialSnapshot ?? {}), packageTemplateId: packageSnapshot.packageTemplateId };

  if (request.body.mode === 'apply') {
    if (selectedSections.has('commercial')) {
      event.commercialSnapshot = preview.proposal.commercial;
      event.estimatedAmount = preview.proposal.totalAmount;
      event.finalAmount = preview.proposal.totalAmount;
      event.paymentSnapshot = {
        ...(event.paymentSnapshot ?? {}),
        depositAmount: preview.proposal.commercial.depositAmount,
        balanceAmount: preview.proposal.commercial.balanceAmount,
        paymentTerms: preview.proposal.commercial.paymentTerms
      };
    }
    if (selectedSections.has('schedule')) {
      event.startTime = preview.proposal.schedule.startTime ?? event.startTime;
      event.endTime = preview.proposal.schedule.endTime ?? event.endTime;
      event.commercialSnapshot = { ...(event.commercialSnapshot ?? {}), durationHours: preview.proposal.schedule.durationHours };
    }
    if (selectedSections.has('menu')) event.menuSnapshot = preview.proposal.menu;
    if (selectedSections.has('services')) event.servicesSnapshot = preview.proposal.services;
    event.quoteMode = selectedSections.size === packageChangeSections.length ? 'PACKAGE' : 'HYBRID';
  } else if (event.quoteMode === 'CUSTOM') {
    event.quoteMode = 'HYBRID';
  }

  event.contractReadyChecklist = {
    ...(event.contractReadyChecklist ?? {}),
    timeDefined: Boolean(event.startTime && event.endTime),
    totalPrice: Boolean(event.finalAmount ?? event.estimatedAmount),
    deposit: Boolean(event.commercialSnapshot?.depositAmount),
    paymentTerms: Boolean(event.commercialSnapshot?.paymentTerms),
    menu: Boolean(event.menuSnapshot?.length),
    includedServices: Boolean(event.servicesSnapshot?.length)
  };
  event.updatedBy = request.user!.id;
  const changedSelectedSections = preview.changes.filter((item) => item.changed && selectedSections.has(item.key as typeof packageChangeSections[number]));
  let contractImpact: 'none' | 'draft_updated' | 'revision_created';
  const session = await mongoose.startSession();
  try {
    contractImpact = await session.withTransaction(async () => {
      await event.save({ session });
      if (request.body.mode === 'apply' && changedSelectedSections.length) {
        return syncContractsAfterEventChange(event, request.user!.id, session);
      }
      return 'none' as const;
    });
  } finally {
    await session.endSession();
  }
  const warnings = [
    preview.impact.paymentPlanNeedsReview && selectedSections.has('commercial') ? 'Revisá el plan de cuotas: se conservaron las cuotas y los pagos registrados.' : undefined,
    preview.impact.productionNeedsReview && changedSelectedSections.some((item) => ['menu', 'services', 'commercial'].includes(item.key)) ? 'La producción existente puede haber quedado desactualizada. Regenerá sus sugerencias antes de continuar.' : undefined,
    contractImpact === 'revision_created' ? 'Se creó una nueva versión contractual en borrador. El contrato aprobado sigue vigente hasta que se apruebe la revisión.' : undefined
  ].filter(Boolean);

  try {
    await LeadActivity.create({
      eventId: event._id,
      customerId: event.customerId,
      type: 'system',
      title: request.body.mode === 'associate_only' ? 'Paquete asociado' : 'Paquete actualizado',
      description: request.body.mode === 'associate_only'
        ? `Se asoció ${packageSnapshot.packageName} como referencia sin reemplazar los datos acordados.`
        : `Se aplicó ${packageSnapshot.packageName} en: ${changedSelectedSections.map((item) => item.label).join(', ') || 'sin diferencias'}.`,
      metadata: { packageTemplateId: packageSnapshot.packageTemplateId, mode: request.body.mode, sections: [...selectedSections], reason: request.body.reason, contractImpact },
      createdBy: request.user!.id
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'event_package_activity_write_failed',
      eventId: event._id.toString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }));
  }
  await writeAuditLog(request, request.body.mode === 'associate_only' ? 'EVENT_PACKAGE_ASSOCIATE' : 'EVENT_PACKAGE_APPLY', 'Event', event._id.toString(), {
    packageTemplateId: packageSnapshot.packageTemplateId,
    packageName: packageSnapshot.packageName,
    sections: [...selectedSections],
    changedSections: changedSelectedSections.map((item) => item.key),
    reason: request.body.reason,
    contractImpact
  });
  return sendSuccess(response, { event, contractImpact, warnings: warnings.length ? warnings : undefined }, 200, 'Paquete del evento actualizado correctamente.');
}));

router.get('/:id', requirePermission(Permission.EVENTS_READ), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null })
    .populate('customerId')
    .populate('salonId', 'name address locality city')
    .populate('leadId', 'fullName phone email eventType')
    .populate('quoteId')
    .populate('sourceLeadId', 'fullName phone email eventType')
    .populate('sourceQuoteId')
    .lean();
  await ensureEventAccess(request, event);
  const contracts = await Contract.find({ eventId: request.params.id, deletedAt: null }).select('contractNumber status eventId customerId salonId versionNumber supersedesContractId supersededByContractId totalAmount pdfSecureUrl createdAt sentAt signedAt approvedAt').sort({ versionNumber: -1, createdAt: -1 }).lean();
  const contract = contracts.find((item: any) => item.status === 'approved')
    ?? contracts.find((item: any) => ['pending_approval', 'draft', 'requires_changes'].includes(item.status));
  const proposedContract = contract?.status === 'approved'
    ? contracts.find((item: any) => ['pending_approval', 'draft', 'requires_changes'].includes(item.status))
    : undefined;
  return sendSuccess(response, { event, contract, proposedContract, contracts });
}));

router.post('/:id/create-contract', requirePermission(Permission.CONTRACTS_CREATE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  const result = await createContractFromEvent({ eventId: request.params.id, userId: request.user!.id });
  await writeAuditLog(request, result.created ? 'EVENT_CREATE_CONTRACT' : 'EVENT_GET_EXISTING_CONTRACT', 'Contract', result.contract._id.toString(), { eventId: request.params.id });
  return sendSuccess(response, { contract: result.contract, created: result.created }, result.created ? 201 : 200, result.created ? getApiMessage('CONTRACT_CREATED') : getApiMessage('CONTRACT_ALREADY_EXISTS'));
}));

router.patch('/:id', requirePermission(Permission.EVENTS_UPDATE), validateRequest(updateSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  ensureEventOperationallyEditable(event);
  // Las asignaciones financieras sólo pueden mutarse mediante PUT /:id/suppliers,
  // que sincroniza el gasto de forma transaccional. Los demás editores siguen
  // enviando el plan completo por compatibilidad, por eso preservamos esta rama.
  const updateBody: Record<string, any> = { ...request.body };
  const resultingEvent = { ...(typeof event.toObject === 'function' ? event.toObject() : event), ...updateBody };
  const missingRequired = [
    !resultingEvent.eventType && 'Debe indicar el tipo de evento.',
    !resultingEvent.eventDate && 'Debe indicar la fecha del evento.',
    !resultingEvent.startTime && 'Debe indicar el horario de inicio.',
    !resultingEvent.endTime && 'Debe indicar el horario de fin.',
    !resultingEvent.guestCount && 'Debe indicar una cantidad de invitados válida.'
  ].filter(Boolean) as string[];
  if (missingRequired.length) throw new ApiError(422, 'EVENT_REQUIRED_FIELDS', missingRequired.join(' '));
  if (Object.prototype.hasOwnProperty.call(updateBody, 'resourcePlanSnapshot')) {
    if (!updateBody.resourcePlanSnapshot || typeof updateBody.resourcePlanSnapshot !== 'object' || Array.isArray(updateBody.resourcePlanSnapshot)) throw new ApiError(422, 'EVENT_RESOURCE_PLAN_INVALID');
    updateBody.resourcePlanSnapshot = {
      ...updateBody.resourcePlanSnapshot,
      supplierAssignments: event.resourcePlanSnapshot?.supplierAssignments ?? [],
    };
  }
  const currentReservationDay = eventDay(event.eventDate);
  const nextReservationDay = updateBody.eventDate ? eventDay(updateBody.eventDate) : undefined;
  const eventDateChanged = Boolean(currentReservationDay && nextReservationDay && nextReservationDay !== currentReservationDay);
  if (eventDateChanged && event.salonId) {
    const allocations = await EventTablewareAllocation.find({ eventId: event._id, source: 'salon_stock', releasedAt: null }).lean();
    const availableItems = await tablewareAvailability(event.salonId.toString(), nextReservationDay!, event._id.toString());
    const availabilityById = new Map(availableItems.map((item: any) => [item._id.toString(), item]));
    for (const allocation of allocations) {
      const item: any = allocation.salonStockItemId ? availabilityById.get(allocation.salonStockItemId.toString()) : undefined;
      const maxAssignable = item?.maxAssignableQuantity ?? 0;
      if (!item || allocation.quantity > maxAssignable) throw new ApiError(422, 'EVENT_TABLEWARE_UNAVAILABLE_FOR_DATE', `No se puede cambiar la fecha al ${nextReservationDay}: "${allocation.itemName}" no tiene stock suficiente ese día (asignado ${allocation.quantity}, disponible ${maxAssignable}). Reducí la cantidad asignada en la pestaña Cronograma, liberala del otro evento que la reserva ese día, o elegí otra fecha.`);
    }
  }
  // El evento tiene sus propias alertas/recordatorios (resourcePlanSnapshot.alerts, pestaña
  // "Tareas") calculadas como offsets fijos respecto de la fecha original (ver
  // event-alert-defaults.ts). Si la fecha cambia acá y no se las desplaza, quedan ancladas a un
  // día que ya no tiene sentido (ej. "revisar cronograma" programada para lo que era D-7 de una
  // fecha que ya no es la del evento). Las que ya se enviaron (status 'sent') no se tocan.
  if (eventDateChanged) {
    const baseAlerts: any[] = Array.isArray(updateBody.resourcePlanSnapshot?.alerts)
      ? updateBody.resourcePlanSnapshot.alerts
      : Array.isArray(event.resourcePlanSnapshot?.alerts) ? event.resourcePlanSnapshot.alerts : [];
    if (baseAlerts.length) {
      const deltaDays = daysBetweenDateKeys(currentReservationDay!, nextReservationDay!);
      const shiftedAlerts = baseAlerts.map((alert: any) => {
        if (!alert?.remindAt || alert.status === 'sent') return alert;
        const shifted = new Date(alert.remindAt);
        if (Number.isNaN(shifted.getTime())) return alert;
        shifted.setUTCDate(shifted.getUTCDate() + deltaDays);
        return { ...alert, remindAt: shifted.toISOString() };
      });
      updateBody.resourcePlanSnapshot = { ...(event.resourcePlanSnapshot ?? {}), ...(updateBody.resourcePlanSnapshot ?? {}), alerts: shiftedAlerts };
    }
  }
  const scheduleChanged = ['eventDate', 'startTime', 'endTime'].some((field) => Object.prototype.hasOwnProperty.call(updateBody, field));
  if (lockedEventStatuses.has(event.status) && scheduleChanged && event.salonId) {
    const resultingDay = nextReservationDay ?? currentReservationDay;
    if (resultingDay) {
      await assertVenueAvailable({
        salonId: event.salonId.toString(),
        day: resultingDay,
        startTime: updateBody.startTime ?? event.startTime,
        endTime: updateBody.endTime ?? event.endTime,
        excludeEventId: event._id.toString()
      });
    }
  }
  const contractSensitiveFields =['eventType', 'eventName', 'eventDate', 'startTime', 'endTime', 'guestCount', 'honoreeName', 'vegetarianCount', 'veganCount', 'celiacCount', 'lactoseIntolerantCount', 'tableLinenColor', 'estimatedAmount', 'finalAmount', 'commercialSnapshot', 'menuSnapshot', 'servicesSnapshot', 'paymentSnapshot', 'paymentPlanSnapshot'];
  const hasSensitiveChanges = contractSensitiveFields.some((field) => Object.prototype.hasOwnProperty.call(updateBody, field) && JSON.stringify(event[field]) !== JSON.stringify(updateBody[field]));
  Object.assign(event, updateBody, { updatedBy: request.user!.id });
  await event.save();
  if (Object.prototype.hasOwnProperty.call(updateBody, 'resourcePlanSnapshot')) {
    await syncEventAlertCalendarItems(event, event.resourcePlanSnapshot?.alerts, request.user!.id);
  }
  if (nextReservationDay && nextReservationDay !== currentReservationDay) await EventTablewareAllocation.updateMany({ eventId: event._id, releasedAt: null }, { $set: { eventDay: nextReservationDay, updatedBy: request.user!.id } });
  if (!hasSensitiveChanges) {
    await writeAuditLog(request, 'EVENT_UPDATE', 'Event', event._id.toString(), { contractAffected: false });
    return sendSuccess(response, { event }, 200, getApiMessage('EVENT_UPDATED'));
  }
  const contracts: any[] = await Contract.find({ eventId: event._id, deletedAt: null }).sort({ versionNumber: -1, createdAt: -1 });
  const draft = contracts.find((item) => ['draft', 'pending_approval', 'requires_changes'].includes(item.status));
  const approved = contracts.find((item) => item.status === 'approved');
  // No movemos vencimientos de pago automáticamente: son un compromiso ya acordado con el
  // cliente y correrlos sin que nadie lo decida sería alterar datos financieros en silencio. Sólo
  // avisamos si, tras el cambio de fecha, algún vencimiento pendiente quedó posterior al evento
  // (típicamente porque el evento se adelantó), para que un operador lo revise a mano.
  const warnings: string[] = [];
  if (eventDateChanged) {
    const staleInstallments = planFor(event, draft ?? approved ?? contracts[0]).filter(isOpenInstallment).filter((installment) => {
      const dueKey = installmentDueDateKey(installment);
      return dueKey && dueKey > nextReservationDay!;
    });
    if (staleInstallments.length) warnings.push(`Hay ${staleInstallments.length} cuota(s) del plan de pagos con vencimiento posterior a la nueva fecha del evento (${nextReservationDay}). Revisá el plan de pagos.`);
    const pendingPayments: any[] = await Payment.find({ eventId: event._id, status: 'pending', dueDate: { $ne: null }, deletedAt: null }).select('dueDate').lean();
    const stalePayments = pendingPayments.filter((payment) => { const key = dueDateKey(payment.dueDate); return key && key > nextReservationDay!; });
    if (stalePayments.length) warnings.push(`Hay ${stalePayments.length} pago(s) pendiente(s) cargado(s) con vencimiento posterior a la nueva fecha del evento. Revisá la pestaña Pagos.`);
  }
  await syncContractsAfterEventChange(event, request.user!.id);
  await writeAuditLog(request, 'EVENT_UPDATE', 'Event', event._id.toString(), { contractAffected: true });
  return sendSuccess(response, { event, warnings: warnings.length ? warnings : undefined }, 200, getApiMessage('EVENT_UPDATED'));
}));

router.get('/:id/cancellation-preview', requirePermission(Permission.EVENTS_CANCEL), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  return sendSuccess(response, { preview: await cancellationPreview(event) });
}));

router.get('/:id/deletion-preview', requirePermission(Permission.EVENTS_DELETE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  return sendSuccess(response, { preview: await deletionPreview(event) });
}));

router.delete('/:id', requirePermission(Permission.EVENTS_DELETE), validateRequest(idSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null }).lean();
  await ensureEventAccess(request, event);
  const result = await deleteDraftEvent({ eventId: request.params.id, userId: request.user!.id });
  await writeAuditLog(request, 'EVENT_DELETE', 'Event', request.params.id, { mode: 'soft_delete', automaticCalendarItemsRemoved: result.preview.impacts.automaticCalendarItemsRemoved });
  return sendSuccess(response, { deleted: true, eventId: result.eventId }, 200, 'El borrador se eliminó correctamente.');
}));

router.post('/:id/reactivate', requirePermission(Permission.EVENTS_CANCEL), validateRequest(reactivateSchema), asyncHandler(async (request, response) => {
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  if (lockedEventStatuses.has(request.body.status) && event.salonId) {
    const day = eventDay(event.eventDate);
    if (day) await assertVenueAvailable({ salonId: event.salonId.toString(), day, startTime: event.startTime, endTime: event.endTime, excludeEventId: event._id.toString() });
  }
  const result = await reactivateEvent({ eventId: request.params.id, userId: request.user!.id, status: request.body.status, reason: request.body.reason });
  await writeAuditLog(request, 'EVENT_REACTIVATE', 'Event', request.params.id, { status: request.body.status, reason: request.body.reason, warnings: result.warnings });
  return sendSuccess(response, result, 200, 'El evento se reactivó. Revisá sus recursos operativos antes de confirmarlo.');
}));

router.patch('/:id/status', requirePermission(Permission.EVENTS_UPDATE), validateRequest(statusSchema), asyncHandler(async (request, response) => {
  const isCancellation = terminalEventStatuses.includes(request.body.status as typeof terminalEventStatuses[number]);
  if (isCancellation) {
    if (!userHasPermission(request.user!, Permission.EVENTS_CANCEL)) throw new ApiError(403, 'FORBIDDEN');
    if (!request.body.reason || !request.body.reason.trim()) throw new ApiError(422, 'EVENT_CANCELLATION_REASON_REQUIRED');
  }
  const event: any = await Event.findOne({ _id: request.params.id, deletedAt: null });
  await ensureEventAccess(request, event);
  if (terminalEventStatuses.includes(event.status) && !isCancellation) {
    throw new ApiError(409, 'EVENT_REACTIVATION_REQUIRED', 'Usá la acción Reactivar para volver a abrir un evento cancelado o perdido.');
  }
  if (isCancellation) {
    const result = await cancelEvent({ eventId: request.params.id, userId: request.user!.id, status: request.body.status, reason: request.body.reason!.trim() });
    await writeAuditLog(request, 'EVENT_STATUS_UPDATE', 'Event', request.params.id, { status: request.body.status, reason: request.body.reason, impacts: result.preview.impacts });
    return sendSuccess(response, result, 200, getApiMessage('EVENT_UPDATED'));
  }
  if (lockedEventStatuses.has(request.body.status) && event.salonId) {
    const day = eventDay(event.eventDate);
    if (day) await assertVenueAvailable({ salonId: event.salonId.toString(), day, startTime: event.startTime, endTime: event.endTime, excludeEventId: event._id.toString() });
  }
  event.status = request.body.status;
  event.updatedBy = request.user!.id;
  await event.save();
  await writeAuditLog(request, 'EVENT_STATUS_UPDATE', 'Event', event._id.toString(), { status: event.status, reason: request.body.reason });
  return sendSuccess(response, { event }, 200, getApiMessage('EVENT_UPDATED'));
}));

export default router;
