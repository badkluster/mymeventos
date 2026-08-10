import type { Request } from 'express';
import mongoose, { Types } from 'mongoose';
import { ExpenseSourceType, ExpenseStatus, Role } from '@mym/shared';
import { connectDatabase, disconnectDatabase } from '../db/connection';
import {
  Contract, Customer, Event, EventStaffAssignment, Lead, PackageTemplate, Payment, Quote, VenuePackageRule,
} from '../modules/crm/crm.models';
import { EventTablewareAllocation } from '../modules/crm/eventTablewareAllocation.model';
import { blockers, closureChecks, type ClosureStage } from '../modules/event-closure/event-closure.routes';
import { EventClosure } from '../modules/event-closure/event-closure.model';
import { Expense, Supplier } from '../modules/operations/operations.models';
import { ProductionItem, ProductionPlan, ProductionSection } from '../modules/production/production.models';
import { dashboardSummary } from '../modules/reporting/dashboard.service';
import { parseReportPeriod, periodMatch } from '../modules/reporting/report-filter';
import { Salon } from '../modules/salons/salon.model';
import { SalonStockItem } from '../modules/salons/salonStockItem.model';
import { TimePunch, WorkSession } from '../modules/attendance/attendance.models';
import { User } from '../modules/users/user.model';
import {
  JULY_2026_EVENT_DAYS, JULY_2026_SEED_KEY, auditResourcePlan, classifySeedTarget, dateKey,
} from './seedJuly2026FullEvents.helpers';
import { env } from '../config/env';

type AnyRecord = Record<string, any>;
type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'WARNING';
type AuditIssue = {
  severity: Severity;
  code: string;
  message: string;
  eventId?: string;
  eventName?: string;
  stage?: ClosureStage;
  entity?: string;
};

type EventAudit = {
  event: AnyRecord;
  errors: AuditIssue[];
  warnings: AuditIssue[];
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  closureBlockers: Record<ClosureStage, AnyRecord[]>;
};

type DatasetCounts = {
  events: number;
  customers: number;
  leads: number;
  quotes: number;
  contracts: number;
  payments: number;
  expenses: number;
  suppliersUsed: number;
  staffAssignments: number;
  guests: number;
  tables: number;
  tableware: number;
  productionPlans: number;
  productionItems: number;
  closures: number;
};

export type July2026AuditResult = {
  marker: string;
  expectedDates: readonly string[];
  eventAudits: EventAudit[];
  issues: AuditIssue[];
  warnings: AuditIssue[];
  counts: DatasetCounts;
  financials: { contracted: number; collected: number; expenses: number; profit: number; margin: number; averageTicket: number };
  reporting: { pass: boolean; expected: Record<string, number>; actual: Record<string, number>; differences: string[] };
  overall: 'PASS' | 'FAIL';
};

const allowedEventStatuses = new Set(['draft', 'quoted', 'contract_draft', 'deposit_pending', 'reserved', 'confirmed', 'cancelled', 'lost']);
const allowedQuoteModes = new Set(['PACKAGE', 'CUSTOM', 'HYBRID']);
const finalStaffStatuses = new Set(['completed', 'cancelled', 'no_show']);
const finalProductionItemStatuses = new Set(['checked', 'cancelled']);
const staffSubroles = new Set(['WAITER', 'MAITRE', 'COOK', 'KITCHEN_ASSISTANT', 'BARTENDER', 'DJ', 'DECORATION', 'CLEANING', 'SECURITY', 'COORDINATOR', 'RECEPTION', 'OTHER']);
const moneyTolerance = 0.01;

function id(value: any): string { return String(value?._id ?? value ?? ''); }
function markerRegex(): RegExp { return new RegExp(JULY_2026_SEED_KEY); }
function amount(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function approx(left: unknown, right: unknown, tolerance = moneyTolerance): boolean { return Math.abs(amount(left) - amount(right)) <= tolerance; }
function nonBlank(value: unknown): boolean { return typeof value === 'string' && Boolean(value.trim()); }
function validDate(value: unknown): boolean { return value != null && !Number.isNaN(new Date(value as any).getTime()); }

function timeMinutes(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]); const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : undefined;
}

function eventInterval(day: string, startTime: unknown, endTime: unknown): { start: number; end: number } | undefined {
  const start = timeMinutes(startTime); const end = timeMinutes(endTime);
  if (start === undefined || end === undefined) return undefined;
  const base = new Date(`${day}T00:00:00.000Z`).getTime() / 60_000;
  return { start: base + start, end: base + (end <= start ? end + 1_440 : end) };
}

function signedPayment(payment: AnyRecord): number {
  if (payment.status !== 'paid' || !payment.affectsContractBalance) return 0;
  return payment.type === 'refund' ? -amount(payment.amount) : amount(payment.amount);
}

function issueFor(event: AnyRecord | undefined, severity: Severity, code: string, message: string, extra: Partial<AuditIssue> = {}): AuditIssue {
  return { severity, code, message, eventId: event ? id(event) : undefined, eventName: event?.eventName, ...extra };
}

function valuesById<T extends AnyRecord>(values: T[]): Map<string, T> { return new Map(values.map((value) => [id(value), value])); }
function valuesByForeignId<T extends AnyRecord>(values: T[], field: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const value of values) { const key = id(value[field]); map.set(key, [...(map.get(key) ?? []), value]); }
  return map;
}

function expectedPackageTotal(snapshot: AnyRecord, guestCount: number): number {
  if (snapshot.pricingMode === 'fixed') return amount(snapshot.finalFixedPrice || snapshot.fixedPrice);
  return amount(snapshot.finalPricePerPerson || snapshot.pricePerPerson) * guestCount;
}

function metricMap(summary: AnyRecord): Record<string, number> {
  return Object.fromEntries((summary.metrics ?? []).map((metric: AnyRecord) => [metric.id, amount(metric.value)]));
}

function assertReadOnlyTarget(): void {
  const target = classifySeedTarget({ nodeEnv: env.NODE_ENV, vercelEnv: process.env.VERCEL_ENV, mongodbUri: env.MONGODB_URI });
  if (target.production) throw new Error(`VALIDATOR_ABORTED: destino clasificado como producción (${target.productionReasons.join(', ')}).`);
}

async function reportingReconciliation(): Promise<July2026AuditResult['reporting']> {
  const period = parseReportPeriod({ from: '2026-07-01', to: '2026-07-31' });
  const current = (field: string) => ({ deletedAt: null, ...periodMatch(period, field) });
  const [
    eventsConfirmed, contracts, payments, expenses, leadsNew, quotesSent, quotesAccepted, productionEvents,
  ] = await Promise.all([
    Event.countDocuments({ ...current('eventDate'), status: 'confirmed' }),
    Contract.find({ ...current('approvedAt'), status: 'approved' }).select('totalAmount').lean(),
    Payment.find({ ...current('paidAt'), status: 'paid', affectsContractBalance: true }).select('type amount').lean(),
    Expense.find({ ...current('paidAt'), status: 'paid' }).select('amount').lean(),
    Lead.countDocuments(current('createdAt')),
    Quote.countDocuments(current('sentAt')),
    Quote.countDocuments(current('acceptedAt')),
    Event.find({ ...current('eventDate'), status: { $nin: ['cancelled', 'lost'] } }).select('_id').lean(),
  ]);
  const plans = await ProductionPlan.find({ deletedAt: null, isCurrent: true, eventId: { $in: productionEvents.map((event) => event._id) } }).select('eventId status').lean();
  const readyEventIds = new Set(plans.filter((plan) => ['checked', 'closed'].includes(plan.status)).map((plan) => id(plan.eventId)));
  const contracted = contracts.reduce((sum, contract) => sum + amount(contract.totalAmount), 0);
  const collected = Math.max(0, payments.reduce((sum, payment) => sum + (payment.type === 'refund' ? -amount(payment.amount) : amount(payment.amount)), 0));
  const expensesPaid = expenses.reduce((sum, expense) => sum + amount(expense.amount), 0);
  const expected: Record<string, number> = {
    'events.confirmed': eventsConfirmed,
    'contracts.total': contracted,
    'payments.collected': collected,
    'expenses.paid': expensesPaid,
    'payments.averageTicket': contracts.length ? contracted / contracts.length : 0,
    'finance.profitMargin': collected ? ((collected - expensesPaid) / collected) * 100 : 0,
    'production.pending': productionEvents.length - readyEventIds.size,
    'production.readiness': productionEvents.length ? readyEventIds.size / productionEvents.length * 100 : 0,
    'leads.new': leadsNew,
    'quotes.sent': quotesSent,
    'quotes.accepted': quotesAccepted,
  };
  const request = { query: { from: '2026-07-01', to: '2026-07-31' }, user: { id: new Types.ObjectId().toString(), roles: [Role.ADMIN], salonIds: [], managedSalonIds: [], permissionOverrides: [], permissionDeniedOverrides: [] } } as unknown as Request;
  const actual = metricMap(await dashboardSummary(request));
  const differences = Object.entries(expected).flatMap(([key, value]) => {
    const dashboardValue = actual[key];
    return dashboardValue === undefined || !approx(Number(value.toFixed(2)), dashboardValue)
      ? [`${key}: Mongo=${Number(value.toFixed(2))}; dashboard=${dashboardValue ?? 'MISSING'}`]
      : [];
  });
  return { pass: differences.length === 0, expected, actual, differences };
}

export async function auditJuly2026FullEvents(): Promise<July2026AuditResult> {
  const events = await Event.find({ notes: markerRegex(), deletedAt: null }).sort({ eventDate: 1, salonId: 1 }).lean();
  const eventIds = events.map((event) => event._id);
  const customerIds = events.map((event) => event.customerId).filter(Boolean);
  const leadIds = events.flatMap((event) => [event.leadId, event.sourceLeadId].filter(Boolean));
  const quoteIds = events.flatMap((event) => [event.quoteId, event.sourceQuoteId, event.createdFromQuoteId].filter(Boolean));
  const [
    salons, customers, leads, quotes, contracts, payments, expenses, assignments, allocations, plans, closures, sessions,
  ] = await Promise.all([
    Salon.find({ $or: [{ active: true, deletedAt: null }, { _id: { $in: events.map((event) => event.salonId) } }] }).lean(),
    Customer.find({ _id: { $in: customerIds } }).lean(),
    Lead.find({ $or: [{ _id: { $in: leadIds } }, { convertedEventId: { $in: eventIds } }] }).lean(),
    Quote.find({ $or: [{ _id: { $in: quoteIds } }, { convertedEventId: { $in: eventIds } }] }).lean(),
    Contract.find({ eventId: { $in: eventIds }, deletedAt: null }).sort({ versionNumber: -1 }).lean(),
    Payment.find({ eventId: { $in: eventIds }, deletedAt: null }).lean(),
    Expense.find({ eventId: { $in: eventIds }, deletedAt: null }).lean(),
    EventStaffAssignment.find({ eventId: { $in: eventIds }, deletedAt: null }).lean(),
    EventTablewareAllocation.find({ eventId: { $in: eventIds } }).lean(),
    ProductionPlan.find({ eventId: { $in: eventIds }, deletedAt: null }).lean(),
    EventClosure.find({ eventId: { $in: eventIds }, deletedAt: null }).lean(),
    WorkSession.find({ eventId: { $in: eventIds } }).lean(),
  ]);
  const planIds = plans.map((plan) => plan._id);
  const assignmentIds = assignments.map((assignment) => assignment._id);
  const supplierIds = [
    ...expenses.map((expense) => expense.supplierId).filter(Boolean),
    ...events.flatMap((event) => (event.resourcePlanSnapshot?.supplierAssignments ?? []).map((assignment: AnyRecord) => assignment.supplierId).filter(Boolean)),
  ];
  const stockIds = allocations.map((allocation) => allocation.salonStockItemId).filter(Boolean);
  const packageIds = events.map((event) => event.commercialSnapshot?.packageTemplateId).filter(Boolean);
  const ruleIds = events.map((event) => event.commercialSnapshot?.venuePackageRuleId).filter(Boolean);
  const [items, sections, punches, users, suppliers, stock, templates, rules, allJulyAssignments, allJulyAllocations, lockedJulyEvents] = await Promise.all([
    ProductionItem.find({ productionPlanId: { $in: planIds }, deletedAt: null }).lean(),
    ProductionSection.find({ productionPlanId: { $in: planIds }, deletedAt: null }).lean(),
    TimePunch.find({ $or: [{ workSessionId: { $in: sessions.map((session) => session._id) } }, { requestId: { $regex: `^${JULY_2026_SEED_KEY}:` } }] }).lean(),
    User.find({ _id: { $in: assignments.map((assignment) => assignment.staffUserId) } }).lean(),
    Supplier.find({ _id: { $in: supplierIds } }).lean(),
    SalonStockItem.find({ _id: { $in: stockIds } }).lean(),
    PackageTemplate.find({ _id: { $in: packageIds } }).lean(),
    VenuePackageRule.find({ _id: { $in: ruleIds } }).lean(),
    EventStaffAssignment.find({ deletedAt: null, status: { $nin: ['cancelled', 'no_show'] }, shiftStart: { $lt: new Date('2026-08-02T03:00:00.000Z') }, shiftEnd: { $gt: new Date('2026-07-01T03:00:00.000Z') } }).lean(),
    EventTablewareAllocation.find({ salonStockItemId: { $in: stockIds }, eventDay: { $in: JULY_2026_EVENT_DAYS } }).lean(),
    Event.find({ deletedAt: null, status: { $in: ['reserved', 'confirmed'] }, eventDate: { $gte: new Date('2026-06-30T00:00:00.000Z'), $lt: new Date('2026-08-02T00:00:00.000Z') } }).select('salonId eventDate startTime endTime eventName').lean(),
  ]);

  const salonsById = valuesById(salons); const customersById = valuesById(customers); const leadsById = valuesById(leads); const quotesById = valuesById(quotes);
  const usersById = valuesById(users); const suppliersById = valuesById(suppliers); const stockById = valuesById(stock); const templatesById = valuesById(templates); const rulesById = valuesById(rules);
  const contractsByEvent = valuesByForeignId(contracts, 'eventId'); const paymentsByEvent = valuesByForeignId(payments, 'eventId'); const expensesByEvent = valuesByForeignId(expenses, 'eventId');
  const assignmentsByEvent = valuesByForeignId(assignments, 'eventId'); const allocationsByEvent = valuesByForeignId(allocations, 'eventId'); const plansByEvent = valuesByForeignId(plans, 'eventId');
  const itemsByPlan = valuesByForeignId(items, 'productionPlanId'); const sectionsById = valuesById(sections); const sessionsByEvent = valuesByForeignId(sessions, 'eventId'); const punchesBySession = valuesByForeignId(punches, 'workSessionId');
  const closuresByEvent = valuesByForeignId(closures, 'eventId');
  const eventAudits: EventAudit[] = [];

  for (const event of events) {
    const errors: AuditIssue[] = []; const warnings: AuditIssue[] = [];
    const fail = (severity: Severity, code: string, message: string, extra: Partial<AuditIssue> = {}) => errors.push(issueFor(event, severity, code, message, extra));
    const warn = (code: string, message: string, extra: Partial<AuditIssue> = {}) => warnings.push(issueFor(event, 'WARNING', code, message, extra));
    const salon = salonsById.get(id(event.salonId)); const customer = customersById.get(id(event.customerId));
    const eventContracts = contractsByEvent.get(id(event)) ?? []; const eventPayments = paymentsByEvent.get(id(event)) ?? []; const eventExpenses = expensesByEvent.get(id(event)) ?? [];
    const eventAssignments = assignmentsByEvent.get(id(event)) ?? []; const eventAllocations = allocationsByEvent.get(id(event)) ?? []; const eventPlans = plansByEvent.get(id(event)) ?? [];
    const currentPlans = eventPlans.filter((plan) => plan.isCurrent); const eventSessions = sessionsByEvent.get(id(event)) ?? []; const eventClosures = closuresByEvent.get(id(event)) ?? [];
    const day = validDate(event.eventDate) ? dateKey(event.eventDate) : '';

    if (!salon) fail('CRITICAL', 'EVENT_SALON_MISSING', 'El salón referenciado no existe.', { entity: `Salon:${id(event.salonId)}` });
    else { if (!salon.active || salon.deletedAt) fail('HIGH', 'EVENT_SALON_INACTIVE', 'El salón no está activo.'); if (amount(event.guestCount) > amount(salon.maxCapacity)) fail('HIGH', 'EVENT_CAPACITY_EXCEEDED', `${event.guestCount} invitados superan capacidad ${salon.maxCapacity}.`); }
    if (!customer) fail('CRITICAL', 'EVENT_CUSTOMER_MISSING', 'El cliente referenciado no existe.', { entity: `Customer:${id(event.customerId)}` });
    if (!validDate(event.eventDate) || !JULY_2026_EVENT_DAYS.includes(day as any)) fail('HIGH', 'EVENT_DATE_INVALID', `Fecha fuera del conjunto objetivo: ${String(event.eventDate)}.`);
    const interval = eventInterval(day, event.startTime, event.endTime);
    if (!interval || interval.end <= interval.start) fail('HIGH', 'EVENT_TIME_INVALID', `Horario inválido ${event.startTime ?? '-'} → ${event.endTime ?? '-'}.`);
    if (!(amount(event.guestCount) > 0)) fail('HIGH', 'EVENT_GUEST_COUNT_INVALID', 'guestCount debe ser mayor que cero.');
    if (!nonBlank(event.eventType) || !nonBlank(event.eventName)) fail('MEDIUM', 'EVENT_IDENTITY_INCOMPLETE', 'eventType/eventName incompletos.');
    if (!allowedEventStatuses.has(event.status)) fail('HIGH', 'EVENT_STATUS_INVALID', `Estado no permitido: ${event.status}.`);
    if (event.status !== 'confirmed') fail('HIGH', 'EVENT_NOT_CONFIRMED', `El dataset de cierre requiere confirmed y tiene ${event.status}.`);
    if (!allowedQuoteModes.has(event.quoteMode)) fail('HIGH', 'EVENT_QUOTE_MODE_INVALID', `quoteMode inválido: ${event.quoteMode}.`);

    const lead = leadsById.get(id(event.leadId || event.sourceLeadId)); const quote = quotesById.get(id(event.quoteId || event.sourceQuoteId || event.createdFromQuoteId));
    if (!lead) fail('HIGH', 'LEAD_MISSING', 'No existe el Lead de origen.');
    else {
      if (id(lead.convertedEventId) !== id(event) || id(lead.convertedCustomerId) !== id(customer)) fail('HIGH', 'LEAD_CONVERSION_BROKEN', 'Lead convertido no apunta al Event/Customer correctos.');
      if (lead.status !== 'converted') fail('MEDIUM', 'LEAD_STATUS_INCONSISTENT', `Lead status=${lead.status}.`);
      if (id(lead.salonId) !== id(event.salonId) || dateKey(lead.eventDate) !== day || amount(lead.guestCount) !== amount(event.guestCount)) fail('MEDIUM', 'LEAD_SNAPSHOT_MISMATCH', 'Lead contradice salón, fecha o invitados del evento.');
    }
    if (!quote) fail('HIGH', 'QUOTE_MISSING', 'No existe el Quote de origen.');
    else {
      if (id(quote.convertedEventId) !== id(event) || id(quote.convertedCustomerId) !== id(customer)) fail('HIGH', 'QUOTE_CONVERSION_BROKEN', 'Quote convertido no apunta al Event/Customer correctos.');
      if (quote.status !== 'converted' || !validDate(quote.sentAt) || !validDate(quote.acceptedAt)) fail('MEDIUM', 'QUOTE_LIFECYCLE_INCOMPLETE', 'Quote no está convertido o carece de sentAt/acceptedAt.');
      if (id(quote.salonId) !== id(event.salonId) || dateKey(quote.eventDate) !== day || amount(quote.guestCount) !== amount(event.guestCount) || quote.quoteMode !== event.quoteMode) fail('HIGH', 'QUOTE_EVENT_MISMATCH', 'Quote contradice salón, fecha, invitados o quoteMode del evento.');
      if (!approx(quote.totalAmount, event.finalAmount)) fail('HIGH', 'QUOTE_EVENT_TOTAL_MISMATCH', `Quote=${quote.totalAmount}; Event=${event.finalAmount}.`);
    }

    for (const message of auditResourcePlan({ guestCount: amount(event.guestCount), vegetarianCount: amount(event.vegetarianCount), veganCount: amount(event.veganCount), celiacCount: amount(event.celiacCount), lactoseIntolerantCount: amount(event.lactoseIntolerantCount), resourcePlanSnapshot: event.resourcePlanSnapshot ?? {} })) fail('HIGH', 'GUEST_RESOURCE_PLAN_INVALID', message);
    const guests: AnyRecord[] = event.resourcePlanSnapshot?.guestList?.guests ?? []; const tables: AnyRecord[] = event.resourcePlanSnapshot?.guestList?.tables ?? [];
    if (new Set(guests.map((guest) => guest.id)).size !== guests.length) fail('HIGH', 'GUEST_IDS_DUPLICATED', 'Hay IDs de invitados duplicados.');
    if (new Set(tables.map((table) => table.id)).size !== tables.length) fail('HIGH', 'TABLE_IDS_DUPLICATED', 'Hay IDs de mesa duplicados.');
    if (guests.some((guest) => !nonBlank(guest.fullName) || !guest.confirmed)) fail('HIGH', 'GUEST_INCOMPLETE', 'Hay invitados sin nombre o no confirmados.');
    const normalizedNames = guests.map((guest) => String(guest.fullName).trim().toLocaleLowerCase('es'));
    if (new Set(normalizedNames).size !== normalizedNames.length) fail('MEDIUM', 'GUEST_NAMES_DUPLICATED', 'Hay nombres de invitados duplicados.');
    if (tables.some((table) => !(amount(table.capacity) > 0))) fail('HIGH', 'TABLE_CAPACITY_INVALID', 'Hay mesas sin capacidad positiva.');
    const ageCounts = { adults: guests.filter((guest) => guest.ageGroup === 'adult').length, children: guests.filter((guest) => guest.ageGroup === 'child').length, teenagers: guests.filter((guest) => guest.ageGroup === 'teenager').length };
    if (ageCounts.adults !== amount(event.guestBreakdown?.adultsCount) || ageCounts.children !== amount(event.guestBreakdown?.childrenCount) || ageCounts.teenagers !== amount(event.guestBreakdown?.teenagersCount) || ageCounts.children + ageCounts.teenagers !== amount(event.guestBreakdown?.minorsCount)) fail('HIGH', 'GUEST_AGE_RECONCILIATION', 'Los agregados etarios no coinciden exactamente con la lista.');

    const commercial = event.commercialSnapshot ?? {}; const template = templatesById.get(id(commercial.packageTemplateId)); const rule = rulesById.get(id(commercial.venuePackageRuleId));
    if (!template || !template.active || template.deletedAt) fail('HIGH', 'PACKAGE_INVALID', 'PackageTemplate inexistente o inactivo.');
    if (!rule || !rule.active || rule.deletedAt || id(rule.salonId) !== id(event.salonId) || id(rule.packageTemplateId) !== id(template)) fail('HIGH', 'VENUE_PACKAGE_RULE_INVALID', 'VenuePackageRule inexistente, inactiva o incompatible.');
    const expectedTotal = expectedPackageTotal(commercial, amount(event.guestCount));
    if (!(expectedTotal > 0) || !approx(expectedTotal, event.finalAmount)) fail('HIGH', 'PACKAGE_PRICE_MISMATCH', `Precio recalculado=${expectedTotal}; Event=${event.finalAmount}.`);
    if (quote && !approx(expectedTotal, quote.totalAmount)) fail('HIGH', 'PACKAGE_QUOTE_PRICE_MISMATCH', `Precio recalculado=${expectedTotal}; Quote=${quote.totalAmount}.`);

    const activeContracts = eventContracts.filter((contract) => !['cancelled', 'superseded'].includes(contract.status));
    const approvedContracts = activeContracts.filter((contract) => contract.status === 'approved');
    if (approvedContracts.length !== 1) fail('CRITICAL', 'CONTRACT_APPROVED_COUNT', `Contratos aprobados vigentes=${approvedContracts.length}; esperado=1.`);
    const contract = approvedContracts[0] ?? activeContracts[0];
    if (contract) {
      if (id(contract.customerId) !== id(event.customerId) || id(contract.salonId) !== id(event.salonId) || id(contract.quoteId) !== id(quote)) fail('HIGH', 'CONTRACT_REFERENCES_MISMATCH', 'Contrato no coincide con Event/Customer/Salon/Quote.');
      if (!(amount(contract.versionNumber) >= 1) || !contract.customerSnapshot || !contract.eventSnapshot || !contract.commercialSnapshot || !contract.paymentPlanSnapshot) fail('HIGH', 'CONTRACT_SNAPSHOT_INCOMPLETE', 'Versionado o snapshots incompletos.');
      if (!approx(amount(contract.totalAmount) - amount(contract.paidAmount), contract.balanceAmount)) fail('CRITICAL', 'CONTRACT_ARITHMETIC', `total-paid=${amount(contract.totalAmount) - amount(contract.paidAmount)}; balance=${contract.balanceAmount}.`);
      if (!approx(contract.totalAmount, expectedTotal) || !approx(contract.balanceAmount, 0)) fail('CRITICAL', 'CONTRACT_FINANCIAL_MISMATCH', `total=${contract.totalAmount}; esperado=${expectedTotal}; balance=${contract.balanceAmount}.`);
    }
    if (!eventPayments.length) fail('HIGH', 'PAYMENTS_MISSING', 'No hay pagos para el evento.');
    const paymentKeys = eventPayments.map((payment) => `${id(payment.contractId)}|${payment.planInstallmentId || payment.receiptNumber || id(payment)}`);
    if (new Set(paymentKeys).size !== paymentKeys.length) fail('HIGH', 'PAYMENT_DUPLICATED', 'Hay pagos duplicados por cuota/comprobante.');
    for (const payment of eventPayments) {
      if (!(amount(payment.amount) > 0)) fail('HIGH', 'PAYMENT_AMOUNT_INVALID', `Payment ${id(payment)} sin amount positivo.`, { entity: `Payment:${id(payment)}` });
      if (payment.status === 'paid' && !validDate(payment.paidAt)) fail('HIGH', 'PAYMENT_PAID_AT_MISSING', `Payment ${id(payment)} paid sin paidAt.`, { entity: `Payment:${id(payment)}` });
      if (id(payment.eventId) !== id(event) || id(payment.contractId) !== id(contract) || id(payment.customerId) !== id(event.customerId) || id(payment.salonId) !== id(event.salonId)) fail('HIGH', 'PAYMENT_REFERENCES_MISMATCH', `Payment ${id(payment)} tiene referencias incoherentes.`, { entity: `Payment:${id(payment)}` });
    }
    if (eventPayments.some((payment) => payment.status === 'pending' && payment.affectsContractBalance)) fail('CRITICAL', 'PAYMENT_PENDING_BALANCE', 'Hay pagos pendientes que afectan saldo.');
    const revenue = eventPayments.reduce((sum, payment) => sum + signedPayment(payment), 0);
    if (contract && !approx(revenue, contract.paidAmount)) fail('CRITICAL', 'PAYMENTS_CONTRACT_RECONCILIATION', `Pagos=${revenue}; contract.paidAmount=${contract.paidAmount}.`);

    const assignmentsSnapshot: AnyRecord[] = event.resourcePlanSnapshot?.supplierAssignments ?? [];
    if (!assignmentsSnapshot.length) fail('HIGH', 'SUPPLIER_ASSIGNMENTS_MISSING', 'No hay proveedores asignados.');
    const assignmentIdsSnapshot = assignmentsSnapshot.map((assignment) => assignment.id);
    if (new Set(assignmentIdsSnapshot).size !== assignmentIdsSnapshot.length) fail('HIGH', 'SUPPLIER_ASSIGNMENT_DUPLICATED', 'Hay asignaciones de proveedor duplicadas.');
    for (const assignment of assignmentsSnapshot) {
      if (!suppliersById.has(id(assignment.supplierId)) || !nonBlank(assignment.serviceType) || !(amount(assignment.agreedAmount) > 0) || !['paid', 'cancelled'].includes(assignment.status)) fail('HIGH', 'SUPPLIER_ASSIGNMENT_INVALID', `Asignación ${assignment.id} inválida.`, { entity: `SupplierAssignment:${assignment.id}` });
      const matching = eventExpenses.filter((expense) => expense.sourceId === assignment.id && expense.sourceType === ExpenseSourceType.SUPPLIER_ASSIGNMENT);
      if (matching.length !== 1) fail('CRITICAL', 'SUPPLIER_EXPENSE_COUNT', `Asignación ${assignment.id} tiene ${matching.length} Expense(s).`, { entity: `SupplierAssignment:${assignment.id}` });
      else if (!approx(matching[0].amount, assignment.agreedAmount)) fail('HIGH', 'SUPPLIER_EXPENSE_AMOUNT', `Expense=${matching[0].amount}; asignación=${assignment.agreedAmount}.`, { entity: `Expense:${id(matching[0])}` });
    }
    for (const expense of eventExpenses) {
      if (id(expense.eventId) !== id(event) || id(expense.salonId) !== id(event.salonId) || !nonBlank(expense.description) || !(amount(expense.amount) > 0)) fail('HIGH', 'EXPENSE_INVALID', `Expense ${id(expense)} incompleto.`, { entity: `Expense:${id(expense)}` });
      if (expense.supplierId && !suppliersById.has(id(expense.supplierId))) fail('HIGH', 'EXPENSE_SUPPLIER_MISSING', `Expense ${id(expense)} apunta a proveedor inexistente.`, { entity: `Expense:${id(expense)}` });
      if (expense.status === ExpenseStatus.PENDING) fail('CRITICAL', 'EXPENSE_PENDING', `Expense ${id(expense)} sigue pendiente.`, { entity: `Expense:${id(expense)}` });
      if (expense.status === ExpenseStatus.PAID && !validDate(expense.paidAt)) fail('HIGH', 'EXPENSE_PAID_AT_MISSING', `Expense ${id(expense)} paid sin paidAt.`, { entity: `Expense:${id(expense)}` });
    }
    const expenseTotal = eventExpenses.filter((expense) => expense.status === ExpenseStatus.PAID).reduce((sum, expense) => sum + amount(expense.amount), 0);
    const profit = revenue - expenseTotal; const margin = revenue ? profit / revenue * 100 : 0;
    if (!expenseTotal) warn('PROFIT_ZERO_EXPENSES', 'El evento no tiene gastos pagados.');
    if (margin < 0) warn('PROFIT_NEGATIVE', `Margen negativo ${margin.toFixed(2)}%.`);
    if (margin > 95) warn('PROFIT_IMPLAUSIBLY_HIGH', `Margen mayor a 95%: ${margin.toFixed(2)}%.`);

    if (!eventAllocations.length) fail('HIGH', 'TABLEWARE_MISSING', 'No hay asignaciones de vajilla.');
    for (const allocation of eventAllocations) {
      if (!(amount(allocation.quantity) > 0) || allocation.eventDay !== day || id(allocation.salonId) !== id(event.salonId)) fail('HIGH', 'TABLEWARE_ALLOCATION_INVALID', `Allocation ${id(allocation)} inválida.`, { entity: `EventTablewareAllocation:${id(allocation)}` });
      if (allocation.source === 'salon_stock') {
        const stockItem = stockById.get(id(allocation.salonStockItemId));
        if (!stockItem || id(stockItem.salonId) !== id(event.salonId)) fail('CRITICAL', 'TABLEWARE_STOCK_REFERENCE', `Allocation ${id(allocation)} apunta a stock inexistente/otro salón.`, { entity: `SalonStockItem:${id(allocation.salonStockItemId)}` });
      } else if (allocation.source === 'external' && allocation.salonStockItemId) fail('MEDIUM', 'TABLEWARE_EXTERNAL_REFERENCE', 'Una asignación external no debe reservar stock físico.');
    }

    if (!eventAssignments.length) fail('HIGH', 'STAFF_MISSING', 'No hay staff asignado.');
    for (const assignment of eventAssignments) {
      const user = usersById.get(id(assignment.staffUserId));
      if (!user || !user.active || user.deletedAt) fail('HIGH', 'STAFF_USER_INVALID', `Staff ${id(assignment.staffUserId)} inexistente/inactivo.`, { entity: `User:${id(assignment.staffUserId)}` });
      if (id(assignment.salonId) !== id(event.salonId) || !staffSubroles.has(assignment.staffSubrole) || !validDate(assignment.shiftStart) || !validDate(assignment.shiftEnd) || new Date(assignment.shiftEnd) <= new Date(assignment.shiftStart)) fail('HIGH', 'STAFF_ASSIGNMENT_INVALID', `Assignment ${id(assignment)} inválida.`, { entity: `EventStaffAssignment:${id(assignment)}` });
      if (!finalStaffStatuses.has(assignment.status)) fail('CRITICAL', 'STAFF_ASSIGNMENT_OPEN', `Assignment ${id(assignment)} status=${assignment.status}.`, { entity: `EventStaffAssignment:${id(assignment)}` });
      const matchingSessions = eventSessions.filter((session) => id(session.assignmentId) === id(assignment));
      if (matchingSessions.length !== 1) fail('HIGH', 'ATTENDANCE_SESSION_COUNT', `Assignment ${id(assignment)} tiene ${matchingSessions.length} WorkSession(s).`, { entity: `EventStaffAssignment:${id(assignment)}` });
    }
    for (const session of eventSessions) {
      const matchingAssignment = eventAssignments.find((assignment) => id(assignment) === id(session.assignmentId));
      if (!matchingAssignment || id(session.userId) !== id(matchingAssignment.staffUserId) || id(session.salonId) !== id(event.salonId) || !validDate(session.startedAt) || !validDate(session.endedAt) || new Date(session.endedAt) <= new Date(session.startedAt) || !(amount(session.workedMinutes) > 0)) fail('HIGH', 'ATTENDANCE_INVALID', `WorkSession ${id(session)} inválida.`, { entity: `WorkSession:${id(session)}` });
      const sessionPunches = punchesBySession.get(id(session)) ?? [];
      if (sessionPunches.filter((punch) => punch.type === 'check_in').length !== 1 || sessionPunches.filter((punch) => punch.type === 'check_out').length !== 1) fail('HIGH', 'ATTENDANCE_PUNCH_COUNT', `WorkSession ${id(session)} no tiene exactamente un check-in/out.`, { entity: `WorkSession:${id(session)}` });
      if (amount(session.payableMinutes) > 18 * 60) warn('PAYROLL_HOURS_IMPLAUSIBLE', `WorkSession ${id(session)} supera 18 horas pagables.`);
    }

    if (currentPlans.length !== 1) fail('CRITICAL', 'PRODUCTION_CURRENT_COUNT', `Planes isCurrent=${currentPlans.length}; esperado=1.`);
    const plan = currentPlans[0]; const productionItems = plan ? itemsByPlan.get(id(plan)) ?? [] : [];
    if (plan) {
      if (plan.status !== 'closed') fail('CRITICAL', 'PRODUCTION_NOT_CLOSED', `ProductionPlan status=${plan.status}.`, { entity: `ProductionPlan:${id(plan)}` });
      if (id(plan.eventId) !== id(event) || id(plan.salonId) !== id(event.salonId) || id(plan.customerId) !== id(event.customerId) || id(plan.contractId) !== id(contract)) fail('HIGH', 'PRODUCTION_REFERENCES_MISMATCH', 'ProductionPlan tiene referencias incoherentes.');
      if (!productionItems.length) fail('CRITICAL', 'PRODUCTION_EMPTY', 'ProductionPlan actual no tiene items.');
      for (const item of productionItems) {
        if (!sectionsById.has(id(item.sectionId)) || !(amount(item.plannedQuantity) >= 0) || !approx(item.completedQuantity, item.plannedQuantity) || !finalProductionItemStatuses.has(item.status) || (item.status === 'checked' && (!item.ready || !item.checked))) fail('CRITICAL', 'PRODUCTION_ITEM_INCOMPLETE', `ProductionItem ${id(item)} no está reconciliado.`, { entity: `ProductionItem:${id(item)}` });
      }
    }
    if (eventClosures.length !== 1) fail('CRITICAL', 'CLOSURE_COUNT', `EventClosure=${eventClosures.length}; esperado=1.`);
    const closure = eventClosures[0];
    if (closure && [closure.operational?.status, closure.financial?.status, closure.administrative?.status].some((status) => status !== 'open')) fail('HIGH', 'CLOSURE_NOT_OPEN', 'Las tres etapas deben quedar abiertas para la prueba manual.');
    const closureBlockers: Record<ClosureStage, AnyRecord[]> = { operational: [], financial: [], administrative: [] };
    if (closure) {
      const sequentialState = { ...closure, operational: { status: 'closed' }, financial: { status: 'closed' }, administrative: { status: 'open' } };
      const sequentialChecks = await closureChecks(event, sequentialState);
      closureBlockers.operational = blockers(sequentialChecks.operational);
      closureBlockers.financial = blockers(sequentialChecks.financial);
      closureBlockers.administrative = blockers(sequentialChecks.administrative);
      for (const stage of ['operational', 'financial', 'administrative'] as ClosureStage[]) for (const blocker of closureBlockers[stage]) fail('CRITICAL', 'CLOSURE_BLOCKER', blocker.detail || blocker.label, { stage, entity: blocker.id });
    }
    eventAudits.push({ event, errors, warnings, revenue, expenses: expenseTotal, profit, margin, closureBlockers });
  }

  const eventById = valuesById(events);
  for (let leftIndex = 0; leftIndex < allJulyAssignments.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < allJulyAssignments.length; rightIndex += 1) {
    const left = allJulyAssignments[leftIndex]; const right = allJulyAssignments[rightIndex];
    if (id(left.eventId) === id(right.eventId) || id(left.staffUserId) !== id(right.staffUserId)) continue;
    if (new Date(left.shiftStart) < new Date(right.shiftEnd) && new Date(right.shiftStart) < new Date(left.shiftEnd)) {
      for (const assignment of [left, right]) { const audit = eventAudits.find((row) => id(row.event) === id(assignment.eventId)); if (audit) audit.errors.push(issueFor(audit.event, 'CRITICAL', 'STAFF_OVERLAP', `Staff ${id(assignment.staffUserId)} tiene turnos superpuestos.`, { entity: `EventStaffAssignment:${id(assignment)}` })); }
    }
  }
  const stockReservations = new Map<string, { quantity: number; rows: AnyRecord[] }>();
  for (const allocation of allJulyAllocations.filter((item) => item.source === 'salon_stock')) {
    const key = `${id(allocation.salonStockItemId)}|${allocation.eventDay}`; const bucket = stockReservations.get(key) ?? { quantity: 0, rows: [] };
    bucket.quantity += amount(allocation.quantity); bucket.rows.push(allocation); stockReservations.set(key, bucket);
  }
  for (const [key, reservation] of stockReservations) {
    const stockItem = stockById.get(key.split('|')[0]); const available = amount(stockItem?.currentQuantity);
    if (reservation.quantity > available) for (const allocation of reservation.rows) { const audit = eventAudits.find((row) => id(row.event) === id(allocation.eventId)); if (audit) audit.errors.push(issueFor(audit.event, 'CRITICAL', 'TABLEWARE_OVERBOOKED', `Reservado=${reservation.quantity}; stock=${available}; clave=${key}.`, { entity: `SalonStockItem:${id(allocation.salonStockItemId)}` })); }
  }

  const topLevelIssues: AuditIssue[] = [];
  const activeSalonIds = salons.filter((salon) => salon.active && !salon.deletedAt).map(id);
  const expectedEvents = JULY_2026_EVENT_DAYS.length * activeSalonIds.length;
  if (events.length !== expectedEvents) topLevelIssues.push(issueFor(undefined, 'CRITICAL', 'EVENT_COUNT_MISMATCH', `Eventos=${events.length}; esperado=${expectedEvents}.`));
  for (const salonId of activeSalonIds) for (const day of JULY_2026_EVENT_DAYS) if (!events.some((event) => id(event.salonId) === salonId && dateKey(event.eventDate) === day)) topLevelIssues.push(issueFor(undefined, 'CRITICAL', 'EVENT_DATE_MISSING', `Falta ${day} para salon ${salonId}.`));
  const duplicateEventSlots = events.map((event) => `${id(event.salonId)}|${dateKey(event.eventDate)}|${event.startTime}|${event.endTime}`);
  if (new Set(duplicateEventSlots).size !== duplicateEventSlots.length) topLevelIssues.push(issueFor(undefined, 'CRITICAL', 'EVENT_SLOT_DUPLICATED', 'Hay slots de salón/fecha/horario duplicados.'));
  for (const event of events) {
    const own = eventInterval(dateKey(event.eventDate), event.startTime, event.endTime);
    if (!own) continue;
    const conflict = lockedJulyEvents.find((candidate) => {
      if (id(candidate) === id(event) || id(candidate.salonId) !== id(event.salonId)) return false;
      const other = eventInterval(dateKey(candidate.eventDate), candidate.startTime, candidate.endTime);
      return other && own.start < other.end && other.start < own.end;
    });
    if (conflict) topLevelIssues.push(issueFor(event, 'CRITICAL', 'EVENT_VENUE_OVERLAP', `Se superpone con ${conflict.eventName || id(conflict)}.`, { entity: `Event:${id(conflict)}` }));
  }

  const reporting = await reportingReconciliation();
  for (const difference of reporting.differences) topLevelIssues.push(issueFor(undefined, 'HIGH', 'REPORTING_MISMATCH', difference));
  const counts: DatasetCounts = {
    events: events.length, customers: new Set(events.map((event) => id(event.customerId))).size, leads: new Set(leads.filter((lead) => eventById.has(id(lead.convertedEventId))).map(id)).size,
    quotes: new Set(quotes.filter((quote) => eventById.has(id(quote.convertedEventId))).map(id)).size, contracts: contracts.length, payments: payments.length,
    expenses: expenses.filter((expense) => expense.status !== ExpenseStatus.CANCELLED).length, suppliersUsed: new Set(expenses.map((expense) => id(expense.supplierId)).filter(Boolean)).size,
    staffAssignments: assignments.length, guests: events.reduce((sum, event) => sum + amount(event.resourcePlanSnapshot?.guestList?.guests?.length), 0),
    tables: events.reduce((sum, event) => sum + amount(event.resourcePlanSnapshot?.guestList?.tables?.length), 0), tableware: allocations.length,
    productionPlans: plans.length, productionItems: items.length, closures: closures.length,
  };
  const contracted = contracts.filter((contract) => contract.status === 'approved').reduce((sum, contract) => sum + amount(contract.totalAmount), 0);
  const collected = payments.reduce((sum, payment) => sum + signedPayment(payment), 0); const paidExpenses = expenses.filter((expense) => expense.status === ExpenseStatus.PAID).reduce((sum, expense) => sum + amount(expense.amount), 0);
  const profit = collected - paidExpenses;
  const issues = [...topLevelIssues, ...eventAudits.flatMap((audit) => audit.errors)]; const warnings = eventAudits.flatMap((audit) => audit.warnings);
  return { marker: JULY_2026_SEED_KEY, expectedDates: JULY_2026_EVENT_DAYS, eventAudits, issues, warnings, counts, financials: { contracted, collected, expenses: paidExpenses, profit, margin: collected ? profit / collected * 100 : 0, averageTicket: events.length ? contracted / events.length : 0 }, reporting, overall: issues.length ? 'FAIL' : 'PASS' };
}

function money(value: number): string { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(value); }
function passCount(result: July2026AuditResult, codePrefix: string): number { return result.eventAudits.filter((audit) => !audit.errors.some((issue) => issue.code.startsWith(codePrefix))).length; }

export function printJuly2026Audit(result: July2026AuditResult): void {
  const total = result.counts.events; const ready = (stage: ClosureStage) => result.eventAudits.filter((audit) => audit.closureBlockers[stage].length === 0).length;
  console.log('\nM&M EVENTOS — JULY 2026 DATASET AUDIT');
  console.log(`Marker: ${result.marker}`); console.log(`Seed events: ${total}`);
  console.log(`Event integrity: ${result.eventAudits.filter((audit) => !audit.errors.length).length}/${total} PASS`);
  console.log(`Customers: ${passCount(result, 'EVENT_CUSTOMER')}/${total} PASS`); console.log(`Guest lists: ${passCount(result, 'GUEST_')}/${total} PASS`);
  console.log(`Contracts: ${passCount(result, 'CONTRACT_')}/${total} PASS`); console.log(`Payments: ${passCount(result, 'PAYMENT')}/${total} PASS`);
  console.log(`Suppliers/expenses: ${result.eventAudits.filter((audit) => !audit.errors.some((issue) => issue.code.startsWith('SUPPLIER') || issue.code.startsWith('EXPENSE'))).length}/${total} PASS`);
  console.log(`Tableware: ${passCount(result, 'TABLEWARE_')}/${total} PASS`); console.log(`Staff/attendance: ${result.eventAudits.filter((audit) => !audit.errors.some((issue) => issue.code.startsWith('STAFF') || issue.code.startsWith('ATTENDANCE'))).length}/${total} PASS`);
  console.log(`Production closed: ${passCount(result, 'PRODUCTION_')}/${total} PASS`);
  console.log(`Operational closure ready: ${ready('operational')}/${total} PASS`); console.log(`Financial closure ready: ${ready('financial')}/${total} PASS`); console.log(`Administrative closure ready: ${ready('administrative')}/${total} PASS`);
  console.log(`Reporting reconciliation: ${result.reporting.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Reporting metrics (Mongo): ${JSON.stringify(Object.fromEntries(Object.entries(result.reporting.expected).map(([key, value]) => [key, Number(value.toFixed(2))])))}`);
  console.log(`Counts: ${JSON.stringify(result.counts)}`);
  console.log(`Financials: contracted=${money(result.financials.contracted)} collected=${money(result.financials.collected)} expenses=${money(result.financials.expenses)} profit=${money(result.financials.profit)} margin=${result.financials.margin.toFixed(2)}% averageTicket=${money(result.financials.averageTicket)}`);
  if (result.eventAudits[0]) console.log(`Manual review: ${result.eventAudits[0].event.eventName} | /admin/events/${id(result.eventAudits[0].event)}`);
  console.log(`Critical errors: ${result.issues.filter((issue) => issue.severity === 'CRITICAL').length}`); console.log(`Errors total: ${result.issues.length}`); console.log(`Warnings: ${result.warnings.length}`);
  for (const issue of [...result.issues, ...result.warnings]) console.log(`${issue.severity} | ${issue.eventName || 'DATASET'} | ${issue.stage || '-'} | ${issue.code} | ${issue.entity || '-'} | ${issue.message}`);
  console.log(`\nOVERALL: ${result.overall}`);
}

export async function main(): Promise<void> {
  assertReadOnlyTarget();
  await connectDatabase();
  try { const result = await auditJuly2026FullEvents(); printJuly2026Audit(result); if (result.overall === 'FAIL') process.exitCode = 1; }
  finally { await disconnectDatabase(); }
}

if (require.main === module) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
