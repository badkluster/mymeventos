import type { Request } from 'express';
import { Permission } from '@mym/shared';
import { CalendarItem, Contract, Event, EventStaffAssignment, Lead, Payment, Quote } from '../crm/crm.models';
import { Expense, ExpenseCategory } from '../operations/operations.models';
import { ProductionPlan } from '../production/production.models';
import { Salon } from '../salons/salon.model';
import { userHasPermission } from '../../middlewares/auth';
import { dashboardMetricDefinitions, type MetricDefinition } from './metric-catalog';
import { parseReportPeriod, periodMatch, REPORT_TIME_ZONE, resolveReportScope } from './report-filter';

type MetricValue = MetricDefinition & {
  value: number | null;
  previousValue: number | null;
  changePercentage: number | null;
  available: boolean;
};

function changePercentage(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

async function sum(model: any, query: Record<string, unknown>, field: string): Promise<number> {
  const result = await model.aggregate([{ $match: query }, { $group: { _id: null, value: { $sum: `$${field}` } } }]);
  return Number(result[0]?.value ?? 0);
}

function signedPaymentExpression() {
  return { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] };
}

async function collectedAmount(query: Record<string, unknown>): Promise<number> {
  const result = await Payment.aggregate([
    { $match: { ...query, status: 'paid', affectsContractBalance: true } },
    { $group: { _id: null, value: { $sum: signedPaymentExpression() } } },
  ]);
  return Math.max(0, Number(result[0]?.value ?? 0));
}

function activeEventQuery(): Record<string, unknown> {
  return { status: { $nin: ['cancelled', 'lost'] }, deletedAt: null };
}

function metric(definition: MetricDefinition, value: number, previousValue: number): MetricValue {
  return { ...definition, value, previousValue, changePercentage: changePercentage(value, previousValue), available: true };
}

async function categoryBreakdown(query: Record<string, unknown>) {
  const raw = await Expense.aggregate([
    { $match: query },
    { $group: { _id: { categoryId: '$categoryId', legacy: '$category' }, value: { $sum: '$amount' } } },
    { $sort: { value: -1 } },
  ]);
  const ids = raw.map((item: any) => item._id?.categoryId).filter(Boolean);
  const categories = await ExpenseCategory.find({ _id: { $in: ids }, deletedAt: null }).select('name').lean();
  const names = new Map(categories.map((item: any) => [item._id.toString(), item.name]));
  return raw.map((item: any) => {
    const id = item._id?.categoryId?.toString?.();
    return {
      id: id || item._id?.legacy || 'uncategorized',
      label: id ? names.get(id) || 'Categoría no disponible' : item._id?.legacy || 'Sin categoría',
      value: Number(item.value || 0),
    };
  });
}

export async function dashboardSummary(request: Request) {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const salon = scope.match();
  const current = (field: string) => ({ deletedAt: null, ...salon, ...periodMatch(period, field) });
  const previous = (field: string) => ({ deletedAt: null, ...salon, ...periodMatch(period, field, true) });
  const now = new Date();
  const upcomingUntil = new Date(now.getTime() + 30 * 86_400_000);
  const pendingLeadStatuses = ['new', 'contacted', 'follow_up', 'quote_sent', 'negotiation'];

  const [
    leadsNew, leadsNewPrevious, leadsPending,
    quotesSent, quotesSentPrevious, quotesAccepted, quotesAcceptedPrevious,
    sentQuotesAccepted, sentQuotesAcceptedPrevious,
    eventsConfirmed, eventsConfirmedPrevious, eventsUpcoming,
    contractsTotal, contractsTotalPrevious,
    collected, collectedPrevious, overdue,
    expensesPaid, expensesPaidPrevious,
    productionEvents, previousProductionEvents,
    funnel, eventsBySalonRaw, eventsByType, leadsBySource,
  ] = await Promise.all([
    Lead.countDocuments(current('createdAt')),
    Lead.countDocuments(previous('createdAt')),
    Lead.countDocuments({ deletedAt: null, ...salon, status: { $in: pendingLeadStatuses } }),
    Quote.countDocuments(current('sentAt')),
    Quote.countDocuments(previous('sentAt')),
    Quote.countDocuments(current('acceptedAt')),
    Quote.countDocuments(previous('acceptedAt')),
    Quote.countDocuments({ ...current('sentAt'), status: { $in: ['accepted', 'converted'] } }),
    Quote.countDocuments({ ...previous('sentAt'), status: { $in: ['accepted', 'converted'] } }),
    Event.countDocuments({ ...current('eventDate'), status: 'confirmed' }),
    Event.countDocuments({ ...previous('eventDate'), status: 'confirmed' }),
    Event.countDocuments({ ...activeEventQuery(), ...salon, eventDate: { $gte: now, $lt: upcomingUntil } }),
    sum(Contract, { ...current('approvedAt'), status: 'approved' }, 'totalAmount'),
    sum(Contract, { ...previous('approvedAt'), status: 'approved' }, 'totalAmount'),
    collectedAmount(current('paidAt')),
    collectedAmount(previous('paidAt')),
    sum(Payment, { deletedAt: null, ...salon, status: 'pending', affectsContractBalance: true, dueDate: { $lt: now } }, 'amount'),
    sum(Expense, { ...current('paidAt'), status: 'paid' }, 'amount'),
    sum(Expense, { ...previous('paidAt'), status: 'paid' }, 'amount'),
    Event.find({ ...current('eventDate'), ...activeEventQuery() }).select('_id').lean(),
    Event.find({ ...previous('eventDate'), ...activeEventQuery() }).select('_id').lean(),
    Promise.all([
      Lead.countDocuments(current('createdAt')),
      Quote.countDocuments(current('createdAt')),
      Quote.countDocuments(current('acceptedAt')),
      Contract.countDocuments({ ...current('approvedAt'), status: 'approved' }),
      Event.countDocuments({ ...current('eventDate'), status: 'confirmed' }),
    ]),
    Event.aggregate([{ $match: { ...current('eventDate'), status: { $nin: ['cancelled', 'lost'] } } }, { $group: { _id: '$salonId', value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
    Event.aggregate([{ $match: { ...current('eventDate'), status: { $nin: ['cancelled', 'lost'] } } }, { $group: { _id: { $ifNull: ['$eventType', 'other'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
    Lead.aggregate([{ $match: current('createdAt') }, { $group: { _id: { $ifNull: ['$source', 'other'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }]),
  ]);

  const [currentPlans, previousPlans, expensesByCategory] = await Promise.all([
    ProductionPlan.find({ deletedAt: null, isCurrent: true, eventId: { $in: productionEvents.map((event: any) => event._id) } }).select('eventId status').lean(),
    ProductionPlan.find({ deletedAt: null, isCurrent: true, eventId: { $in: previousProductionEvents.map((event: any) => event._id) } }).select('eventId status').lean(),
    categoryBreakdown({ ...current('paidAt'), status: 'paid' }),
  ]);
  const currentPlanMap = new Map(currentPlans.map((plan: any) => [plan.eventId.toString(), plan.status]));
  const previousPlanMap = new Map(previousPlans.map((plan: any) => [plan.eventId.toString(), plan.status]));
  const definitionById = new Map(dashboardMetricDefinitions.map((item) => [item.id, item]));
  const pendingProduction = productionEvents.filter((event: any) => !['checked', 'closed'].includes(currentPlanMap.get(event._id.toString()) ?? '')).length;
  const previousPendingProduction = previousProductionEvents.filter((event: any) => !['checked', 'closed'].includes(previousPlanMap.get(event._id.toString()) ?? '')).length;
  const values: Record<string, [number, number]> = {
    'leads.new': [leadsNew, leadsNewPrevious],
    'leads.pending': [leadsPending, 0],
    'quotes.sent': [quotesSent, quotesSentPrevious],
    'quotes.accepted': [quotesAccepted, quotesAcceptedPrevious],
    'quotes.acceptanceRate': [quotesSent ? (sentQuotesAccepted / quotesSent) * 100 : 0, quotesSentPrevious ? (sentQuotesAcceptedPrevious / quotesSentPrevious) * 100 : 0],
    'events.confirmed': [eventsConfirmed, eventsConfirmedPrevious],
    'events.upcoming': [eventsUpcoming, 0],
    'contracts.total': [contractsTotal, contractsTotalPrevious],
    'payments.collected': [collected, collectedPrevious],
    'payments.overdue': [overdue, 0],
    'expenses.paid': [expensesPaid, expensesPaidPrevious],
    'production.pending': [pendingProduction, previousPendingProduction],
  };
  const financialVisible = userHasPermission(request.user!, Permission.DASHBOARD_FINANCIAL_VIEW);
  const metrics = Object.entries(values).flatMap(([id, [value, previousValue]]) => {
    const definition = definitionById.get(id);
    if (!definition || (definition.financial && !financialVisible)) return [];
    return [metric(definition, Number(value.toFixed(2)), Number(previousValue.toFixed(2)))];
  });
  const salonIds = eventsBySalonRaw.map((item: any) => item._id).filter(Boolean);
  const salons = await Salon.find({ _id: { $in: salonIds } }).select('name').lean();
  const salonNames = new Map(salons.map((item: any) => [item._id.toString(), item.name]));

  return {
    meta: {
      period: { from: period.fromDate, to: period.toDate, previousFrom: period.previousFromDate, previousTo: period.previousToDate },
      timeZone: REPORT_TIME_ZONE,
      selectedSalonId: scope.selectedSalonId,
      lastUpdatedAt: new Date().toISOString(),
      financialVisible,
    },
    metrics,
    funnel: [
      { id: 'leads', label: 'Leads creados', value: funnel[0] },
      { id: 'quotes', label: 'Presupuestos creados', value: funnel[1] },
      { id: 'acceptedQuotes', label: 'Presupuestos aceptados', value: funnel[2] },
      { id: 'contracts', label: 'Contratos aprobados', value: funnel[3] },
      { id: 'confirmedEvents', label: 'Eventos confirmados', value: funnel[4] },
    ],
    breakdowns: {
      eventsBySalon: eventsBySalonRaw.map((item: any) => ({ id: item._id?.toString() ?? 'without-salon', label: item._id ? salonNames.get(item._id.toString()) ?? 'Salón no disponible' : 'Sin salón', value: item.value })),
      eventsByType: eventsByType.map((item: any) => ({ id: item._id, label: item._id, value: item.value })),
      leadsBySource: leadsBySource.map((item: any) => ({ id: item._id, label: item._id, value: item.value })),
      expensesByCategory: financialVisible ? expensesByCategory : [],
    },
  };
}

export async function dashboardAgenda(request: Request) {
  const scope = resolveReportScope(request);
  const now = new Date();
  const argentinaToday = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${argentinaToday}T03:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  const salon = scope.match();
  const [calendarItems, events, payments] = await Promise.all([
    CalendarItem.find({
      deletedAt: null,
      ...salon,
      startAt: { $gte: start, $lt: end },
      status: { $ne: 'cancelled' },
      $or: [{ visibility: 'shared' }, { createdBy: request.user!.id }],
    }).populate('salonId', 'name').populate('assignedToUserId', 'firstName lastName fullName').populate('customerId', 'fullName').sort({ startAt: 1 }).lean(),
    Event.find({ deletedAt: null, ...salon, eventDate: { $gte: start, $lt: end }, status: { $nin: ['cancelled', 'lost'] } }).populate('salonId', 'name').populate('customerId', 'fullName').sort({ startTime: 1 }).lean(),
    Payment.find({ deletedAt: null, ...salon, dueDate: { $gte: start, $lt: end }, status: 'pending' }).populate('salonId', 'name').populate('customerId', 'fullName').sort({ dueDate: 1 }).lean(),
  ]);
  const calendarEventIds = new Set(calendarItems.map((item: any) => item.eventId?.toString()).filter(Boolean));
  const items = [
    ...calendarItems.map((item: any) => ({
      id: item._id.toString(), type: item.type, title: item.title, at: item.startAt, salon: item.salonId?.name, customer: item.customerId?.fullName,
      responsible: item.assignedToUserId?.fullName || [item.assignedToUserId?.firstName, item.assignedToUserId?.lastName].filter(Boolean).join(' '),
      status: item.status, priority: item.priority, href: item.eventId ? `/admin/events/${item.eventId}` : '/admin/calendar',
    })),
    ...events.filter((event: any) => !calendarEventIds.has(event._id.toString())).map((event: any) => ({
      id: event._id.toString(), type: 'event', title: event.eventName || event.eventType || 'Evento', at: event.eventDate, time: event.startTime,
      salon: event.salonId?.name, customer: event.customerId?.fullName, status: event.status, priority: 'high', href: `/admin/events/${event._id}`,
    })),
    ...payments.map((payment: any) => ({
      id: payment._id.toString(), type: 'payment_window', title: `Vence ${payment.paymentNumber}`, at: payment.dueDate,
      salon: payment.salonId?.name, customer: payment.customerId?.fullName, status: payment.status, priority: 'high', amount: payment.amount, href: `/admin/payments/${payment._id}`,
    })),
  ].sort((left: any, right: any) => new Date(left.at).getTime() - new Date(right.at).getTime());
  return { date: argentinaToday, timeZone: REPORT_TIME_ZONE, items };
}

export async function dashboardAlerts(request: Request) {
  const scope = resolveReportScope(request);
  const now = new Date();
  const until = new Date(now.getTime() + 45 * 86_400_000);
  const salon = scope.match();
  const [events, overduePayments] = await Promise.all([
    Event.find({ ...activeEventQuery(), ...salon, eventDate: { $gte: now, $lt: until } }).populate('salonId', 'name').populate('customerId', 'fullName').sort({ eventDate: 1 }).limit(120).lean(),
    Payment.find({ deletedAt: null, ...salon, status: 'pending', affectsContractBalance: true, dueDate: { $lt: now } }).populate('customerId', 'fullName').populate('eventId', 'eventName').sort({ dueDate: 1 }).limit(100).lean(),
  ]);
  const eventIds = events.map((event: any) => event._id);
  const [contracts, staffCounts, productionPlans] = await Promise.all([
    Contract.find({ deletedAt: null, eventId: { $in: eventIds }, status: { $nin: ['cancelled', 'superseded'] } }).select('eventId status paidAmount').lean(),
    EventStaffAssignment.aggregate([{ $match: { eventId: { $in: eventIds }, deletedAt: null, status: { $nin: ['cancelled', 'no_show'] } } }, { $group: { _id: '$eventId', value: { $sum: 1 } } }]),
    ProductionPlan.find({ deletedAt: null, isCurrent: true, eventId: { $in: eventIds } }).select('eventId status').lean(),
  ]);
  const contractByEvent = new Map(contracts.map((contract: any) => [contract.eventId.toString(), contract]));
  const staffByEvent = new Map(staffCounts.map((item: any) => [item._id.toString(), item.value]));
  const productionByEvent = new Map(productionPlans.map((item: any) => [item.eventId.toString(), item.status]));
  const alerts: any[] = overduePayments.map((payment: any) => ({
    id: `payment-overdue-${payment._id}`, severity: 'critical', entityType: 'Payment', entityId: payment._id.toString(),
    title: 'Cuota vencida', description: `${payment.customerId?.fullName || 'Cliente'} tiene un pago vencido por $ ${Number(payment.amount || 0).toLocaleString('es-AR')}.`,
    dueAt: payment.dueDate, recommendedAction: 'Registrar el cobro o contactar al cliente.', href: `/admin/payments/${payment._id}`,
  }));
  for (const event of events as any[]) {
    const id = event._id.toString();
    const common = { entityType: 'Event', entityId: id, dueAt: event.eventDate, salon: event.salonId?.name, href: `/admin/events/${id}` };
    const contract: any = contractByEvent.get(id);
    if (!contract) alerts.push({ id: `event-contract-${id}`, severity: 'critical', title: 'Evento sin contrato', description: `${event.eventName || 'El evento'} no tiene contrato activo.`, recommendedAction: 'Generar y aprobar el contrato.', ...common });
    else if (contract.status !== 'approved') alerts.push({ id: `event-contract-approval-${id}`, severity: 'high', title: 'Contrato pendiente de aprobación', description: `${event.eventName || 'El evento'} tiene el contrato en estado ${contract.status}.`, recommendedAction: 'Revisar y aprobar el contrato.', ...common });
    if (!contract?.paidAmount) alerts.push({ id: `event-deposit-${id}`, severity: 'high', title: 'Evento sin seña registrada', description: `${event.eventName || 'El evento'} no tiene cobros registrados en el contrato.`, recommendedAction: 'Registrar o verificar la seña.', ...common });
    if (!event.guestCount) alerts.push({ id: `event-guests-${id}`, severity: 'medium', title: 'Cantidad final de invitados pendiente', description: `${event.eventName || 'El evento'} no tiene cantidad de invitados.`, recommendedAction: 'Confirmar la cantidad con el cliente.', ...common });
    if (!event.menuSnapshot && !event.resourcePlanSnapshot?.guestList?.notes) alerts.push({ id: `event-menu-${id}`, severity: 'medium', title: 'Evento sin menú definido', description: `${event.eventName || 'El evento'} no tiene información de menú.`, recommendedAction: 'Completar el menú y restricciones.', ...common });
    if (!staffByEvent.get(id)) alerts.push({ id: `event-staff-${id}`, severity: 'medium', title: 'Evento sin personal asignado', description: `${event.eventName || 'El evento'} no tiene staff asignado.`, recommendedAction: 'Asignar responsables y turnos.', ...common });
    const productionStatus = productionByEvent.get(id);
    if (!productionStatus) alerts.push({ id: `event-production-${id}`, severity: 'medium', title: 'Evento sin producción generada', description: `${event.eventName || 'El evento'} no tiene un plan de producción.`, recommendedAction: 'Generar la producción del evento.', href: '/admin/production?generate=1', entityType: 'Event', entityId: id, dueAt: event.eventDate, salon: event.salonId?.name });
    else if (!['checked', 'closed'].includes(productionStatus)) alerts.push({ id: `event-production-incomplete-${id}`, severity: 'medium', title: 'Producción incompleta', description: `${event.eventName || 'El evento'} tiene producción en estado ${productionStatus}.`, recommendedAction: 'Completar y chequear los ítems pendientes.', href: '/admin/production', entityType: 'Event', entityId: id, dueAt: event.eventDate, salon: event.salonId?.name });
  }
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((left, right) => (severityOrder[left.severity] ?? 9) - (severityOrder[right.severity] ?? 9) || new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime());
  return { generatedAt: new Date().toISOString(), items: alerts.slice(0, 100) };
}
