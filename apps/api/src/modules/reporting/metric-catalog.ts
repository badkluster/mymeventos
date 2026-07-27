export type MetricFormat = 'integer' | 'percentage' | 'currency' | 'decimal';

export type MetricDefinition = {
  id: string;
  label: string;
  description: string;
  source: string;
  formula: string;
  attributionDate: string;
  format: MetricFormat;
  financial?: boolean;
  drillDownHref: string;
};

export const dashboardMetricDefinitions: MetricDefinition[] = [
  { id: 'leads.new', label: 'Leads nuevos', description: 'Leads creados dentro del período seleccionado.', source: 'Lead', formula: 'count(Lead.createdAt within period)', attributionDate: 'createdAt', format: 'integer', drillDownHref: '/admin/leads' },
  { id: 'leads.pending', label: 'Leads pendientes', description: 'Estado actual de todos los leads que todavía requieren gestión, aunque hayan sido creados antes del período.', source: 'Lead', formula: 'count(Lead.status in new, contacted, follow_up, quote_sent, negotiation)', attributionDate: 'current_snapshot', format: 'integer', drillDownHref: '/admin/leads?status=pending' },
  { id: 'quotes.sent', label: 'Presupuestos enviados', description: 'Presupuestos enviados durante el período.', source: 'Quote', formula: 'count(Quote.sentAt within period)', attributionDate: 'sentAt', format: 'integer', drillDownHref: '/admin/quotes?status=sent' },
  { id: 'quotes.accepted', label: 'Presupuestos aceptados', description: 'Presupuestos aceptados durante el período.', source: 'Quote', formula: 'count(Quote.acceptedAt within period)', attributionDate: 'acceptedAt', format: 'integer', drillDownHref: '/admin/quotes?status=accepted' },
  { id: 'quotes.acceptanceRate', label: 'Tasa de aceptación', description: 'Porcentaje de presupuestos enviados en el período que se encuentran aceptados o convertidos.', source: 'Quote', formula: 'accepted sent quotes / sent quotes * 100', attributionDate: 'sentAt', format: 'percentage', drillDownHref: '/admin/reports/quotes' },
  { id: 'events.confirmed', label: 'Eventos confirmados', description: 'Eventos confirmados cuya fecha ocurre dentro del período.', source: 'Event', formula: 'count(Event.eventDate within period AND status = confirmed)', attributionDate: 'eventDate', format: 'integer', drillDownHref: '/admin/events?status=confirmed' },
  { id: 'events.upcoming', label: 'Eventos próximos', description: 'Estado actual de eventos activos de los próximos 30 días desde hoy.', source: 'Event', formula: 'count(Event.eventDate between today and today + 30 days AND active status)', attributionDate: 'current_snapshot', format: 'integer', drillDownHref: '/admin/events?scope=upcoming' },
  { id: 'contracts.total', label: 'Total contratado', description: 'Suma de contratos aprobados durante el período.', source: 'Contract', formula: 'sum(Contract.totalAmount where status = approved AND approvedAt within period)', attributionDate: 'approvedAt', format: 'currency', financial: true, drillDownHref: '/admin/reports/contracts?attribution=approved&status=approved' },
  { id: 'payments.collected', label: 'Total cobrado', description: 'Pagos confirmados cobrados durante el período, netos de devoluciones.', source: 'Payment', formula: 'sum(paid payments) - sum(paid refunds)', attributionDate: 'paidAt', format: 'currency', financial: true, drillDownHref: '/admin/reports/payments?status=paid&attribution=paid' },
  { id: 'payments.overdue', label: 'Saldo vencido', description: 'Estado actual de cuotas pendientes cuya fecha de vencimiento ya pasó.', source: 'Payment', formula: 'sum(Payment.amount where status = pending AND dueDate < now)', attributionDate: 'current_snapshot', format: 'currency', financial: true, drillDownHref: '/admin/reports/payments?status=pending&attribution=due' },
  { id: 'expenses.paid', label: 'Gastos pagados', description: 'Gastos efectivamente pagados dentro del período.', source: 'Expense', formula: 'sum(Expense.amount where status = paid AND paidAt within period)', attributionDate: 'paidAt', format: 'currency', financial: true, drillDownHref: '/admin/reports/expenses?status=paid&attribution=paid' },
  { id: 'production.pending', label: 'Producciones pendientes', description: 'Eventos activos del período sin producción generada o con un plan estructurado pendiente.', source: 'ProductionPlan + ProductionItem', formula: 'count(active events without a current plan) + count(current plans not closed)', attributionDate: 'eventDate', format: 'integer', drillDownHref: '/admin/production?status=pending' },
];
