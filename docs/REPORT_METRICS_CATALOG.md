# Catálogo de métricas

| Métrica | Atribución | Fórmula |
| --- | --- | --- |
| Leads nuevos | `Lead.createdAt` | cantidad creada en el período |
| Leads pendientes | `Lead.createdAt` | estados comerciales todavía accionables |
| Presupuestos enviados | `Quote.sentAt` | cantidad enviada |
| Presupuestos aceptados | `Quote.acceptedAt` | cantidad aceptada |
| Tasa de aceptación | `Quote.sentAt` | aceptados / enviados × 100 |
| Eventos confirmados | `Event.eventDate` | eventos confirmados del período |
| Contratado | `Contract.createdAt` | suma de contratos vigentes |
| Cobrado | `Payment.paidAt` | pagos confirmados menos devoluciones |
| Saldo vencido | `Payment.dueDate` | cuotas pendientes con vencimiento anterior a hoy |
| Gastos | `Expense.date`/`paidAt` | suma de gastos no cancelados |
| Margen estimado | fecha de evento | contratado menos costo estimado |
| Margen real | fecha de evento | cobrado menos costo real |
| Producción pendiente | `ProductionPlan.eventDate` | eventos sin plan + planes vigentes no cerrados |

Zona horaria funcional: `America/Argentina/Buenos_Aires`. Persistencia: UTC.
