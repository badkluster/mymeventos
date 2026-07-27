import type { Request } from 'express';
import { Permission } from '@mym/shared';
import { ApiError } from '../../middlewares/errorHandler';
import { userHasPermission } from '../../middlewares/auth';
import { Expense, ExpenseCategory } from '../operations/operations.models';
import { Contract, Event, EventStaffAssignment, Lead, Payment, Quote } from '../crm/crm.models';
import { parseReportPeriod, periodMatch, resolveReportScope } from './report-filter';
import { ProductionPlan } from '../production/production.models';

type Column = { key: string; label: string; format?: 'date' | 'currency' | 'number' | 'status'; linkKey?: string };
type ReportDefinition = {
  key: string;
  group: string;
  title: string;
  description: string;
  permission: Permission;
  columns: Column[];
};

export const reportDefinitions: ReportDefinition[] = [
  {
    key: 'leads', group: 'Comercial', title: 'Leads', description: 'Consultas, origen, responsables y evolución comercial.', permission: Permission.REPORTS_COMMERCIAL_READ,
    columns: [
      { key: 'createdAt', label: 'Alta', format: 'date' }, { key: 'name', label: 'Lead', linkKey: 'href' }, { key: 'salon', label: 'Salón' },
      { key: 'source', label: 'Origen', format: 'status' }, { key: 'status', label: 'Estado', format: 'status' }, { key: 'responsible', label: 'Responsable' },
      { key: 'eventType', label: 'Tipo de evento' }, { key: 'eventDate', label: 'Fecha estimada', format: 'date' }, { key: 'guestCount', label: 'Invitados', format: 'number' },
    ],
  },
  {
    key: 'quotes', group: 'Comercial', title: 'Presupuestos', description: 'Propuestas emitidas, importes y aceptación.', permission: Permission.REPORTS_COMMERCIAL_READ,
    columns: [
      { key: 'createdAt', label: 'Alta', format: 'date' }, { key: 'number', label: 'Número', linkKey: 'href' }, { key: 'customer', label: 'Cliente' },
      { key: 'salon', label: 'Salón' }, { key: 'eventType', label: 'Tipo de evento' }, { key: 'eventDate', label: 'Fecha del evento', format: 'date' },
      { key: 'status', label: 'Estado', format: 'status' }, { key: 'package', label: 'Paquete' }, { key: 'amount', label: 'Importe', format: 'currency' },
      { key: 'sentAt', label: 'Enviado', format: 'date' }, { key: 'acceptedAt', label: 'Aceptado', format: 'date' },
    ],
  },
  {
    key: 'events', group: 'Operación', title: 'Eventos', description: 'Estado integral, invitados y pendientes operativos.', permission: Permission.REPORTS_EVENTS_READ,
    columns: [
      { key: 'eventDate', label: 'Fecha', format: 'date' }, { key: 'name', label: 'Evento', linkKey: 'href' }, { key: 'customer', label: 'Cliente' },
      { key: 'salon', label: 'Salón' }, { key: 'eventType', label: 'Tipo' }, { key: 'status', label: 'Estado', format: 'status' },
      { key: 'guestCount', label: 'Invitados', format: 'number' }, { key: 'contractStatus', label: 'Contrato', format: 'status' },
      { key: 'paidAmount', label: 'Cobrado', format: 'currency' }, { key: 'overdueAmount', label: 'Vencido', format: 'currency' },
      { key: 'staffCount', label: 'Staff', format: 'number' }, { key: 'productionStatus', label: 'Producción', format: 'status' },
    ],
  },
  {
    key: 'contracts', group: 'Finanzas', title: 'Contratos', description: 'Valor contratado, cobranzas, saldos y vencimientos.', permission: Permission.REPORTS_CONTRACTS_READ,
    columns: [
      { key: 'createdAt', label: 'Alta', format: 'date' }, { key: 'number', label: 'Contrato', linkKey: 'href' }, { key: 'customer', label: 'Cliente' },
      { key: 'event', label: 'Evento' }, { key: 'eventDate', label: 'Fecha del evento', format: 'date' }, { key: 'salon', label: 'Salón' },
      { key: 'status', label: 'Estado', format: 'status' }, { key: 'approvedAt', label: 'Aprobación', format: 'date' },
      { key: 'totalAmount', label: 'Contratado', format: 'currency' }, { key: 'depositAmount', label: 'Seña', format: 'currency' },
      { key: 'paidAmount', label: 'Cobrado', format: 'currency' }, { key: 'balanceAmount', label: 'Saldo', format: 'currency' },
      { key: 'overdueAmount', label: 'Vencido', format: 'currency' }, { key: 'installments', label: 'Cuotas', format: 'number' },
      { key: 'nextDueDate', label: 'Próximo vencimiento', format: 'date' },
    ],
  },
  {
    key: 'payments', group: 'Finanzas', title: 'Pagos y cobranzas', description: 'Movimientos, cuotas, medios y vencimientos.', permission: Permission.REPORTS_PAYMENTS_READ,
    columns: [
      { key: 'date', label: 'Fecha', format: 'date' }, { key: 'number', label: 'Movimiento', linkKey: 'href' }, { key: 'customer', label: 'Cliente' },
      { key: 'event', label: 'Evento' }, { key: 'salon', label: 'Salón' }, { key: 'type', label: 'Tipo', format: 'status' },
      { key: 'method', label: 'Medio', format: 'status' }, { key: 'status', label: 'Estado', format: 'status' }, { key: 'dueDate', label: 'Vencimiento', format: 'date' },
      { key: 'amount', label: 'Importe', format: 'currency' }, { key: 'receipt', label: 'Comprobante' },
    ],
  },
  {
    key: 'expenses', group: 'Finanzas', title: 'Gastos', description: 'Costos por fecha efectiva, categoría, salón y evento.', permission: Permission.REPORTS_EXPENSES_READ,
    columns: [
      { key: 'date', label: 'Fecha', format: 'date' }, { key: 'description', label: 'Concepto' }, { key: 'category', label: 'Categoría', format: 'status' },
      { key: 'salon', label: 'Salón' }, { key: 'event', label: 'Evento' }, { key: 'supplier', label: 'Proveedor' },
      { key: 'status', label: 'Estado', format: 'status' }, { key: 'amount', label: 'Importe', format: 'currency' },
    ],
  },
];

function entityName(value: any, fallback = 'Sin datos'): string {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value.fullName || value.name || value.eventName || value.eventType || value.companyName || fallback;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pagination(request: Request, exportAll: boolean) {
  if (exportAll) return { page: 1, limit: 10_000, skip: 0 };
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(request.query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
}

function sort(request: Request, allowed: string[], fallback: string) {
  const requested = String(request.query.sortBy || fallback);
  const sortBy = allowed.includes(requested) ? requested : fallback;
  const sortOrder = request.query.sortOrder === 'asc' ? 1 : -1;
  return { [sortBy]: sortOrder as 1 | -1 };
}

function commonMeta(definition: ReportDefinition, request: Request, totalItems: number, page: number, limit: number, attribution?: string) {
  const period = parseReportPeriod(request.query);
  return {
    report: { key: definition.key, title: definition.title, description: definition.description },
    period: { from: period.fromDate, to: period.toDate, previousFrom: period.previousFromDate, previousTo: period.previousToDate },
    filters: Object.fromEntries(Object.entries(request.query).filter(([, value]) => typeof value === 'string' && value)),
    attribution,
    generatedAt: new Date().toISOString(),
    page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)),
    hasNextPage: page * limit < totalItems, hasPreviousPage: page > 1,
  };
}

function ensureReportAccess(request: Request, key: string) {
  const definition = reportDefinitions.find((item) => item.key === key);
  if (!definition) throw new ApiError(404, 'REPORT_NOT_FOUND', 'El reporte solicitado no existe.');
  if (!userHasPermission(request.user!, definition.permission)) throw new ApiError(403, 'FORBIDDEN');
  return definition;
}

function range(period: ReturnType<typeof parseReportPeriod>) {
  return { $gte: period.from, $lt: period.toExclusive };
}

async function leadsReport(request: Request, definition: ReportDefinition, exportAll: boolean) {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const { page, limit, skip } = pagination(request, exportAll);
  const search = String(request.query.search || '').trim();
  const query: any = { deletedAt: null, ...scope.match('salonId'), ...periodMatch(period, 'createdAt') };
  if (request.query.status) query.status = String(request.query.status);
  if (request.query.source) query.source = String(request.query.source);
  if (request.query.eventType) query.eventType = String(request.query.eventType);
  if (request.query.responsibleId) query.assignedUserId = String(request.query.responsibleId);
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    query.$or = [{ fullName: regex }, { email: regex }, { phone: regex }, { eventType: regex }];
  }
  const [documents, totalItems, groupedStatus, groupedSource] = await Promise.all([
    Lead.find(query).populate('salonId', 'name').populate('assignedUserId', 'firstName lastName fullName').sort(sort(request, ['createdAt', 'eventDate', 'status'], 'createdAt')).skip(skip).limit(limit).lean(),
    Lead.countDocuments(query),
    Lead.aggregate([{ $match: query }, { $group: { _id: '$status', value: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: query }, { $group: { _id: '$source', value: { $sum: 1 } } }]),
  ]);
  const converted = groupedStatus.filter((item: any) => ['converted', 'won'].includes(item._id)).reduce((sum: number, item: any) => sum + item.value, 0);
  return {
    columns: definition.columns,
    rows: documents.map((item: any) => ({
      id: item._id.toString(), href: `/admin/leads/${item._id}`, createdAt: item.createdAt, name: item.fullName || [item.firstName, item.lastName].filter(Boolean).join(' ') || 'Sin nombre',
      salon: entityName(item.salonId, 'Sin salón'), source: item.source, status: item.status, responsible: entityName(item.assignedUserId, 'Sin asignar'),
      eventType: item.eventType || 'Sin especificar', eventDate: item.eventDate, guestCount: item.guestCount ?? 0,
    })),
    summary: [
      { id: 'total', label: 'Leads', value: totalItems, format: 'number' },
      { id: 'new', label: 'Nuevos', value: groupedStatus.find((item: any) => item._id === 'new')?.value ?? 0, format: 'number' },
      { id: 'converted', label: 'Convertidos', value: converted, format: 'number' },
      { id: 'conversion', label: 'Conversión', value: totalItems ? (converted / totalItems) * 100 : 0, format: 'percentage' },
    ],
    breakdowns: { status: groupedStatus, source: groupedSource },
    meta: commonMeta(definition, request, totalItems, page, limit, 'createdAt'),
  };
}

async function quotesReport(request: Request, definition: ReportDefinition, exportAll: boolean) {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const { page, limit, skip } = pagination(request, exportAll);
  const query: any = { deletedAt: null, ...scope.match(), ...periodMatch(period, 'createdAt') };
  if (request.query.status) query.status = String(request.query.status);
  if (request.query.eventType) query.eventType = String(request.query.eventType);
  const search = String(request.query.search || '').trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    query.$or = [{ quoteNumber: regex }, { contactName: regex }, { email: regex }, { packageName: regex }];
  }
  const [documents, totalItems, totals, groupedStatus] = await Promise.all([
    Quote.find(query).populate('salonId', 'name').populate('customerId', 'fullName').sort(sort(request, ['createdAt', 'eventDate', 'totalAmount', 'status'], 'createdAt')).skip(skip).limit(limit).lean(),
    Quote.countDocuments(query),
    Quote.aggregate([{ $match: query }, { $group: { _id: null, amount: { $sum: '$totalAmount' }, acceptedAmount: { $sum: { $cond: [{ $in: ['$status', ['accepted', 'converted']] }, '$totalAmount', 0] } }, accepted: { $sum: { $cond: [{ $in: ['$status', ['accepted', 'converted']] }, 1, 0] } }, sent: { $sum: { $cond: [{ $ne: ['$sentAt', null] }, 1, 0] } } } }]),
    Quote.aggregate([{ $match: query }, { $group: { _id: '$status', value: { $sum: 1 } } }]),
  ]);
  const aggregate = totals[0] ?? {};
  return {
    columns: definition.columns,
    rows: documents.map((item: any) => ({
      id: item._id.toString(), href: `/admin/quotes/${item._id}`, createdAt: item.createdAt, number: item.quoteNumber, customer: entityName(item.customerId, item.contactName || 'Sin cliente'),
      salon: entityName(item.salonId, 'Sin salón'), eventType: item.eventType || 'Sin especificar', eventDate: item.eventDate, status: item.status,
      package: item.packageName || 'Personalizado', amount: item.totalAmount ?? 0, sentAt: item.sentAt, acceptedAt: item.acceptedAt,
    })),
    summary: [
      { id: 'total', label: 'Presupuestos', value: totalItems, format: 'number' }, { id: 'quoted', label: 'Monto presupuestado', value: aggregate.amount ?? 0, format: 'currency' },
      { id: 'accepted', label: 'Monto aceptado', value: aggregate.acceptedAmount ?? 0, format: 'currency' },
      { id: 'rate', label: 'Tasa de aceptación', value: aggregate.sent ? ((aggregate.accepted ?? 0) / aggregate.sent) * 100 : 0, format: 'percentage' },
    ],
    breakdowns: { status: groupedStatus },
    meta: commonMeta(definition, request, totalItems, page, limit, 'createdAt'),
  };
}

async function eventsReport(request: Request, definition: ReportDefinition, exportAll: boolean) {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const { page, limit, skip } = pagination(request, exportAll);
  const query: any = { deletedAt: null, ...scope.match(), ...periodMatch(period, 'eventDate') };
  if (request.query.status) query.status = String(request.query.status);
  if (request.query.eventType) query.eventType = String(request.query.eventType);
  const search = String(request.query.search || '').trim();
  if (search) query.$or = [{ eventName: new RegExp(escapeRegex(search), 'i') }, { eventType: new RegExp(escapeRegex(search), 'i') }];
  const [documents, totalItems, groupedStatus, groupedSalon] = await Promise.all([
    Event.find(query).populate('salonId', 'name').populate('customerId', 'fullName').sort(sort(request, ['eventDate', 'createdAt', 'guestCount', 'status'], 'eventDate')).skip(skip).limit(limit).lean(),
    Event.countDocuments(query),
    Event.aggregate([{ $match: query }, { $group: { _id: '$status', value: { $sum: 1 } } }]),
    Event.aggregate([{ $match: query }, { $group: { _id: '$salonId', value: { $sum: 1 } } }]),
  ]);
  const eventIds = documents.map((item: any) => item._id);
  const [contracts, payments, staff, productionPlans] = await Promise.all([
    Contract.find({ deletedAt: null, eventId: { $in: eventIds }, status: { $nin: ['cancelled', 'superseded'] } }).select('eventId status paidAmount').lean(),
    Payment.aggregate([{ $match: { deletedAt: null, eventId: { $in: eventIds }, affectsContractBalance: true } }, { $group: { _id: '$eventId', paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] }, 0] } }, overdue: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'pending'] }, { $lt: ['$dueDate', new Date()] }] }, '$amount', 0] } } } }]),
    EventStaffAssignment.aggregate([{ $match: { deletedAt: null, eventId: { $in: eventIds }, status: { $nin: ['cancelled', 'no_show'] } } }, { $group: { _id: '$eventId', value: { $sum: 1 } } }]),
    ProductionPlan.find({ deletedAt: null, isCurrent: true, eventId: { $in: eventIds } }).select('eventId status').lean(),
  ]);
  const contractMap = new Map(contracts.map((item: any) => [item.eventId.toString(), item]));
  const paymentMap = new Map(payments.map((item: any) => [item._id.toString(), item]));
  const staffMap = new Map(staff.map((item: any) => [item._id.toString(), item.value]));
  const productionMap = new Map(productionPlans.map((item: any) => [item.eventId.toString(), item.status]));
  return {
    columns: definition.columns,
    rows: documents.map((item: any) => {
      const id = item._id.toString(); const payment: any = paymentMap.get(id); const contract: any = contractMap.get(id);
      return { id, href: `/admin/events/${id}`, eventDate: item.eventDate, name: item.eventName || item.eventType || 'Evento', customer: entityName(item.customerId), salon: entityName(item.salonId, 'Sin salón'), eventType: item.eventType || 'Sin especificar', status: item.status, guestCount: item.guestCount ?? 0, contractStatus: contract?.status || 'missing', paidAmount: payment?.paid ?? 0, overdueAmount: payment?.overdue ?? 0, staffCount: staffMap.get(id) ?? 0, productionStatus: productionMap.get(id) || 'not_generated' };
    }),
    summary: [
      { id: 'total', label: 'Eventos', value: totalItems, format: 'number' },
      { id: 'confirmed', label: 'Confirmados', value: groupedStatus.find((item: any) => item._id === 'confirmed')?.value ?? 0, format: 'number' },
      { id: 'cancelled', label: 'Cancelados', value: groupedStatus.find((item: any) => item._id === 'cancelled')?.value ?? 0, format: 'number' },
      { id: 'guests', label: 'Invitados en página', value: documents.reduce((sum: number, item: any) => sum + Number(item.guestCount ?? 0), 0), format: 'number', partial: totalItems > documents.length },
    ],
    breakdowns: { status: groupedStatus, salon: groupedSalon },
    meta: commonMeta(definition, request, totalItems, page, limit, 'eventDate'),
  };
}

async function contractsReport(request: Request, definition: ReportDefinition, exportAll: boolean) {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const { page, limit, skip } = pagination(request, exportAll);
  const attribution = request.query.attribution === 'approved' ? 'approvedAt' : 'createdAt';
  const query: any = { deletedAt: null, ...scope.match(), ...periodMatch(period, attribution) };
  if (request.query.status) query.status = String(request.query.status);
  const search = String(request.query.search || '').trim();
  if (search) query.contractNumber = new RegExp(escapeRegex(search), 'i');
  const [documents, totalItems, totals, groupedStatus] = await Promise.all([
    Contract.find(query).populate('salonId', 'name').populate('customerId', 'fullName').populate('eventId', 'eventName eventType eventDate').sort(sort(request, ['createdAt', 'approvedAt', 'totalAmount', 'balanceAmount', 'status'], attribution)).skip(skip).limit(limit).lean(),
    Contract.countDocuments(query),
    Contract.aggregate([{ $match: query }, { $group: { _id: null, total: { $sum: '$totalAmount' }, paid: { $sum: '$paidAmount' }, balance: { $sum: '$balanceAmount' } } }]),
    Contract.aggregate([{ $match: query }, { $group: { _id: '$status', value: { $sum: 1 } } }]),
  ]);
  const contractIds = documents.map((item: any) => item._id);
  const paymentAggregates = await Payment.aggregate([
    { $match: { deletedAt: null, contractId: { $in: contractIds }, affectsContractBalance: true, status: 'pending' } },
    { $group: { _id: '$contractId', installments: { $sum: 1 }, overdueAmount: { $sum: { $cond: [{ $lt: ['$dueDate', new Date()] }, '$amount', 0] } }, nextDueDate: { $min: '$dueDate' } } },
  ]);
  const paymentMap = new Map(paymentAggregates.map((item: any) => [item._id.toString(), item]));
  const aggregate = totals[0] ?? {};
  return {
    columns: definition.columns,
    rows: documents.map((item: any) => {
      const due: any = paymentMap.get(item._id.toString());
      return { id: item._id.toString(), href: `/admin/contracts/${item._id}`, createdAt: item.createdAt, number: item.contractNumber, customer: entityName(item.customerId), event: entityName(item.eventId, 'Sin evento'), eventDate: item.eventId?.eventDate, salon: entityName(item.salonId, 'Sin salón'), status: item.status, approvedAt: item.approvedAt, totalAmount: item.totalAmount ?? 0, depositAmount: item.paymentAgreementSnapshot?.depositAmount ?? item.securityDeposit?.amount ?? 0, paidAmount: item.paidAmount ?? 0, balanceAmount: item.balanceAmount ?? 0, overdueAmount: due?.overdueAmount ?? 0, installments: due?.installments ?? 0, nextDueDate: due?.nextDueDate };
    }),
    summary: [
      { id: 'count', label: 'Contratos', value: totalItems, format: 'number' }, { id: 'total', label: 'Total contratado', value: aggregate.total ?? 0, format: 'currency' },
      { id: 'paid', label: 'Total cobrado', value: aggregate.paid ?? 0, format: 'currency' }, { id: 'balance', label: 'Saldo pendiente', value: aggregate.balance ?? 0, format: 'currency' },
    ],
    breakdowns: { status: groupedStatus },
    meta: commonMeta(definition, request, totalItems, page, limit, attribution),
  };
}

async function paymentsReport(request: Request, definition: ReportDefinition, exportAll: boolean) {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const { page, limit, skip } = pagination(request, exportAll);
  const attribution = ['created', 'paid', 'due'].includes(String(request.query.attribution)) ? String(request.query.attribution) : 'effective';
  const query: any = { deletedAt: null, ...scope.match() };
  const conditions: any[] = [];
  if (attribution === 'created') conditions.push({ createdAt: range(period) });
  else if (attribution === 'paid') conditions.push({ paidAt: range(period) });
  else if (attribution === 'due') conditions.push({ dueDate: range(period) });
  else conditions.push({ $or: [{ status: 'paid', paidAt: range(period) }, { status: { $ne: 'paid' }, dueDate: range(period) }] });
  if (request.query.status) query.status = String(request.query.status);
  if (request.query.method) query.method = String(request.query.method);
  if (request.query.type) query.type = String(request.query.type);
  const search = String(request.query.search || '').trim();
  if (search) conditions.push({ $or: [{ paymentNumber: new RegExp(escapeRegex(search), 'i') }, { reference: new RegExp(escapeRegex(search), 'i') }] });
  if (conditions.length) query.$and = conditions;
  const fallbackSort = attribution === 'due' ? 'dueDate' : attribution === 'created' ? 'createdAt' : 'paidAt';
  const [documents, totalItems, totals, groupedStatus, groupedMethod] = await Promise.all([
    Payment.find(query).populate('salonId', 'name').populate('customerId', 'fullName').populate('eventId', 'eventName eventType').sort(sort(request, ['createdAt', 'paidAt', 'dueDate', 'amount', 'status'], fallbackSort)).skip(skip).limit(limit).lean(),
    Payment.countDocuments(query),
    Payment.aggregate([{ $match: query }, { $group: { _id: null, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, { $cond: [{ $eq: ['$type', 'refund'] }, { $multiply: ['$amount', -1] }, '$amount'] }, 0] } }, pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }, overdue: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'pending'] }, { $lt: ['$dueDate', new Date()] }] }, '$amount', 0] } } } }]),
    Payment.aggregate([{ $match: query }, { $group: { _id: '$status', value: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: query }, { $group: { _id: { $ifNull: ['$method', 'not_set'] }, value: { $sum: '$amount' } } }]),
  ]);
  const aggregate = totals[0] ?? {};
  return {
    columns: definition.columns,
    rows: documents.map((item: any) => ({ id: item._id.toString(), href: `/admin/payments/${item._id}`, date: attribution === 'due' ? item.dueDate : attribution === 'created' ? item.createdAt : item.paidAt || item.dueDate || item.createdAt, number: item.paymentNumber, customer: entityName(item.customerId), event: entityName(item.eventId, 'Sin evento'), salon: entityName(item.salonId, 'Sin salón'), type: item.type, method: item.method || 'not_set', status: item.status, dueDate: item.dueDate, amount: item.amount ?? 0, receipt: item.receiptNumber || (item.receiptPdfSecureUrl ? 'Disponible' : 'Pendiente') })),
    summary: [
      { id: 'count', label: 'Movimientos', value: totalItems, format: 'number' }, { id: 'paid', label: 'Cobrado neto', value: aggregate.paid ?? 0, format: 'currency' },
      { id: 'pending', label: 'Pendiente', value: aggregate.pending ?? 0, format: 'currency' }, { id: 'overdue', label: 'Vencido', value: aggregate.overdue ?? 0, format: 'currency' },
    ],
    breakdowns: { status: groupedStatus, method: groupedMethod },
    meta: commonMeta(definition, request, totalItems, page, limit, attribution),
  };
}

async function expensesReport(request: Request, definition: ReportDefinition, exportAll: boolean) {
  const period = parseReportPeriod(request.query);
  const scope = resolveReportScope(request);
  const { page, limit, skip } = pagination(request, exportAll);
  const attribution = ['created', 'paid', 'date'].includes(String(request.query.attribution)) ? String(request.query.attribution) : 'date';
  const attributionField = attribution === 'created' ? 'createdAt' : attribution === 'paid' ? 'paidAt' : 'date';
  const query: any = { deletedAt: null, ...scope.match(), ...periodMatch(period, attributionField) };
  if (request.query.status) query.status = String(request.query.status);
  if (request.query.categoryId) query.categoryId = String(request.query.categoryId);
  const search = String(request.query.search || '').trim();
  if (search) query.description = new RegExp(escapeRegex(search), 'i');
  const [documents, totalItems, totals, rawCategories] = await Promise.all([
    Expense.find(query).populate('salonId', 'name').populate('eventId', 'eventName eventType').populate('supplierId', 'name companyName').populate('categoryId', 'name code').sort(sort(request, ['date', 'createdAt', 'paidAt', 'amount', 'status'], attributionField)).skip(skip).limit(limit).lean(),
    Expense.countDocuments(query),
    Expense.aggregate([{ $match: query }, { $group: { _id: null, total: { $sum: '$amount' }, paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } } } }]),
    Expense.aggregate([{ $match: query }, { $group: { _id: { categoryId: '$categoryId', legacy: '$category' }, value: { $sum: '$amount' } } }, { $sort: { value: -1 } }]),
  ]);
  const categoryIds = rawCategories.map((item: any) => item._id?.categoryId).filter(Boolean);
  const categoryDocuments = await ExpenseCategory.find({ _id: { $in: categoryIds }, deletedAt: null }).select('name code').lean();
  const categoryNames = new Map(categoryDocuments.map((item: any) => [item._id.toString(), item.name]));
  const categories = rawCategories.map((item: any) => {
    const categoryId = item._id?.categoryId?.toString?.();
    return { _id: categoryId || item._id?.legacy || 'uncategorized', label: categoryId ? categoryNames.get(categoryId) || 'Categoría no disponible' : item._id?.legacy || 'Sin categoría', value: item.value };
  });
  const aggregate = totals[0] ?? {};
  return {
    columns: definition.columns,
    rows: documents.map((item: any) => ({ id: item._id.toString(), date: item.date || item.paidAt || item.createdAt, description: item.description || item.notes || 'Gasto', category: item.categoryId?.name || item.category || 'Sin categoría', salon: entityName(item.salonId, 'Sin salón'), event: entityName(item.eventId, 'Sin evento'), supplier: entityName(item.supplierId, 'Sin proveedor'), status: item.status, amount: item.amount ?? 0 })),
    summary: [
      { id: 'count', label: 'Gastos', value: totalItems, format: 'number' }, { id: 'total', label: 'Total registrado', value: aggregate.total ?? 0, format: 'currency' },
      { id: 'paid', label: 'Total pagado', value: aggregate.paid ?? 0, format: 'currency' },
    ],
    breakdowns: { category: categories },
    meta: commonMeta(definition, request, totalItems, page, limit, attribution),
  };
}

export function availableReports(request: Request) {
  return reportDefinitions.filter((item) => userHasPermission(request.user!, item.permission)).map(({ permission: _permission, ...item }) => item);
}

export async function getReport(request: Request, key: string, exportAll = false): Promise<any> {
  const definition = ensureReportAccess(request, key);
  if (key === 'leads') return leadsReport(request, definition, exportAll);
  if (key === 'quotes') return quotesReport(request, definition, exportAll);
  if (key === 'events') return eventsReport(request, definition, exportAll);
  if (key === 'contracts') return contractsReport(request, definition, exportAll);
  if (key === 'payments') return paymentsReport(request, definition, exportAll);
  if (key === 'expenses') return expensesReport(request, definition, exportAll);
  throw new ApiError(404, 'REPORT_NOT_FOUND');
}

function exportValue(value: unknown, format?: Column['format']) {
  if (value === null || value === undefined || value === '') return '';
  if (format === 'date') {
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(parsed);
  }
  if (typeof value === 'number') return String(value);
  return String(value);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function reportCsv(report: any) {
  const lines = [
    report.columns.map((column: Column) => csvCell(column.label)).join(','),
    ...report.rows.map((row: any) => report.columns.map((column: Column) => csvCell(exportValue(row[column.key], column.format))).join(',')),
  ];
  return `\uFEFF${lines.join('\r\n')}`;
}

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function reportExcelXml(report: any) {
  const row = (cells: string[]) => `<Row>${cells.map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`).join('')}</Row>`;
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${xmlEscape(report.meta.report.title.slice(0, 31))}"><Table>${row(report.columns.map((column: Column) => column.label))}${report.rows.map((item: any) => row(report.columns.map((column: Column) => exportValue(item[column.key], column.format)))).join('')}</Table></Worksheet></Workbook>`;
}
